import React, { useCallback, useState } from 'react'
import { tasksAPI } from '../../api/tasks'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import {
  Shell, PageHeader, Panel, ContactChip, DealChip, RowAction,
  PrimaryAction, FilterChip, NoteChip, StateMessage, LoadMore,
  RichBody, formatDue
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

export default function TasksTab({ onOpenDeal, onOpenContact }) {
  const [dueFilter, setDueFilter] = useState('all')
  const [toast, setToast] = useState(null)

  const fetchPage = useCallback(
    ({ cursor }) => tasksAPI.list({ status: 'open', due: dueFilter, limit: 20, cursor }),
    [dueFilter]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem } =
    usePagedList({ fetchPage, key: 'tasks', deps: [dueFilter] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const tasks = items || []
  const openCount = tasks.length

  // Optimistic strike-through then roll back: completing a task has to write
  // to GHL and that path doesn't exist yet. A checkbox that silently didn't
  // save is worse than one that visibly bounces and says why.
  const toggle = (t) => {
    const was = t.status
    patchItem((x) => x.id === t.id, { status: was === 'open' ? 'completed' : 'open' })
    setToast('Completing a task writes back to GoHighLevel — coming next')
    window.setTimeout(() => {
      patchItem((x) => x.id === t.id, { status: was })
      setToast(null)
    }, 1800)
  }

  return (
    <Shell>
      <PageHeader
        title="Tasks"
        subtitle="Tasks come first — each one links to its contact and its deal; click a task to see it on the deal hub"
      />

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

      <Panel
        icon="task_alt"
        title="Task queue"
        accent="rose"
        meta={loading ? null : `${openCount}${hasMore ? '+' : ''} open`}
        toolbar={<PrimaryAction onClick={undefined} icon="add">Add task</PrimaryAction>}
      >
        <StateMessage
          loading={loading}
          error={error}
          empty={!loading && openCount === 0}
          emptyText={
            dueFilter === 'all'
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
                  aria-label={`Mark ${t.title || 'task'} ${done ? 'open' : 'complete'}`}
                  style={{
                    marginTop: 2, width: 17, height: 17, flex: 'none',
                    accentColor: 'var(--brand-primary)', cursor: 'pointer'
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
                      // The title is the task. It was the same weight as the
                      // description below it, so "JAMES" and "descriptipon"
                      // read as two equal lines.
                      fontSize: 'var(--text-lg)', fontWeight: 600, lineHeight: 1.35,
                      color: 'var(--text-heading)',
                      textDecoration: done ? 'line-through' : 'none'
                    }}
                  >
                    {t.title || '(untitled task)'}
                  </button>

                  {t.body && (
                    <div style={{ marginTop: 2 }}>
                      <RichBody html={t.body} size="var(--text-base)" maxWidth={680} />
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
                    <span
                      style={{
                        fontSize: 'var(--text-base)',
                        fontWeight: overdue ? 600 : 400,
                        color: overdue
                          ? 'var(--status-stuck-text)'
                          : dueToday ? 'var(--accent-gold-text)' : 'var(--text-muted)'
                      }}
                    >
                      {formatDue(t.dueAt) || 'No due date'}
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
                  {(t.contacts?.length ? t.contacts : t.contact ? [t.contact] : []).map((c) => (
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
                    title="Edit task — people, deal and linked notes (coming next)"
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

      {toast && <Toast>{toast}</Toast>}
    </Shell>
  )
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

function Badge({ tone, children }) {
  const rose = tone === 'rose'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 22, padding: '0 9px',
        borderRadius: 'var(--radius-sm)',
        background: rose ? 'var(--status-stuck)' : 'var(--status-working)',
        color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600
      }}
    >
      {children}
    </span>
  )
}

function Toast({ children }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: '#fff', boxShadow: 'var(--shadow-overlay)',
        fontSize: 'var(--text-md)', color: 'var(--text-heading)'
      }}
    >
      <span className="ms" style={{ fontSize: 17, color: 'var(--status-working)' }}>
        info
      </span>
      {children}
    </div>
  )
}
