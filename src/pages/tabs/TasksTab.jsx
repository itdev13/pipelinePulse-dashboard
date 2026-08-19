import React, { useEffect, useState } from 'react'
import { tasksAPI } from '../../api/tasks'

// Tasks tab — queue view. Filter chips (Due) + a list.
// Backend does the heavy lifting; frontend just paints.
export default function TasksTab() {
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

  const chip = (label, id) => {
    const active = dueFilter === id
    return (
      <button
        key={id}
        onClick={() => setDueFilter(id)}
        style={{
          cursor: 'pointer',
          height: 30, padding: '0 14px',
          border: active ? '2px solid var(--brand-primary)' : '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-pill)',
          background: active ? 'var(--surface-selected)' : '#fff',
          color: active ? 'var(--brand-primary)' : 'var(--text-body)',
          fontFamily: 'var(--font-sans)',
          fontSize: 13, fontWeight: active ? 500 : 400
        }}
      >
        {label}
      </button>
    )
  }

  const formatDue = (iso) => {
    if (!iso) return null
    const d = new Date(iso)
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${d.getDate()} ${M[d.getMonth()]}`
  }

  return (
    <div
      style={{
        maxWidth: 1080, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: '16px 20px 28px', display: 'grid', gap: 14
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24 }}>Tasks</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {tasks ? `${tasks.length} open` : 'Loading…'}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span
          style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4
          }}
        >
          Due
        </span>
        {chip('All', 'all')}
        {chip('Overdue', 'overdue')}
        {chip('Due this week', 'week')}
        {chip('Due next 30 days', 'month')}
      </div>

      <section
        style={{
          border: '2px solid var(--accent-rose)',
          borderRadius: 'var(--radius-md)',
          background: '#fff', overflow: 'hidden'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-rose)' }}>task_alt</span>
          <h3
            style={{
              fontSize: 18, fontWeight: 600, color: 'var(--accent-rose)',
              margin: 0, flex: 1
            }}
          >
            Task queue
          </h3>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {tasks ? tasks.length : ''}
          </span>
        </header>

        {error && (
          <div style={{ padding: 16, background: 'var(--tint-rose)', color: 'var(--status-stuck)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {tasks && tasks.length === 0 && !error && (
          <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            Nothing matches these filters — you're clear.
          </div>
        )}

        {!tasks && !error && (
          <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            Loading tasks…
          </div>
        )}

        {(tasks || []).map((t) => (
          <div
            key={t.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr auto',
              gap: 12, alignItems: 'start',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-default)'
            }}
          >
            {/* Checkbox slot (visual only for now — server write not wired) */}
            <input
              type="checkbox"
              disabled
              style={{ marginTop: 3, width: 18, height: 18, accentColor: 'var(--brand-primary)' }}
            />

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-heading)', lineHeight: 1.4 }}>
                {t.title || '(no title)'}
              </div>
              {t.body && (
                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t.body}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {t.dueAt && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Due {formatDue(t.dueAt)}
                  </span>
                )}
                {t.owner && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    · {t.owner}
                  </span>
                )}
                {t.overdue && (
                  <span
                    style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--status-stuck)', color: '#fff'
                    }}
                  >
                    Overdue
                  </span>
                )}
                {t.dueToday && !t.overdue && (
                  <span
                    style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--status-working)', color: '#fff'
                    }}
                  >
                    Due today
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {t.contact && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-pill)',
                    background: '#fff',
                    fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                    color: 'var(--text-body)'
                  }}
                >
                  <span className="ms" style={{ fontSize: 13, color: 'var(--text-muted)' }}>person</span>
                  {t.contact.name || 'Contact'}
                </span>
              )}
              {t.deal && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px',
                    border: '1px solid var(--green-300)',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--green-50)',
                    fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                    color: 'var(--green-600)'
                  }}
                >
                  <span className="ms" style={{ fontSize: 13 }}>sell</span>
                  {t.deal.name}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
