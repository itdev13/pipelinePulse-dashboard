import React, { useCallback, useState } from 'react'
import { tasksAPI } from '../../api/tasks'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import TaskEditor from '../shared/TaskEditor'
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

export default function TasksTab({ onOpenDeal, onOpenContact }) {
  // Remembered across tab switches — see useTabState. Clicking a task through
  // to its deal and coming back used to reset this to 'all'.
  const [dueFilter, setDueFilter] = useTabState('tasks', 'dueFilter', 'all')
  const [status, setStatus] = useTabState('tasks', 'status', 'open')
  const [toast, setToast] = useState(null)

  const fetchPage = useCallback(
    ({ cursor }) => tasksAPI.list({ status, due: dueFilter, limit: 20, cursor }),
    [status, dueFilter]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem, reload } =
    usePagedList({ fetchPage, key: 'tasks', deps: [status, dueFilter] })
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
        toolbar={
          <PrimaryAction onClick={() => setEditor({ task: null })} icon="add">
            Add task
          </PrimaryAction>
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

        {tasks.map((t) => {
          const done = t.status !== 'open'
          // A completed task isn't overdue, whatever its due date says.
          const overdue = t.overdue && !done
          const dueToday = t.dueToday && !t.overdue && !done
          const hasChips = t.noteChips?.length > 0
          return (
            <div key={t.id}>
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: 'var(--space-3) var(--space-4)',
                  // The chip row below carries the divider when present, so
                  // the two lines read as one row.
                  borderBottom: hasChips ? 'none' : '1px solid var(--border-default)',
                  opacity: done ? 0.6 : 1
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
                      textDecoration: done ? 'line-through' : 'none'
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
                    justifyContent: 'flex-end', alignItems: 'center'
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
                  <DealChip
                    name={t.deal?.name || 'No deal'}
                    onClick={
                      t.deal && onOpenDeal ? () => onOpenDeal(t.deal.id) : undefined
                    }
                  />
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
