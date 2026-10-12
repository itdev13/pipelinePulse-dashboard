import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DatePicker, Select } from 'antd'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
import { htmlToText } from '../../utils/sanitiseHtml'
import ViewSwitch from '../shared/ViewSwitch'
import WorkFilters from '../shared/WorkFilters'
import { tasksAPI } from '../../api/tasks'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import { useAuth } from '../../context/AuthContext'
import { OwnerFilter, SortSelect, defaultOwner, resolveOwner } from '../shared/ListFilters'
import TaskEditor from '../shared/TaskEditor'
import TaskDealsPopover from '../shared/TaskDealsPopover'
import { useLinkTargets } from '../../hooks/useLinkTargets'
import ConfirmDialog from '../shared/ConfirmDialog'
import {
  Shell, Panel, DealPill, RowAction,
  PrimaryAction, NoteChip, StateMessage, LoadMore,
  RichBody, Truncate, formatDate, formatDue, relativeTime
} from '../shared/ListChrome'

// Tasks — v5.
//
// Changes from v4: the title is a button that opens the task on the deal hub,
// contact and deal chips sit on the right, linked notes render as gold chips on
// their own line beneath the row, and Add task sits on the panel toolbar.
//
// A task with no deal shows a "No deal" chip rather than hiding the slot — v5
// makes unattached tasks a first-class state, so the absence has to be visible.

const DUE_FILTERS = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['week', 'Due this week'],
  ['month', 'Due next 30 days'],
  // Reveals the range picker beside this select. The presets answer "what is
  // coming up"; a range answers "what happened in March", which no relative
  // window can express.
  ['custom', 'Custom range']
]

// Open is the default because the queue is a to-do list, but a completed task
// is the record of what was actually done — worth being able to look back at,
// and the only way to confirm a task the agent created was seen to.
const STATUS_FILTERS = [
  ['open', 'Open'],
  ['completed', 'Completed'],
  ['all', 'All']
]

// Adding or removing a task's deals is switched off in the UI.
//
// GHL refuses the write outright — not a scope, a platform restriction:
//
//   POST /associations/relations
//     → 400 {"message":"Relations cannot be modified via OAuth channel"}
//
// That is restrictOAuthChannel, the same block that stops marketplace apps
// restoring a deleted note. There is no scope to add and no retry that
// succeeds, so the control could be operated but never saved.
//
// READING is unaffected: the deals a task is linked to still come from the
// task payload (taskWriter mirrors them into task_relations), so the chip and
// the +N count stay accurate. Only changing them from here is gone — it has
// to be done in the CRM.
//
// Everything behind this is intact: the popover component, the routes, the
// association calls, and the webhook handlers. Flip to true if GHL opens the
// endpoint to OAuth apps.
const TASK_DEAL_EDITING = false


// A toolbar control with its label ABOVE it.
//
// flex:none on the stack, so a label and its control always wrap together —
// inline labels let a row break between "ASSIGNEE" and the select it names.
function LabelledControl({ label, children }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 'none' }}>
      <span style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '.05em',
        textTransform: 'uppercase', color: '#4a515c'
      }}>
        {label}
      </span>
      {children}
    </span>
  )
}

// Search by WHO a task is about, not what it is called.
//
// Matches contact, deal and business name — a rep hunting "Cedarstone" wants
// that company's tasks whatever each one is titled. The filtering happens on
// the server (routes/tasks.js): the list is paged, so a client-side filter
// would only search the rows already loaded and silently miss page two.
function TaskSearch({ value, onChange }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span className="ms" style={{
        position: 'absolute', left: 10, fontSize: 18,
        color: 'var(--text-faint)', pointerEvents: 'none'
      }}>
        search
      </span>
      <input
        className="pp-task-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search business, contact or deal"
        style={{
          width: 260, maxWidth: 360, flex: '1 1 260px',
          height: 34, padding: '0 32px 0 34px',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
          background: '#fff', fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-md)', color: 'var(--text-heading)'
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          title="Clear the search"
          style={{
            position: 'absolute', right: 8, display: 'inline-flex',
            border: 'none', background: 'none', padding: 0,
            color: 'var(--text-faint)', cursor: 'pointer'
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>close</span>
        </button>
      )}
    </span>
  )
}

export default function TasksTab({ onOpenDeal, onOpenContact, onOpenBusiness }) {
  // Remembered across tab switches — see useTabState. Clicking a task through
  // to its deal and coming back used to reset this to 'all'.
  const [dueFilter, setDueFilter] = useTabState('tasks', 'dueFilter', 'all')
  // The custom date range, as ['YYYY-MM-DD', 'YYYY-MM-DD'] or null.
  //
  // Stored as STRINGS, not dayjs objects: useTabState persists through
  // localStorage, and a dayjs instance does not survive JSON — it would come
  // back as a plain object that throws the moment the picker calls .format().
  const [dueRange, setDueRange] = useTabState('tasks', 'dueRange', null)
  const [status, setStatus] = useTabState('tasks', 'status', 'open')
  // Per TAB, like every other filter here: stepping out to a deal and back
  // keeps the search you were in the middle of.
  const [q, setQ] = useTabState('tasks', 'q', '')
  const [toast, setToast] = useState(null)

  // Rows or a grid. Persisted: a display preference, not a navigation step, so
  // a rep who prefers the grid should not be handed rows every time they come
  // back to this tab.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('pp.tasks.view') || 'grid' } catch { return 'grid' }
  })
  useEffect(() => {
    try { localStorage.setItem('pp.tasks.view', view) } catch { /* private mode */ }
  }, [view])

  // Contact / deal filters. useTabState, not plain state: stepping out to a
  // deal or a contact and back should not discard them.
  const [filters, setFilters] = useTabState('tasks', 'filters', {})

  // Defaults to the signed-in user's own tasks, and REMEMBERS a change:
  // useTabState survives a tab switch and a reload for two hours, so a manager
  // who switches to "All owners" is not put back on Mine every visit.
  const { session } = useAuth()
  const [owner, setOwner] = useTabState('tasks', 'owner', defaultOwner(session))
  // Due date by default — a task list is for what is coming up. Created date
  // answers a different question ("what came in recently"), so it is an
  // option rather than a replacement. Persisted like every other filter.
  const [sort, setSort] = useTabState('tasks', 'sort', 'due')

  const fetchPage = useCallback(
    ({ cursor }) => tasksAPI.list({
      status, due: dueFilter, sort, limit: 20, cursor,
      // Omitted when empty so the request carries no q= at all, rather than
      // an empty one the route then has to treat as "match everything".
      ...(q.trim() ? { q: q.trim() } : {}),
      // Only sent with due=custom — the server ignores them otherwise, and
      // sending them regardless would make the request vary for no reason.
      dueFrom: dueFilter === 'custom' ? (dueRange?.[0] || undefined) : undefined,
      dueTo: dueFilter === 'custom' ? (dueRange?.[1] || undefined) : undefined,
      assignedTo: resolveOwner(owner),
      contactId: filters.contactId || undefined,
      dealId: filters.dealId || undefined
    }),
    [status, dueFilter, dueRange, filters, owner, session, sort, q]
  )
  // dueRange is a DEP: without it, picking a different range while already on
  // 'custom' leaves dueFilter unchanged, so page one is never refetched and
  // the list keeps showing the previous range.
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem, reload } =
    usePagedList({ fetchPage, key: 'tasks', deps: [status, dueFilter, dueRange, filters, owner, sort, q] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const tasks = items || []
  const openCount = tasks.length
  // The panel meta said "N open" whatever was on screen, so the Completed
  // filter read "20+ open" over a list of finished tasks.
  const countNoun =
    status === 'open' ? 'open' : status === 'completed' ? 'completed' : 'tasks'

  // Tick straight away, then write. The round trip to the CRM and back takes a
  // moment (their API waits ~2s internally to keep its own stores in sync), and
  // a checkbox that doesn't move until then feels broken.
  //
  // On failure the tick is rolled back and the reason is shown — a box that
  // silently didn't save is worse than one that visibly bounces and says why.
  const [saving, setSaving] = useState(() => new Set())
  // null = closed. { task } = editing that one; { task: null } = creating.
  const [editor, setEditor] = useState(null)
  // Which task's deal popover is open, by id. One at a time — two open
  // popovers in a scrolling list would overlap each other.
  //
  // Declared BEFORE linkTargets, which reads it: `const` is not hoisted, so
  // the other order throws on first render.
  const [dealsFor, setDealsFor] = useState(null)
  // One anchor element per row, keyed by task id. A single useRef holding a
  // map rather than a hook per row — hooks cannot be called inside a map, and
  // the popover is portalled so it needs a real element to position against.
  const anchors = useRef({})
  // Deals and companies for the link pickers. Lazy: nothing is fetched until
  // an editor or the deals popover opens, so reading the list costs nothing
  // extra. The popover needs the same list — without it its picker opens with
  // no options and the rep has to type to add a deal already on screen.
  const linkTargets = useLinkTargets(!!editor || !!dealsFor)
  // The task queued for deletion, and any failure from trying.
  const [confirming, setConfirming] = useState(null)
  const [confirmError, setConfirmError] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const removeTask = async () => {
    const t = confirming
    if (!t || deleting) return
    setDeleting(t.id)
    setConfirmError(null)
    try {
      await tasksAPI.remove(t.id)
      setConfirming(null)
      reload()
      setToast('Task deleted')
      window.setTimeout(() => setToast(null), 2200)
    } catch (err) {
      // In the dialog, which stays open, so the reason is where the click was.
      setConfirmError(err.message || 'Could not delete that task')
    } finally {
      setDeleting(null)
    }
  }

  const toggle = async (t) => {
    if (saving.has(t.id)) return          // don't race a click with itself
    const was = t.status
    const next = was === 'open'

    setSaving((s) => new Set(s).add(t.id))
    patchItem((x) => x.id === t.id, { status: next ? 'completed' : 'open' })

    try {
      const { task } = await tasksAPI.setCompleted(t.id, next)
      // Apply what the CRM echoed rather than what we assumed. If it stored
      // something different, the row should show that.
      patchItem((x) => x.id === t.id, {
        status: task?.completed === false ? 'open' : 'completed',
        completedAt: task?.completed ? (t.completedAt || new Date().toISOString()) : null
      })
      setToast(next ? 'Task completed' : 'Task reopened')
      window.setTimeout(() => setToast(null), 1600)
    } catch (err) {
      patchItem((x) => x.id === t.id, { status: was })
      setToast(err.message || 'Could not save that — try again')
      window.setTimeout(() => setToast(null), 3800)
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(t.id); return n })
    }
  }

  return (
    <Shell>
      {/* No PageHeader. It sat above the panel repeating the tab name the
          nav already shows, with a subtitle explaining what a task list is —
          and everything it used to carry (Add task, the filters, the view
          switch) now lives on the panel itself. */}
      {/* A SECTION CARD, not the shared Panel.
          The spec gives this page its own identity: a solid burnt-orange
          header carrying only the icon, title and count, with every control
          in a band beneath it. The shared Panel puts controls in the header
          and tints it rather than filling it — right for the other tabs,
          wrong here. Built directly rather than adding a fourth mode to
          Panel that only one page would use. */}
      <section style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        background: '#fff',
        overflow: 'hidden'
      }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '12px 16px',
          background: 'var(--tasks-header)',
          borderBottom: '1px solid var(--tasks-header-border)'
        }}>
          <span className="ms" style={{ fontSize: 19, color: '#fff' }}>task_alt</span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>Tasks</h2>
          {/* The count follows the filters, so it answers "how many am I
              looking at" rather than "how many exist". */}
          {!loading && (
            <span
              title={`${openCount} ${countNoun}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 24, height: 22, padding: '0 8px', flex: 'none',
                borderRadius: 'var(--radius-pill)',
                background: 'rgba(255,255,255,.22)',
                fontSize: 13, fontWeight: 600, color: '#fff',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {openCount}{hasMore ? '+' : ''}
            </span>
          )}
        </header>

        {/* The toolbar band. Darker than the list area behind the cards, so
            the controls read as chrome rather than as another card. */}
        <div className="pp-task-toolbar" style={{
          display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
          padding: '12px 14px',
          background: 'var(--gray-100)',
          borderBottom: '1px solid var(--border-default)'
        }}>
          <LabelledControl label="Search">
            <TaskSearch value={q} onChange={setQ} />
          </LabelledControl>

          <LabelledControl label="Status">
            <Select
              value={status} onChange={setStatus}
              options={STATUS_FILTERS.map(([value, label]) => ({ value, label }))}
              popupClassName="pp-menu" style={{ width: 150 }}
              styles={{ root: { height: 34 } }}
            />
          </LabelledControl>

          <LabelledControl label="Assignee">
            {/* `bare`: the label is stacked above by LabelledControl, so
                this must not draw its own beside the select. */}
            <OwnerFilter value={owner} onChange={setOwner} width={190} bare />
          </LabelledControl>

          <LabelledControl label="Due">
            <Select
              value={dueFilter} onChange={setDueFilter}
              options={DUE_FILTERS.map(([value, label]) => ({ value, label }))}
              popupClassName="pp-menu" style={{ width: 180 }}
              styles={{ root: { height: 34 } }}
            />
          </LabelledControl>

          {/* Only once 'Custom range' is chosen. A range picker sitting
              permanently beside a preset select reads as a second, competing
              filter — and most of the time it would be inert.

              Kept when the toolbar was rebuilt: the spec lists four Due
              presets and does not mention this, but it is existing behaviour
              a rep relies on and the presets cannot express an arbitrary
              window. */}
          {dueFilter === 'custom' && (
            <LabelledControl label="Range">
              <RangePicker
                // Same portal class as every other calendar here: antd renders
                // this to document.body, outside [data-dealhub], where none of
                // the design tokens resolve. See .pp-cal.
                popupClassName="pp-cal"
                value={dueRange ? [
                  dueRange[0] ? dayjs(dueRange[0]) : null,
                  dueRange[1] ? dayjs(dueRange[1]) : null
                ] : null}
                onChange={(range) => {
                  // Clearing keeps the filter on 'custom' with no bounds —
                  // "every dated task", which is what the picker now shows,
                  // rather than silently reverting to a preset nobody picked.
                  setDueRange(range && (range[0] || range[1])
                    ? [
                        range[0] ? range[0].format('YYYY-MM-DD') : null,
                        range[1] ? range[1].format('YYYY-MM-DD') : null
                      ]
                    : null)
                }}
                format="D MMM YYYY"
                allowEmpty={[true, true]}
                placeholder={['From', 'To']}
                style={{ width: 260 }}
                styles={{ root: { height: 34 } }}
              />
            </LabelledControl>
          )}

          {/* The SHARED control, not a second hand-rolled one: two copies
              drift in width, height and wording the first time either is
              touched. It also carries the direction toggle that only applies
              to created date. */}
          <LabelledControl label="Sort">
            <SortSelect
              value={sort} onChange={setSort}
              // The spec lists "Due date | Created". Created keeps its
              // direction here because a date sorted one way only is half a
              // control — and the existing behaviour, which reps rely on.
              // Due date has no direction: overdue first is the only order
              // a task list is read in.
              options={[
                { value: 'due', label: 'Due date' },
                { value: 'created_desc', label: 'Created, newest' },
                { value: 'created_asc', label: 'Created, oldest' }
              ]}
              width={150} bare
            />
          </LabelledControl>

          {/* ONE GROUP, pushed right. flex:none and nowrap so that when the
              band runs out of width the three drop to the next line together
              rather than Add task stranding itself. */}
          <span style={{
            marginLeft: 'auto', flex: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap'
          }}>
            <WorkFilters filters={filters} onChange={setFilters} noun="tasks" />
            <ViewSwitch
              value={view} onChange={setView}
              options={[
                { id: 'grid', icon: 'grid_view', label: 'Grid' },
                { id: 'rows', icon: 'view_agenda', label: 'Rows' }
              ]}
            />
            <button
              onClick={() => setEditor({ task: null })}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 38, padding: '0 16px', flex: 'none',
                border: 'none', borderRadius: 'var(--radius-pill)',
                background: 'var(--tasks-header)', color: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                fontWeight: 600, cursor: 'pointer'
              }}
            >
              <span className="ms" style={{ fontSize: 17 }}>add</span>Add task
            </button>
          </span>
        </div>
        <StateMessage
          loading={loading}
          error={error}
          empty={!loading && openCount === 0}
          emptyText={
            status === 'completed'
              ? (dueFilter === 'all'
                  ? 'Nothing completed yet.'
                  : 'Nothing completed matches this due filter.')
              : dueFilter === 'all'
                ? 'No open tasks — you are clear.'
                : 'Nothing matches these filters — you are clear.'
          }
          loadingText="Loading tasks…"
        />

        {/* GRID lays TaskCards out in a responsive grid; ROWS stack the
            five-column row layout.

            auto-fill with a minimum width: the column count follows the
            window rather than a breakpoint, so a wide screen shows more and a
            narrow one shows one, with no layout that fits neither.

            460px minimum: the card puts each linked record and its "View X"
            pill on one line, and the footer carries the date plus three
            controls — at 340px both wrapped. min() keeps a single column
            from overflowing a narrow window. */}
        {/* GREY BEHIND THE LIST, in both views.
            The cards were white on white, so each one's edge was carrying the
            whole job of separating it from the page. On grey they read as
            cards sitting on a surface, which is what they are.
            Rows get the same padding and gap as the grid: the only difference
            between the two views should be how many fit across. */}
        <div style={{
          background: 'var(--gray-50)',
          padding: 'var(--space-3)',
          display: view === 'grid' ? 'grid' : 'flex',
          ...(view === 'grid'
            ? { gridTemplateColumns: 'repeat(auto-fill, minmax(min(460px, 100%), 1fr))' }
            : { flexDirection: 'column' }),
          gap: 'var(--space-3)'
        }}>
        {tasks.map((t) => {
          const done = t.status !== 'open'
          // A completed task isn't overdue, whatever its due date says.
          const overdue = t.overdue && !done
          const dueToday = t.dueToday && !t.overdue && !done
          // deals[] falls back to the scalar server-side, so this counts 1
          // for an ordinary single-deal task and 0 for an unlinked one.
          const dealCount = t.deals?.length || 0
          const hasChips = t.noteChips?.length > 0

          // GRID: its own component, built to the October 2026 card design.
          // The rows layout below is a five-column grid and the card a stacked
          // header/body/links/footer — sharing one markup tree between them
          // meant every element carried a branch for each view.
          if (view === 'grid') {
            return (
              <TaskCard
                key={t.id}
                task={t}
                done={done}
                overdue={overdue}
                dueToday={dueToday}
                busy={saving.has(t.id)}
                onToggle={() => toggle(t)}
                onEdit={() => setEditor({ task: t })}
                onDelete={() => { setConfirmError(null); setConfirming(t) }}
                onOpenDeal={onOpenDeal}
                onOpenContact={onOpenContact}
                onOpenBusiness={onOpenBusiness}
              />
            )
          }

          // THE DUE DATE IS A SIBLING, NOT A CHILD OF THE TITLE COLUMN.
          //
          // It lived inside that column with `order: 2` on it, which did
          // nothing: `order` sorts SIBLINGS, and its siblings were the title
          // and the description. So the rows view rendered three grid items,
          // not four, and the date landed under the title with the edit and
          // delete buttons beside it — the reported bug.
          //
          // Hoisted to a variable so it is a real item of the row grid.
          // Edit and delete, in their own column at the row's right edge.
          const actions = (
            <>
              <RowAction
                icon="edit"
                title="Edit this task"
                onClick={() => setEditor({ task: t })}
              />
              <RowAction
                icon="close"
                danger
                title="Delete this task"
                onClick={() => { setConfirmError(null); setConfirming(t) }}
              />
            </>
          )

          const dueBlock = (
          <div
            style={{
              display: 'flex', flexWrap: 'wrap',
              // The SECOND grid column — the label above the date, which is
              // how the design stacks it. No `order` here: it is a direct
              // child of the row grid and falls in source position, which is
              // already second.
              flexDirection: 'column', alignItems: 'flex-start',
              gap: 2, marginTop: 0
            }}
          >
            {/* LABELLED in both views. A bare date says nothing about
                what it is — "14 Oct" could be when the task was made
                — and the calendar icon is what the design leads the
                line with. */}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              color: overdue ? 'var(--status-stuck)' : 'var(--text-muted)'
            }}>
              <span className="ms" style={{ fontSize: 15 }}>calendar_today</span>
              <span className="pp-label" style={{ marginBottom: 0, color: 'inherit' }}>
                Due date
              </span>
            </span>
            {/* Overdue is COLOUR on the due date, not a separate pill.
                With every task overdue, three red badges carried no
                information and were the loudest thing on the page —
                while the date they referred to sat in grey beside
                them. */}
            {/* A finished task doesn't owe a due date. Showing "due 12
                days ago" on something already done reads as a task
                still outstanding — say when it was completed instead. */}
            <span
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: overdue ? 600 : 400,
                color: done
                  ? 'var(--accent-pine-text)'
                  : overdue
                    ? 'var(--status-stuck-text)'
                    : dueToday ? 'var(--accent-gold-text)' : 'var(--text-muted)'
              }}
            >
              {done
                ? (t.completedAt
                    ? `completed ${relativeTime(t.completedAt)}`
                    : 'completed')
                : formatDue(t.dueAt) || 'No due date'}
            </span>
            {t.owner && (
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-faint)' }}>
                · {t.owner}
              </span>
            )}
          </div>
          )
          return (
            // No position/zIndex here: the popover renders in a body
            // portal, because this list's Panel sets `overflow: hidden` to
            // clip its rounded corners and was CLIPPING the popover instead.
            <div key={t.id}>
              <div
                style={{
                  position: 'relative',
                  // Columns — the linked records, the due date, then the
                  // title and its description. The design reads left-to-right
                  // as "who and what · when · what to do", and each column
                  // keeps its own left edge down the whole list.
                  display: 'grid',
                  // The link column is fixed so every "View CONTACT" button
                  // lands on the same x; the due column hugs its content; the
                  // title takes what is left.
                  // Five: tick · records · due · title+body · actions.
                  //
                  // NO `order` ANYWHERE. The children are written in the
                  // order they appear. The previous version moved them with
                  // `order` and shipped broken, because the due date was
                  // NESTED inside the title column — `order` sorts siblings,
                  // so it never became a column at all and the row rendered
                  // three items instead of five.
                  gridTemplateColumns: 'auto minmax(240px, 320px) minmax(104px, auto) minmax(0, 1fr) auto',
                  alignItems: 'start',
                  gap: 'var(--space-3)',
                  // Taller rows. At space-3 the three lines of a task —
                  // title, description, due date — were closer to each other
                  // than the rows were to their neighbours, so the list read
                  // as one dense block rather than a set of items.
                  padding: 'var(--space-4)',
                  // A CARD IN BOTH VIEWS.
                  //
                  // Rows used to be list items separated by a divider line.
                  // With a grey surface behind them a divider says nothing the
                  // gap does not already say, and it made a row look like part
                  // of a table while the grid's own items were cards. Rows and
                  // TaskCard share the border, radius and surface.
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-card)',
                  opacity: done ? 0.6 : 1,
                  transition: 'background 120ms ease'
                }}
                // A row is a target — the title opens the deal hub — so it
                // should say so on approach. Inline rather than a class: the
                // hover colour is the only state and a stylesheet rule for it
                // would sit far from the row it belongs to.
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-sunken)'
                }}
                // Back to the CARD surface, not transparent — transparent let
                // the grey list ground show through once the pointer left.
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--surface-card)'
                }}
              >
                {/* Rows lead with a standalone tick in its own column, as the
                    design does — a circle at the row's left edge, vertically
                    centred, separate from the edit and delete buttons at the
                    right. */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  alignSelf: 'center', flex: 'none'
                }}>
                  <CompleteToggle
                    done={done}
                    busy={saving.has(t.id)}
                    label={t.title || 'task'}
                    onToggle={() => toggle(t)}
                    compact
                  />
                </span>

                <div
                  style={{
                    display: 'flex', gap: 6, flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                    // Aligned to the TITLE's line rather than centred against
                    // the whole row: a task with a long description pushed its
                    // chips halfway down the row, so they no longer read as
                    // belonging to the title they describe.
                    alignItems: 'flex-start',
                    flex: 'none',
                    // SECOND column — placed by source order.
                    flexDirection: 'column', width: '100%'
                  }}
                >
                  {/* The task's linked records, one row each.
                      GHL names a new opportunity after its contact, so the
                      contact and the deal routinely hold the same string —
                      the contact row is dropped when it would just repeat the
                      deal's name, since the deal row already says who it is
                      AND which deal. */}
                  {(() => {
                    const contacts = (t.contacts?.length
                      ? t.contacts
                      : t.contact ? [t.contact] : []
                    ).filter((c) => !sameName(c.name, t.deal?.name))
                    const primaryContact = contacts[0] || null
                    return (
                      <>
                        <LinkedRow
                          icon="person"
                          name={primaryContact?.name}
                          emptyText="No contact"
                          tone={LINK_TONES.contact}
                          onOpen={primaryContact && onOpenContact
                            ? () => onOpenContact(primaryContact.id)
                            : undefined}
                        />
                        {/* The DEAL row takes the shared DealPill rather
                            than a LinkedRow button. Opening a deal has one
                            treatment across every surface in the app
                            (dealPill.test.mjs pins it) — a fourth one here
                            would make a rep learn the control twice. */}
                        <LinkedRow
                          icon="sell"
                          name={t.deal?.name}
                          emptyText="No deal"
                          action={(
                            <DealPill
                              name={t.deal?.name || 'No deal'}
                              empty={!t.deal}
                              compact
                              onClick={t.deal && onOpenDeal
                                ? () => onOpenDeal(t.deal.id)
                                : undefined}
                            />
                          )}
                        />
                        <LinkedRow
                          icon="business"
                          name={t.business?.name}
                          emptyText="No business"
                          tone={LINK_TONES.business}
                          onOpen={t.business && onOpenBusiness
                            ? () => onOpenBusiness(t.business.id)
                            : undefined}
                          last
                        />
                      </>
                    )
                  })()}
                  {dealCount > 1 && (
                    <span
                      title={`Linked to ${dealCount} deals`}
                      style={{
                        fontSize: 11, fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--text-muted)'
                      }}
                    >
                      +{dealCount - 1}
                    </span>
                  )}
                  {TASK_DEAL_EDITING && (
                  <span
                    ref={(el) => {
                      if (el) anchors.current[t.id] = el
                      else delete anchors.current[t.id]
                    }}
                    style={{ display: 'inline-flex' }}
                  >
                    <RowAction
                      icon="sell"
                      title={
                        dealCount
                          ? `Deals on this task (${dealCount})`
                          : 'Link this task to a deal'
                      }
                      onClick={() =>
                        setDealsFor(dealsFor === t.id ? null : t.id)}
                    />
                    {dealsFor === t.id && (
                      <TaskDealsPopover
                        task={t}
                        limit={t.dealLimit || 10}
                        seed={linkTargets.deals}
                        // A getter, not the element: the ref callback
                        // below populates the map during the same commit
                        // that mounts this child, so reading it here would
                        // hand over undefined.
                        getAnchor={() => anchors.current[t.id]}
                        onApply={(patch) =>
                          patchItem((it) => it.id === t.id, patch)}
                        onClose={() => setDealsFor(null)}
                      />
                    )}
                  </span>
                  )}

                </div>
                {/* The THIRD column, a sibling of the links block and the
                    title column so the grid can actually place it. */}
                {dueBlock}

                {/* FOURTH column — placed by source order. */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <button
                    onClick={() => t.deal && onOpenDeal && onOpenDeal(t.deal.id)}
                    title={t.deal ? 'Open this task on the deal hub' : undefined}
                    style={{
                      border: 'none', background: 'none', padding: 0,
                      textAlign: 'left',
                      cursor: t.deal ? 'pointer' : 'default',
                      fontFamily: 'var(--font-sans)',
                      // 17px against a 12px description — a 1.4x ratio, which
                      // is where a size difference starts reading as a
                      // hierarchy rather than a wobble. At 14px it didn't.
                      fontSize: 'var(--text-xl)', fontWeight: 600,
                      lineHeight: 1.3, letterSpacing: '-0.01em',
                      color: 'var(--text-heading)',
                      textDecoration: done ? 'line-through' : 'none',
                      // A title is whatever GHL holds, and that is not always
                      // prose — a task named with a raw record id
                      // ("Kf2bBEEvu8aJZ4Mo0Ikj") is one unbroken 20-character
                      // word that pushed the chips off the row. Wrap it rather
                      // than let it set the row's width.
                      maxWidth: '100%',
                      overflowWrap: 'anywhere'
                    }}
                  >
                    {t.title || '(untitled task)'}
                  </button>

                  {/* Muted, not near-black. Size alone wasn't enough — the two
                      lines sat at the same colour weight and read as one block
                      of text. */}
                  {t.body && (
                    <div style={{ marginTop: 3 }}>
                      <RichBody
                        html={t.body}
                        size="var(--text-md)"
                        color="var(--text-muted)"
                        maxWidth={680}
                        showPlainToggle
                      />
                    </div>
                  )}

                </div>

                {/* The actions are the LAST grid column, so they land at the
                    row's right edge whatever the title's length. */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  flex: 'none', alignSelf: 'center'
                }}>
                  {actions}
                </span>

              </div>

              {hasChips && (
                <div
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 5,
                    // Indented past the checkbox so the chips read as
                    // belonging to the task above.
                    padding: '0 var(--space-4) var(--space-3) 44px',
                    borderBottom: '1px solid var(--border-default)'
                  }}
                >
                  {t.noteChips.map((c) => (
                    <NoteChip key={c.id} label={c.label} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
        </div>

        {!loading && openCount > 0 && (
          <LoadMore
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            count={openCount}
            noun="task"
          />
        )}
      </section>

      {confirming && (
        <ConfirmDialog
          title="Delete this task?"
          message="This cannot be undone from here."
          preview={taskPreview(confirming)}
          confirmLabel="Delete task"
          busy={deleting === confirming.id}
          error={confirmError}
          onConfirm={removeTask}
          onCancel={() => { setConfirming(null); setConfirmError(null) }}
        />
      )}

      {editor && (
        <TaskEditor
          task={editor.task}
          // Editing: the one contact already on the task. Creating from this
          // page there's no deal in scope to offer people from, so a create
          // needs the contact chosen elsewhere — see the empty-contacts note
          // in the editor.
          contacts={editor.task?.contact ? [editor.task.contact] : []}
          // No deal in scope on this page, so the rep picks one. Lists load on
          // the first editor open, not on page load.
          deals={linkTargets.deals}
          businesses={linkTargets.businesses}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            if (editor.task && saved) {
              // Apply what the CRM echoed, not what we sent.
              patchItem((x) => x.id === editor.task.id, {
                title: saved.title ?? editor.task.title,
                body: saved.body ?? editor.task.body,
                dueAt: saved.dueDate ?? editor.task.dueAt
              })
              setToast('Task saved')
            } else {
              // A new task reaches our database via the CRM's webhook, which
              // takes a moment — so it isn't in this list yet. Say so rather
              // than showing a list that looks like the save failed.
              setToast('Task created — it appears here once your CRM syncs it back')
              reload()
            }
            window.setTimeout(() => setToast(null), 4000)
          }}
        />
      )}

      {toast && <Toast tone={toastTone(toast)}>{toast}</Toast>}
    </Shell>
  )
}
// A task as plain text for the confirm dialog. The title alone is often
// "Follow Up" — identical across a dozen rows — so the due date goes in too, as
// that is what distinguishes them in the queue.
function taskPreview(task) {
  const title = (task.title || '').trim() || '(untitled task)'
  const due = formatDue(task.dueAt)
  return due ? `${title} · ${due}` : title
}

// Case- and space-insensitive name match. GHL stores whatever was typed, so
// "james stevens" and "James Stevens" are the same person.
function sameName(a, b) {
  if (!a || !b) return false
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

function Label({ children }) {
  return (
    <span
      style={{
        fontSize: 'var(--text-sm)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
        textTransform: 'uppercase', color: 'var(--text-muted)'
      }}
    >
      {children}
    </span>
  )
}

// A failed save and a successful one must not look identical. Derived from the
// message rather than threaded through as state — there's one toast at a time
// and its wording already carries the outcome.
function toastTone(message) {
  return /^Task (completed|reopened|saved|created|deleted)/.test(message)
    ? 'done'
    : 'error'
}

const TOAST_TONES = {
  done:  { icon: 'check_circle', colour: 'var(--status-done)' },
  error: { icon: 'error',        colour: 'var(--status-stuck)' }
}

function Toast({ children, tone = 'error' }) {
  const { icon, colour } = TOAST_TONES[tone] || TOAST_TONES.error
  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 7,
        maxWidth: 420,
        padding: '10px 14px',
        border: `1px solid ${colour}`,
        borderRadius: 'var(--radius-md)',
        background: '#fff', boxShadow: 'var(--shadow-overlay)',
        fontSize: 'var(--text-md)', color: 'var(--text-heading)'
      }}
    >
      <span className="ms" style={{ fontSize: 17, color: colour, flex: 'none' }}>
        {icon}
      </span>
      {children}
    </div>
  )
}


// A task in the GRID — the October 2026 card design.
//
//   ┌ title ─────────────────────── [No DEAL] ┐   header: what to do, and
//   │ description                              │   whether a deal is missing
//   │ 👤 contact                 [View CONTACT] │   linked records — only the
//   │ 🏷 deal                    [View DEAL]    │   ones the task HAS
//   │ 🏢 business               [View BUSINESS] │
//   └ 📅 DUE 18 Sep (overdue)    ✓ ✎ ✕ ─────────┘   footer: when, and act on it
//
// A missing deal is the one absence the header calls out: a task off any deal
// is the state a rep needs to spot. A missing contact or business simply has
// no row — three "No X" lines on an unattached task were most of its card.
function TaskCard({
  task: t, done, overdue, dueToday, busy,
  onToggle, onEdit, onDelete,
  onOpenDeal, onOpenContact, onOpenBusiness
}) {
  const contact = t.contacts?.[0] || t.contact || null
  const hasChips = t.noteChips?.length > 0
  const due = cardDue(t, done, overdue, dueToday)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      // A CARD IN BOTH VIEWS — the same border, radius and surface as a row.
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-card)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      opacity: done ? 0.6 : 1
    }}>
      {/* HEADER — the title, and the No DEAL pill when there is no deal. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
        padding: '16px 20px 14px',
        borderBottom: '1px solid var(--border-default)'
      }}>
        <button
          onClick={() => t.deal && onOpenDeal && onOpenDeal(t.deal.id)}
          title={t.deal ? 'Open this task on the deal hub' : undefined}
          style={{
            flex: 1, minWidth: 0,
            border: 'none', background: 'none', padding: 0,
            textAlign: 'left',
            cursor: t.deal ? 'pointer' : 'default',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-xl)', fontWeight: 600,
            lineHeight: 1.3, letterSpacing: '-0.01em',
            color: 'var(--text-heading)',
            textDecoration: done ? 'line-through' : 'none',
            // A raw record id as a title is one unbroken word — wrap it rather
            // than let it push the pill out of the card.
            overflowWrap: 'anywhere'
          }}
        >
          {t.title || '(untitled task)'}
        </button>
        {!t.deal && (
          <span style={{ flex: 'none', marginTop: 1 }}>
            <DealPill name="No deal" empty />
          </span>
        )}
      </div>

      {/* BODY — two reserved lines, so every card in a grid row starts its
          linked records at the same depth whether or not it has a
          description. */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--border-default)'
      }}>
        <div style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          minHeight: 'calc(var(--text-lg) * 1.5 * 2)'
        }}>
          {t.body ? (
            <RichBody
              html={t.body}
              size="var(--text-lg)"
              color="var(--text-body)"
              showPlainToggle={false}
            />
          ) : (
            <span style={{ fontSize: 'var(--text-lg)', color: 'var(--text-faint)' }}>
              No description
            </span>
          )}
        </div>
        {/* Opens the EDITOR, which already shows the whole description — a
            read-only modal here would be a second surface for the same text. */}
        {htmlToText(t.body || '').length > 90 && (
          <button
            onClick={onEdit}
            style={{
              marginTop: 4,
              border: 'none', background: 'none', padding: 0,
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
              fontWeight: 600, color: 'var(--text-link)',
              cursor: 'pointer'
            }}
          >
            Read more
          </button>
        )}
      </div>

      {/* LINKED RECORDS — flex:1 takes the card's spare height, so the footer
          sits on the card's floor and lines up across a grid row. */}
      {/* Every section pads 20px at the sides, so left edges line up down
          the card. */}
      <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
        {(() => {
          // Only the records the task has. Built as a list so the LAST one
          // present drops its divider, whichever it is.
          const rows = []
          if (contact) {
            rows.push(
              <LinkedRow
                key="contact"
                icon="person"
                name={contact.name || 'Unnamed contact'}
                tone={LINK_TONES.contact}
                iconColour={LINK_TONES.contact.fill}
                large
                onOpen={onOpenContact ? () => onOpenContact(contact.id) : undefined}
              />
            )
          }
          if (t.deal) {
            // The SHARED DealPill — opening a deal has one treatment across
            // every surface (dealPill.test.mjs pins it).
            rows.push(
              <LinkedRow
                key="deal"
                icon="sell"
                name={t.deal.name || 'Untitled deal'}
                iconColour={LINK_TONES.deal.fill}
                large
                action={(
                  <DealPill
                    name={t.deal.name}
                    onClick={onOpenDeal ? () => onOpenDeal(t.deal.id) : undefined}
                  />
                )}
              />
            )
          }
          if (t.business) {
            rows.push(
              <LinkedRow
                key="business"
                icon="business"
                name={t.business.name || 'Unnamed business'}
                tone={LINK_TONES.business}
                iconColour={LINK_TONES.business.fill}
                large
                onOpen={onOpenBusiness ? () => onOpenBusiness(t.business.id) : undefined}
              />
            )
          }
          if (!rows.length) {
            return (
              <span style={{
                padding: '12px 0', fontSize: 'var(--text-md)', color: 'var(--text-faint)'
              }}>
                Not linked to a contact or business
              </span>
            )
          }
          return rows.map((row, i) =>
            i === rows.length - 1 ? React.cloneElement(row, { last: true }) : row)
        })()}

        {hasChips && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '4px 0 12px' }}>
            {t.noteChips.map((c) => (
              <NoteChip key={c.id} label={c.label} />
            ))}
          </div>
        )}
      </div>

      {/* FOOTER — due date left; mark complete, edit and delete right. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        flexWrap: 'wrap',
        padding: '12px 20px',
        borderTop: '1px solid var(--border-default)'
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          minWidth: 0, color: due.colour
        }}>
          <span className="ms" style={{ fontSize: 18, flex: 'none' }}>
            {done ? 'event_available' : 'calendar_today'}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--text-muted)'
          }}>
            {due.label}
          </span>
          <span style={{
            fontSize: 'var(--text-lg)',
            fontWeight: overdue ? 600 : 500,
            whiteSpace: 'nowrap'
          }}>
            {due.text}
          </span>
        </span>

        <span style={{
          marginLeft: 'auto', flex: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 8
        }}>
          <CompleteToggle
            done={done}
            busy={busy}
            label={t.title || 'task'}
            onToggle={onToggle}
            stacked
          />
          <RowAction icon="edit" title="Edit this task" onClick={onEdit} />
          <RowAction icon="close" danger title="Delete this task" onClick={onDelete} />
        </span>
      </div>
    </div>
  )
}

// The card footer's date line: "DUE 18 Sep (overdue)", "DUE 30 Sep",
// "DONE 2 days ago". The year only appears when it is not this year — a task
// list is almost all this year, and "2026" on every card is noise.
function cardDue(t, done, overdue, dueToday) {
  if (done) {
    return {
      label: 'Done',
      text: t.completedAt ? relativeTime(t.completedAt) : 'Completed',
      colour: 'var(--accent-pine-text)'
    }
  }
  if (!t.dueAt) {
    return { label: 'Due', text: 'No due date', colour: 'var(--text-faint)' }
  }
  const sameYear = new Date(t.dueAt).getFullYear() === new Date().getFullYear()
  const date = formatDate(t.dueAt, !sameYear) || 'No due date'
  if (overdue) {
    return { label: 'Due', text: `${date} (overdue)`, colour: 'var(--status-stuck-text)' }
  }
  if (dueToday) {
    return { label: 'Due', text: `${date} (today)`, colour: 'var(--accent-gold-text)' }
  }
  return { label: 'Due', text: date, colour: 'var(--text-heading)' }
}

// One linked record on a task card: icon, name, and a "View X" button.
//
// These were bare pills — a ContactChip and a DealPill side by side — which
// said WHO and WHICH DEAL but not what kind of record each was, and gave no
// affordance for opening them beyond the pill itself being clickable.
//
// The design makes each a row: the type is named by its icon and by the chip
// inside the button, so "Riley Nakamura · View CONTACT" and "Brightwell ·
// View BUSINESS" cannot be mistaken for one another at a glance.
//
// Rendered even when the record is MISSING (`name` null) — an unattached task
// is a real state worth seeing, not an absence to hide. The button is then
// inert and the row says so.
// `action` overrides the built-in button, for a row whose control already
// exists as a shared component — the deal row hands it a DealPill.
//
// `large` is the grid card's form: the icon takes the record's colour and the
// name steps up a size, as the card design draws it.
function LinkedRow({ icon, name, emptyText, tone, onOpen, last, action, iconColour, large = false }) {
  const present = !!name
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: large ? 10 : 'var(--space-2)',
        padding: large ? '10px 0' : '7px 0',
        borderBottom: last ? 'none' : '1px solid var(--border-default)',
        minWidth: 0
      }}
    >
      <span className="ms" style={{
        fontSize: large ? 18 : 16, flex: 'none',
        color: iconColour || 'var(--text-faint)'
      }}>
        {icon}
      </span>
      <Truncate style={{
        flex: 1, minWidth: 0,
        fontSize: large ? 'var(--text-lg)' : 'var(--text-md)',
        fontWeight: large ? 500 : 400,
        color: present ? (large ? 'var(--text-heading)' : 'var(--text-body)') : 'var(--text-faint)'
      }}>
        {present ? name : emptyText}
      </Truncate>
      {action || (
      <button
        type="button"
        onClick={present && onOpen ? onOpen : undefined}
        disabled={!present || !onOpen}
        title={present && onOpen ? `Open ${name}` : emptyText}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
          height: 24, padding: '0 4px 0 10px',
          border: 'none', borderRadius: 'var(--radius-pill)',
          background: present ? tone.fill : 'var(--status-stuck)',
          color: '#fff',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)', fontWeight: 600,
          cursor: present && onOpen ? 'pointer' : 'default',
          opacity: present ? 1 : 1
        }}
      >
        {present ? 'View' : 'No'}
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          height: 18, padding: '0 7px',
          borderRadius: 'var(--radius-pill)',
          background: '#fff',
          color: present ? tone.fill : 'var(--status-stuck)',
          fontSize: 10, fontWeight: 700,
          letterSpacing: 'var(--tracking-label)'
        }}>
          {tone.label}
        </span>
      </button>
      )}
    </div>
  )
}

const LINK_TONES = {
  contact: { fill: 'var(--accent-sky)', label: 'CONTACT' },
  deal: { fill: 'var(--green-500)', label: 'DEAL' },
  business: { fill: 'var(--accent-plum)', label: 'BUSINESS' }
}

// Mark complete / mark open.
//
// Replaces a bare checkbox: an unlabelled 17px box says nothing about what
// ticking it does, and it read as a selection control rather than an action.
// A circled tick that fills when done says both.
//
// `compact` is the card form — icon only, since a card already has a row of
// icon buttons beside it and "Mark complete" spelled out would be the widest
// thing on the card.
//
// `stacked` is the grid card's footer form, as the design draws it: a small
// two-line "MARK / COMPLETE" caption beside a round tick. Caption and circle
// are ONE button, so the words are part of the hit area rather than a label
// a rep clicks expecting something to happen.
function CompleteToggle({ done, busy, label, onToggle, compact = false, stacked = false }) {
  if (stacked) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        disabled={busy}
        title={done ? 'Mark this task open again' : 'Mark this task complete'}
        aria-label={`Mark ${label} ${done ? 'open' : 'complete'}`}
        aria-pressed={done}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none',
          border: 'none', background: 'none', padding: '2px 0',
          fontFamily: 'var(--font-sans)',
          color: done ? 'var(--green-600)' : 'var(--text-muted)',
          cursor: busy ? 'progress' : 'pointer'
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, lineHeight: 1.15,
          letterSpacing: '.06em', textTransform: 'uppercase', textAlign: 'right'
        }}>
          {done ? <>Mark<br />open</> : <>Mark<br />complete</>}
        </span>
        {/* Outlined tick-in-circle when open, filled green when done — the
            state reads from the glyph alone. */}
        <span
          className={done ? 'ms ms-fill' : 'ms'}
          style={{ fontSize: 30, color: done ? 'var(--green-500)' : 'var(--text-muted)' }}
        >
          check_circle
        </span>
      </button>
    )
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      disabled={busy}
      title={done ? 'Mark this task open again' : 'Mark this task complete'}
      aria-label={`Mark ${label} ${done ? 'open' : 'complete'}`}
      aria-pressed={done}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: compact ? 0 : 6,
        flex: 'none',
        height: 30, padding: compact ? '0 6px' : '0 11px 0 9px',
        border: '1px solid',
        borderColor: done ? 'var(--green-300)' : 'var(--border-strong)',
        borderRadius: 'var(--radius-pill)',
        background: done ? 'var(--tint-pine)' : 'var(--surface-card)',
        color: done ? 'var(--green-600)' : 'var(--text-muted)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
        fontWeight: 500,
        cursor: busy ? 'progress' : 'pointer'
      }}
    >
      {/* Filled when done, outlined when not — the state reads from the glyph
          alone, before the label is processed. */}
      <span className="ms" style={{ fontSize: 18 }}>
        {done ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      {!compact && (done ? 'Completed' : 'Mark complete')}
    </button>
  )
}
