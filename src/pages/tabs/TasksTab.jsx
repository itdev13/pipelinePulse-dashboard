import React, { useEffect, useState } from 'react'
import { tasksAPI } from '../../api/tasks'
import {
  Shell, PageHeader, Panel, Row, ContactChip, DealChip, RowAction,
  PrimaryAction, FilterChip, StateMessage, formatDue
} from '../shared/ListChrome'

// Tasks tab — the queue. Due filters run server-side (routes/tasks.js
// translates them to SQL windows), so changing a chip refetches.
//
// The checkbox is rendered but inert: completing a task means writing to GHL,
// and there's no write endpoint yet. It carries a title saying so rather than
// looking broken, matching how PeopleSection handles Make primary / Remove.

const DUE_FILTERS = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['week', 'Due this week'],
  ['month', 'Due next 30 days']
]

export default function TasksTab({ onOpenDeal }) {
  const [tasks, setTasks] = useState(null)
  const [error, setError] = useState(null)
  const [dueFilter, setDueFilter] = useState('all')

  useEffect(() => {
    let alive = true
    setTasks(null)
    setError(null)
    tasksAPI.list({ status: 'open', due: dueFilter, limit: 500 })
      .then((r) => alive && setTasks(r.tasks || []))
      .catch((err) => alive && setError(err.message || 'Failed to load tasks'))
    return () => { alive = false }
  }, [dueFilter])

  const openCount = (tasks || []).length

  return (
    <Shell>
      <PageHeader
        title="Tasks"
        subtitle="Tasks come first — each one links to its contact and its deal; click a task to see it on the deal hub"
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2
          }}
        >
          Due
        </span>
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
        meta={tasks ? `${openCount} open` : null}
        toolbar={
          <PrimaryAction onClick={undefined} icon="add">
            Add task
          </PrimaryAction>
        }
      >
        <StateMessage
          loading={!tasks && !error}
          error={error}
          empty={tasks && openCount === 0}
          emptyText={
            dueFilter === 'all'
              ? 'No open tasks — you’re clear.'
              : 'Nothing in this window — try another filter.'
          }
          loadingText="Loading tasks…"
        />

        {(tasks || []).map((t, i) => (
          <Row key={t.id} last={i === openCount - 1}>
            <input
              type="checkbox"
              disabled
              title="Completing a task writes back to GoHighLevel — coming next"
              style={{
                marginTop: 2, width: 17, height: 17, flex: 'none',
                accentColor: 'var(--brand-primary)', cursor: 'not-allowed'
              }}
            />

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 14, fontWeight: 600, color: 'var(--text-heading)',
                  lineHeight: 1.35
                }}
              >
                {t.title || '(untitled task)'}
              </div>

              {t.body && (
                <p
                  style={{
                    margin: '4px 0 0', maxWidth: 680,
                    fontSize: 13, lineHeight: 1.5, color: 'var(--text-body)'
                  }}
                >
                  {t.body}
                </p>
              )}

              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  flexWrap: 'wrap', marginTop: 5
                }}
              >
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {[formatDue(t.dueAt), t.owner].filter(Boolean).join(' · ')}
                </span>
                {t.overdue && <StatusPill tone="overdue">Overdue</StatusPill>}
                {t.dueToday && !t.overdue && <StatusPill tone="today">Due today</StatusPill>}
              </div>
            </div>

            <div
              style={{
                display: 'flex', gap: 6, flexWrap: 'wrap',
                justifyContent: 'flex-end', alignItems: 'center'
              }}
            >
              {t.contact && <ContactChip name={t.contact.name} />}
              {t.deal && (
                <DealChip
                  name={t.deal.name}
                  onClick={onOpenDeal ? () => onOpenDeal(t.deal.id) : undefined}
                />
              )}
              <RowAction icon="edit" title="Edit task — coming next" />
            </div>
          </Row>
        ))}
      </Panel>
    </Shell>
  )
}

function StatusPill({ tone, children }) {
  const overdue = tone === 'overdue'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 21, padding: '0 9px',
        borderRadius: 'var(--radius-sm)',
        background: overdue ? 'var(--status-stuck)' : 'var(--status-working)',
        color: '#fff',
        fontSize: 11, fontWeight: 600
      }}
    >
      {children}
    </span>
  )
}
