import React, { useCallback, useEffect, useRef, useState } from 'react'
import ViewSwitch from '../shared/ViewSwitch'
import WorkFilters from '../shared/WorkFilters'
import { tasksAPI } from '../../api/tasks'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import TaskEditor from '../shared/TaskEditor'
import TaskDealsPopover from '../shared/TaskDealsPopover'
import { useLinkTargets } from '../../hooks/useLinkTargets'
import ConfirmDialog from '../shared/ConfirmDialog'
import {
  Shell, PageHeader, Panel, ContactChip, DealChip, RowAction,
  PrimaryAction, FilterChip, NoteChip, StateMessage, LoadMore,
  RichBody, formatDue, relativeTime
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
  ['month', 'Due next 30 days']
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

export default function TasksTab({ onOpenDeal, onOpenContact }) {
  // Remembered across tab switches — see useTabState. Clicking a task through
  // to its deal and coming back used to reset this to 'all'.
  const [dueFilter, setDueFilter] = useTabState('tasks', 'dueFilter', 'all')
  const [status, setStatus] = useTabState('tasks', 'status', 'open')
  const [toast, setToast] = useState(null)

  // Rows or a grid. Persisted: a display preference, not a navigation step, so
  // a rep who prefers the grid should not be handed rows every time they come
  // back to this tab.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('pp.tasks.view') || 'rows' } catch { return 'rows' }
  })
  useEffect(() => {
    try { localStorage.setItem('pp.tasks.view', view) } catch { /* private mode */ }
  }, [view])

  // Contact / deal filters. useTabState, not plain state: stepping out to a
  // deal or a contact and back should not discard them.
  const [filters, setFilters] = useTabState('tasks', 'filters', {})

  const fetchPage = useCallback(
    ({ cursor }) => tasksAPI.list({
      status, due: dueFilter, limit: 20, cursor,
      contactId: filters.contactId || undefined,
      dealId: filters.dealId || undefined
    }),
    [status, dueFilter, filters]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem, reload } =
    usePagedList({ fetchPage, key: 'tasks', deps: [status, dueFilter, filters] })
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
      <PageHeader
        title="Tasks"
        subtitle="Tasks come first — each one links to its contact and its deal; click a task to see it on the deal hub"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Label>Status</Label>
          {STATUS_FILTERS.map(([id, label]) => (
            <FilterChip
              key={id}
              label={label}
              active={status === id}
              onClick={() => setStatus(id)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Label>Due</Label>
          {DUE_FILTERS.map(([id, label]) => (
            <FilterChip
              key={id}
              label={label}
              active={dueFilter === id}
              onClick={() => setDueFilter(id)}
            />
          ))}
        </div>
      </div>

      <Panel
        icon="task_alt"
        title="Task queue"
        accent="rose"
        meta={loading ? null : `${openCount}${hasMore ? '+' : ''} ${countNoun}`}
        // `action`, not `toolbar`: a lone button in the toolbar band drew a
        // full-width grey strip under the title that read as its own section.
        // In the header it sits beside the count, where it belongs.
        action={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <WorkFilters
              filters={filters}
              onChange={setFilters}
              noun="tasks"
            />
            <ViewSwitch
              value={view}
              onChange={setView}
              options={[
                { id: 'rows', icon: 'view_agenda', label: 'Rows' },
                { id: 'grid', icon: 'grid_view', label: 'Grid' }
              ]}
            />
            <PrimaryAction onClick={() => setEditor({ task: null })} icon="add">
              Add task
            </PrimaryAction>
          </span>
        }
      >
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

        {/* GRID wraps the same rows in a responsive grid; the row markup is
            unchanged, so a task looks and behaves identically in both views
            and there is only one place to fix a bug in it.

            auto-fill with a 340px minimum: the column count follows the
            window rather than a breakpoint, so a wide screen shows four and a
            narrow one shows one, with no layout that fits neither. */}
        <div style={view === 'grid' ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 'var(--space-3)',
          padding: 'var(--space-3)'
        } : undefined}>
        {tasks.map((t) => {
          const done = t.status !== 'open'
          // A completed task isn't overdue, whatever its due date says.
          const overdue = t.overdue && !done
          const dueToday = t.dueToday && !t.overdue && !done
          // deals[] falls back to the scalar server-side, so this counts 1
          // for an ordinary single-deal task and 0 for an unlinked one.
          const dealCount = t.deals?.length || 0
          const hasChips = t.noteChips?.length > 0
          return (
            // No position/zIndex here: the popover renders in a body
            // portal, because this list's Panel sets `overflow: hidden` to
            // clip its rounded corners and was CLIPPING the popover instead.
            <div key={t.id}>
              <div
                style={{
                  // ROW: title left, chips right. CARD: stacked, because at a
                  // 340px column width the horizontal layout left the title
                  // ~40px and it wrapped to one letter per line.
                  display: 'flex',
                  flexDirection: view === 'grid' ? 'column' : 'row',
                  alignItems: view === 'grid' ? 'stretch' : 'flex-start',
                  gap: 'var(--space-3)',
                  // Taller rows. At space-3 the three lines of a task —
                  // title, description, due date — were closer to each other
                  // than the rows were to their neighbours, so the list read
                  // as one dense block rather than a set of items.
                  padding: 'var(--space-4)',
                  // The chip row below carries the divider when present, so
                  // the two lines read as one row.
                  // In the grid each task is a CARD — a full border and a
                  // radius. In rows it is a list item, so only the divider
                  // below it. Same markup, different separation.
                  ...(view === 'grid'
                    ? {
                      border: '1px solid var(--border-default)',
                      // A FIXED height, so a grid row's cards all end on the
                      // same line. Without it a card with a description was
                      // taller than one without, and the row below started at
                      // a different depth for every column — the zig-zag.
                      height: 210,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-card)'
                    }
                    : { borderBottom: hasChips ? 'none' : '1px solid var(--border-default)' }),
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
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => toggle(t)}
                  disabled={saving.has(t.id)}
                  aria-label={`Mark ${t.title || 'task'} ${done ? 'open' : 'complete'}`}
                  style={{
                    marginTop: 2, width: 17, height: 17, flex: 'none',
                    accentColor: 'var(--brand-primary)',
                    cursor: saving.has(t.id) ? 'progress' : 'pointer'
                  }}
                />

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
                      />
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                      marginTop: 3, flexWrap: 'wrap'
                    }}
                  >
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
                </div>

                <div
                  style={{
                    display: 'flex', gap: 6, flexWrap: 'wrap',
                    // In a card the chips sit UNDER the title, so they start
                    // from the left like everything else in the card.
                    justifyContent: view === 'grid' ? 'flex-start' : 'flex-end',
                    // Fills the card's remaining height so the actions below
                    // can be pushed to its bottom with margin-top:auto.
                    ...(view === 'grid'
                      ? { flex: 1, alignContent: 'flex-start', width: '100%' }
                      : {}),
                    // Aligned to the TITLE's line rather than centred against
                    // the whole row: a task with a long description pushed its
                    // chips halfway down the row, so they no longer read as
                    // belonging to the title they describe.
                    alignItems: 'flex-start',
                    flex: 'none'
                  }}
                >
                  {/* GHL names a new opportunity after its contact, so the
                      contact chip and the deal chip below routinely printed the
                      same string twice — "james stevens" then "James Stevens".
                      Drop the contact chip when it's the same person; the deal
                      chip already names them and also says which deal. */}
                  {(t.contacts?.length ? t.contacts : t.contact ? [t.contact] : [])
                    .filter((c) => !sameName(c.name, t.deal?.name))
                    .map((c) => (
                      <ContactChip
                        key={c.id}
                        name={c.name}
                        onClick={onOpenContact ? () => onOpenContact(c.id) : undefined}
                      />
                    ))}
                  {/* "No deal" is shown, not hidden — v5 treats an unattached
                      task as a real state worth seeing. */}
                  {/* The PRIMARY deal, still one chip. A task can hold ten,
                      but ten chips on a list row is unreadable — the extra
                      ones are counted here and edited in the popover. */}
                  <DealChip
                    name={t.deal?.name || 'No deal'}
                    empty={!t.deal}
                    onClick={
                      t.deal && onOpenDeal ? () => onOpenDeal(t.deal.id) : undefined
                    }
                  />
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
                  {/* Edit and delete, in their OWN group.
                      They used to sit loose among the chips, so they wrapped
                      wherever the chips left room — a different place on every
                      card. In a grid they are pinned to the bottom-right;
                      in a row they trail the chips as before. */}
                  <span style={{
                    display: 'inline-flex', gap: 6, flex: 'none',
                    ...(view === 'grid'
                      ? { marginTop: 'auto', marginLeft: 'auto', paddingTop: 6 }
                      : {})
                  }}>
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
                  </span>
                </div>
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
      </Panel>

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
