import React, { useCallback, useState } from 'react'
import { tasksAPI } from '../../api/tasks'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import {
  Shell, PageHeader, Panel, Row, ContactChip, DealChip, RowAction,
  PrimaryAction, FilterChip, StateMessage, LoadMore, RichBody, formatDue
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
  const [dueFilter, setDueFilter] = useState('all')

  const fetchPage = useCallback(
    ({ cursor }) => tasksAPI.list({ status: 'open', due: dueFilter, limit: 20, cursor }),
    [dueFilter]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore } =
    usePagedList({ fetchPage, key: 'tasks', deps: [dueFilter] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const tasks = items || []
  const openCount = tasks.length

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
        meta={loading ? null : `${openCount}${hasMore ? '+' : ''} open`}
        toolbar={
          <PrimaryAction onClick={undefined} icon="add">
            Add task
          </PrimaryAction>
        }
      >
        <StateMessage
          loading={loading}
          error={error}
          empty={!loading && openCount === 0}
          emptyText={
            dueFilter === 'all'
              ? 'No open tasks — you’re clear.'
              : 'Nothing in this window — try another filter.'
          }
          loadingText="Loading tasks…"
        />

        {tasks.map((t, i) => (
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
                <div style={{ marginTop: 4 }}>
                  <RichBody html={t.body} maxWidth={680} />
                </div>
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
