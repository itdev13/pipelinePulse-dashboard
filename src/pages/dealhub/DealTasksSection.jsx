import React, { useEffect, useMemo, useState } from 'react'
import { tasksAPI } from '../../api/tasks'
import { notesAPI } from '../../api/notes'
import { formatDue, relativeTime, RichBody } from '../shared/ListChrome'

// Tasks and Notes for the open deal, in the Deal Hub's right rail.
//
// Deliberately server-filtered by dealId rather than reusing the Tasks/Notes
// tab data: those lists are location-wide and paginated, so filtering them
// client-side would show only whatever happened to be on the loaded page.
//
// The status filter and both sorts run client-side. That's correct here and not
// a shortcut: the rail fetches every task on the deal in one request (a deal has
// tens, not thousands), so the set is complete and re-sorting it is instant. A
// server round trip per sort click would be slower and no more accurate.
//
// Creating and editing needs GHL write-back, which this app has never done —
// no POST path, no write scopes. Those controls are present but disabled rather
// than absent, so the finished shape is visible and nothing silently no-ops.

export function DealTasksSection({ dealId }) {
  const { items, loading, error } = useDealList(
    dealId,
    (id) => tasksAPI.list({ dealId: id, status: 'all', limit: 50 }),
    'tasks'
  )

  const [status, setStatus] = useState('open')
  const [sort, setSort] = useState('due')

  const counts = useMemo(() => {
    const open = items.filter((t) => t.status === 'open').length
    return { open, completed: items.length - open, all: items.length }
  }, [items])

  const shown = useMemo(() => {
    const filtered =
      status === 'all' ? items
        : status === 'open' ? items.filter((t) => t.status === 'open')
          : items.filter((t) => t.status !== 'open')

    // Copy before sorting — items is the fetched array and sorting in place
    // would mutate it, so the next filter change would start from a reordered
    // list rather than the server's order.
    return [...filtered].sort((a, b) =>
      sort === 'due'
        // Soonest first, and a task with no due date sorts last: it isn't
        // urgent, and putting it above an overdue one buries what matters.
        ? nullsLast(a.dueAt, b.dueAt, 'asc')
        // Newest first.
        : nullsLast(a.createdAt, b.createdAt, 'desc')
    )
  }, [items, status, sort])

  return (
    <Rail
      icon="task_alt"
      title="Tasks"
      accent="rose"
      meta={loading ? null : `${counts.open} open`}
      blurb="Yours and the agent's, in one list. The agent creates a task only when an action is agreed in chat and you confirm it. Syncs two-way with GHL — most recently updated wins."
      toolbar={
        !loading && items.length > 0 ? (
          <>
            <Segment
              options={[
                ['open', 'Open', counts.open],
                ['completed', 'Completed', counts.completed],
                ['all', 'All', counts.all]
              ]}
              value={status}
              onChange={setStatus}
            />
            <span style={{ flex: 1 }} />
            <SortControl
              label="Sort"
              options={[['due', 'Due date'], ['created', 'Created']]}
              value={sort}
              onChange={setSort}
            />
          </>
        ) : null
      }
      footer={
        !loading ? <RailFooter newLabel="New task" allLabel="All tasks" /> : null
      }
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyText="No tasks on this deal yet."
    >
      {/* An empty result from a filter is different from an empty deal — say
          which, or the Completed tab on a deal with two open tasks looks
          broken. */}
      {!loading && items.length > 0 && shown.length === 0 && (
        <Muted>
          {status === 'completed' ? 'Nothing completed yet.' : 'No open tasks.'}
        </Muted>
      )}

      {shown.map((t, i) => (
        <Row key={t.id} last={i === shown.length - 1} dim={t.status !== 'open'}>
          {/* Disabled: completing a task has to reach GHL. */}
          <button
            disabled
            title="Completing a task writes back to GoHighLevel — coming next"
            style={{
              flex: 'none', marginTop: 1,
              width: 18, height: 18, padding: 0,
              border: `1.5px solid ${
                t.status !== 'open'
                  ? 'var(--status-done)'
                  : t.overdue
                    ? 'var(--status-stuck)'
                    : 'var(--border-strong)'
              }`,
              borderRadius: t.status === 'open' ? '50%' : 'var(--radius-sm)',
              background: t.status !== 'open' ? 'var(--status-done)' : '#fff',
              cursor: 'not-allowed',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {t.status !== 'open' && (
              <span className="ms" style={{ fontSize: 13, color: '#fff' }}>check</span>
            )}
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)',
                textDecoration: t.status === 'open' ? 'none' : 'line-through'
              }}
            >
              {t.title || '(untitled task)'}
            </span>

            {t.body && (
              <div style={{ marginTop: 2 }}>
                <RichBody html={t.body} size="var(--text-base)" maxWidth={480} />
              </div>
            )}

            <span
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                marginTop: 5, flexWrap: 'wrap',
                fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
              }}
            >
              {[
                formatDue(t.dueAt),
                t.createdAt ? `added ${compactAge(t.createdAt)}` : null,
                t.owner
              ].filter(Boolean).join(' · ')}
              {t.overdue && t.status === 'open' && <OverduePill />}
            </span>
          </div>

          <EditButton title="Editing a task writes back to GoHighLevel — coming next" />
        </Row>
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

  const [sort, setSort] = useState('newest')

  const shown = useMemo(
    () => [...items].sort((a, b) =>
      nullsLast(a.createdAt, b.createdAt, sort === 'newest' ? 'desc' : 'asc')
    ),
    [items, sort]
  )

  return (
    <Rail
      icon="sticky_note_2"
      title="Notes"
      accent="gold"
      meta={loading ? null : `${items.length} ${items.length === 1 ? 'note' : 'notes'}`}
      toolbar={
        !loading && items.length > 0 ? (
          <>
            <span
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: 'var(--text-muted)'
              }}
            >
              Sort by created
            </span>
            <span style={{ flex: 1 }} />
            <SortControl
              options={[['newest', 'Newest'], ['oldest', 'Oldest']]}
              value={sort}
              onChange={setSort}
            />
          </>
        ) : null
      }
      footer={
        !loading ? <RailFooter newLabel="New note" allLabel="All notes" /> : null
      }
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyText="No notes on this deal yet."
    >
      {shown.map((n, i) => {
        const { heading, rest } = splitNote(n.body)
        return (
          <Row key={n.id} last={i === shown.length - 1}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, flex: 'none',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--tint-gold)', color: 'var(--accent-gold-text)'
              }}
            >
              <span className="ms" style={{ fontSize: 15 }}>sticky_note_2</span>
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
                }}
              >
                {heading}
              </span>
              {rest && (
                <div style={{ marginTop: 3 }}>
                  <RichBody html={rest} size="var(--text-base)" maxWidth={480} />
                </div>
              )}
              <span
                style={{
                  display: 'block', marginTop: 5,
                  fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
                }}
              >
                {[n.author, relativeTime(n.createdAt)].filter(Boolean).join(' · ')}
              </span>
            </div>

            <EditButton title="Editing a note writes back to GoHighLevel — coming next" />
          </Row>
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

function Rail({
  icon, title, accent, meta, blurb, toolbar, footer,
  loading, error, empty, emptyText, children
}) {
  const color = `var(--accent-${accent}-text)`
  const tint = `var(--tint-${accent})`
  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: color,
        ['--panel-tint']: tint,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: 'var(--space-3) 14px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--panel-tint, var(--gray-25))'
        }}
      >
        <span className="ms" style={{ fontSize: 19, color }}>{icon}</span>
        <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color, margin: 0, flex: 1 }}>
          {title}
        </h3>
        {meta != null && (
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>{meta}</span>
        )}
      </header>

      {blurb && (
        <p
          style={{
            margin: 0, padding: '11px 14px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--gray-50)',
            fontSize: 'var(--text-base)', lineHeight: 1.55, color: 'var(--text-body)'
          }}
        >
          {blurb}
        </p>
      )}

      {toolbar && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
            padding: '9px 14px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          {toolbar}
        </div>
      )}

      {loading && <Muted>Loading…</Muted>}
      {error && (
        <p
          style={{
            margin: 0, padding: 'var(--space-3) 14px',
            borderLeft: '3px solid var(--status-stuck)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-base)', color: 'var(--status-stuck)'
          }}
        >
          {error}
        </p>
      )}
      {empty && <Muted>{emptyText}</Muted>}
      {children}
      {footer}
    </section>
  )
}

function Row({ children, last, dim }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '11px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border-default)',
        // A completed task stays visible but recedes — useful history, not
        // something needing attention.
        opacity: dim ? 0.55 : 1
      }}
    >
      {children}
    </div>
  )
}

// Open / Completed / All, each with its count.
function Segment({ options, value, onChange }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([id, label, count]) => {
        const active = value === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              cursor: 'pointer',
              height: 27, padding: '0 10px',
              border: active
                ? '1.5px solid var(--brand-primary)'
                : '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: active ? 'var(--brand-primary)' : '#fff',
              color: active ? '#fff' : 'var(--text-body)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-base)', fontWeight: active ? 600 : 400
            }}
          >
            {label}
            {count != null && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                  // Brand digits on a now-solid-brand chip would be invisible.
                  color: active ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)'
                }}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </span>
  )
}

// A two-option sort toggle, with the label the design puts beside it.
function SortControl({ label, options, value, onChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {label && (
        <span
          style={{
            fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase', color: 'var(--text-muted)'
          }}
        >
          {label}
        </span>
      )}
      <span style={{ display: 'inline-flex', gap: 5 }}>
        {options.map(([id, text]) => {
          const active = value === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                cursor: 'pointer',
                height: 27, padding: '0 10px',
                border: active
                  ? '1.5px solid var(--brand-primary)'
                  : '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--brand-primary)' : '#fff',
                color: active ? '#fff' : 'var(--text-body)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-base)', fontWeight: active ? 600 : 400
              }}
            >
              {text}
            </button>
          )
        })}
      </span>
    </span>
  )
}

// "New task" + "All tasks →". Both disabled: creating needs GHL write-back, and
// the "all" link needs cross-tab navigation the rail isn't wired for yet.
function RailFooter({ newLabel, allLabel }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: '10px 14px',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      <button
        disabled
        title="Creating writes back to GoHighLevel — coming next"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          cursor: 'not-allowed',
          height: 30, padding: '0 13px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-pill)',
          background: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          color: 'var(--text-faint)', opacity: 0.7
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>add</span>
        {newLabel}
      </button>
      <button
        disabled
        title="Coming next"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          cursor: 'not-allowed',
          border: 'none', background: 'none', padding: 0,
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          color: 'var(--text-faint)', opacity: 0.75
        }}
      >
        {allLabel}
        <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
      </button>
    </div>
  )
}

function EditButton({ title }) {
  return (
    <button
      disabled
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flex: 'none',
        width: 28, height: 28, padding: 0,
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        background: '#fff',
        cursor: 'not-allowed',
        color: 'var(--text-faint)', opacity: 0.7
      }}
    >
      <span className="ms" style={{ fontSize: 15 }}>edit</span>
    </button>
  )
}

function OverduePill() {
  return (
    <span
      style={{
        padding: '2px 7px', borderRadius: 'var(--radius-sm)',
        background: 'var(--status-stuck)', color: '#fff',
        fontSize: 'var(--text-xs)', fontWeight: 600
      }}
    >
      Overdue
    </span>
  )
}

function Muted({ children }) {
  return (
    <p style={{ margin: 0, padding: 'var(--space-4) 14px', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
      {children}
    </p>
  )
}

// Sort comparator that always puts missing dates at the end, in both
// directions. A plain `a - b` on a null date yields NaN, which leaves the pair
// in whatever order it arrived — so a task with no due date can land above an
// overdue one, which is the opposite of useful.
function nullsLast(a, b, dir) {
  const ta = a ? new Date(a).getTime() : null
  const tb = b ? new Date(b).getTime() : null
  const va = ta != null && !Number.isNaN(ta) ? ta : null
  const vb = tb != null && !Number.isNaN(tb) ? tb : null
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  return dir === 'asc' ? va - vb : vb - va
}

// "3d ago" / "14d ago" — the compact form the design uses on the meta line,
// where relativeTime's "14 days ago" is too long beside a due date and an owner.
function compactAge(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 60) return 'just now'
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
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
