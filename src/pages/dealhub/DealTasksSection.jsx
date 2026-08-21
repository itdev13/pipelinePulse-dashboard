import React, { useEffect, useState } from 'react'
import { tasksAPI } from '../../api/tasks'
import { notesAPI } from '../../api/notes'
import { formatDue, relativeTime, RichBody } from '../shared/ListChrome'

// Tasks and Notes for the open deal, in the Deal Hub's right rail.
//
// Deliberately server-filtered by dealId rather than reusing the Tasks/Notes
// tab data: those lists are location-wide and paginated, so filtering them
// client-side would show only whatever happened to be on the loaded page.
//
// Both are read-only here. Creating and completing needs GHL write-back, which
// doesn't exist yet — so the rail reports rather than pretending to act.

export function DealTasksSection({ dealId }) {
  const { items, loading, error } = useDealList(
    dealId,
    (id) => tasksAPI.list({ dealId: id, status: 'all', limit: 50 }),
    'tasks'
  )

  const open = items.filter((t) => t.status === 'open')
  const done = items.length - open.length

  return (
    <Rail
      icon="task_alt"
      title="Tasks"
      accent="rose"
      meta={loading ? null : `${open.length} open${done ? ` · ${done} done` : ''}`}
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyText="No tasks on this deal yet."
    >
      {items.map((t, i) => (
        <div
          key={t.id}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '11px 14px',
            borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border-default)',
            // A completed task stays visible but recedes — useful history,
            // not something needing attention.
            opacity: t.status === 'open' ? 1 : 0.55
          }}
        >
          <span
            className="ms"
            style={{
              fontSize: 17, flex: 'none', marginTop: 1,
              color: t.status === 'open'
                ? (t.overdue ? 'var(--status-stuck)' : 'var(--text-faint)')
                : 'var(--status-done)'
            }}
          >
            {t.status === 'open' ? 'radio_button_unchecked' : 'check_circle'}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'block',
                fontSize: 13, fontWeight: 600, color: 'var(--text-heading)',
                textDecoration: t.status === 'open' ? 'none' : 'line-through'
              }}
            >
              {t.title || '(untitled task)'}
            </span>
            {t.body && (
              <div style={{ marginTop: 2 }}>
                <RichBody html={t.body} size={12} maxWidth={480} />
              </div>
            )}
            <span
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 4, flexWrap: 'wrap',
                fontSize: 11, color: 'var(--text-faint)'
              }}
            >
              {[formatDue(t.dueAt), t.owner].filter(Boolean).join(' · ')}
              {t.overdue && t.status === 'open' && (
                <span
                  style={{
                    padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--status-stuck)', color: '#fff',
                    fontSize: 10, fontWeight: 600
                  }}
                >
                  Overdue
                </span>
              )}
            </span>
          </div>
        </div>
      ))}
    </Rail>
  )
}

export function DealNotesSection({ dealId }) {
  const { items, loading, error } = useDealList(
    dealId,
    (id) => notesAPI.list({ dealId: id, limit: 50 }),
    'notes'
  )

  return (
    <Rail
      icon="sticky_note_2"
      title="Notes"
      accent="gold"
      meta={loading ? null : `${items.length}`}
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyText="No notes on this deal yet."
    >
      {items.map((n, i) => {
        const { heading, rest } = splitNote(n.body)
        return (
          <div
            key={n.id}
            style={{
              padding: '11px 14px',
              borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border-default)'
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 13, fontWeight: 600, color: 'var(--text-heading)'
              }}
            >
              {heading}
            </span>
            {rest && (
              <div style={{ marginTop: 3 }}>
                <RichBody html={rest} size={12} maxWidth={480} />
              </div>
            )}
            <span
              style={{
                display: 'block', marginTop: 4,
                fontSize: 11, color: 'var(--text-faint)'
              }}
            >
              {[n.author, relativeTime(n.createdAt)].filter(Boolean).join(' · ')}
            </span>
          </div>
        )
      })}
    </Rail>
  )
}

// ── Shared ────────────────────────────────────────────────────────────

function useDealList(dealId, fetcher, key) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!dealId) return
    let alive = true
    setLoading(true)
    setError(null)
    fetcher(dealId)
      .then((r) => { if (alive) setItems(r?.[key] || []) })
      .catch((err) => { if (alive) setError(err?.message || 'Failed to load') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // fetcher is recreated per render; dealId is what defines the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, key])

  return { items, loading, error }
}

function Rail({ icon, title, accent, meta, loading, error, empty, emptyText, children }) {
  const color = `var(--accent-${accent})`
  return (
    <section
      style={{
        border: `2px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '12px 14px',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <span className="ms" style={{ fontSize: 19, color }}>{icon}</span>
        <h3 style={{ fontSize: 17, fontWeight: 600, color, margin: 0, flex: 1 }}>
          {title}
        </h3>
        {meta != null && (
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{meta}</span>
        )}
      </header>

      {loading && <Muted>Loading…</Muted>}
      {error && (
        <p
          style={{
            margin: 0, padding: '12px 14px',
            borderLeft: '3px solid var(--status-stuck)',
            background: 'var(--tint-rose)',
            fontSize: 12.5, color: 'var(--status-stuck)'
          }}
        >
          {error}
        </p>
      )}
      {empty && <Muted>{emptyText}</Muted>}
      {children}
    </section>
  )
}

function Muted({ children }) {
  return (
    <p style={{ margin: 0, padding: '16px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
      {children}
    </p>
  )
}

// Notes have no title column, so the first block becomes the heading and the
// rest is the body. Bodies are markup, so "first block" means the first
// paragraph/line element — splitting on "\n" finds nothing in
// "<p>a</p><p>b</p>" and would make the whole markup string the heading.
function splitNote(body) {
  const raw = (body || '').trim()
  if (!raw) return { heading: '(empty note)', rest: null }

  // Plain text (no markup): first line is the heading, as before.
  if (!/<[a-z][^>]*>/i.test(raw)) {
    const lines = raw.split('\n')
    const heading = lines[0].trim()
    const rest = lines.slice(1).join('\n').trim()
    if (!rest && heading.length > 120) return { heading: 'Note', rest: heading }
    return { heading, rest: rest || null }
  }

  // Markup: take the first block element's text as the heading and hand the
  // remaining markup back intact, so its formatting survives.
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  const blocks = [...doc.body.children]
  if (blocks.length > 1) {
    const heading = (blocks[0].textContent || '').trim()
    const rest = blocks.slice(1).map((el) => el.outerHTML).join('')
    if (heading) return { heading, rest: rest || null }
  }

  // One block, or nothing usable: the whole thing is the body. No invented
  // heading — a truncated first sentence in bold reads worse than none.
  const text = (doc.body.textContent || '').trim()
  if (text.length <= 120) return { heading: text, rest: null }
  return { heading: 'Note', rest: raw }
}
