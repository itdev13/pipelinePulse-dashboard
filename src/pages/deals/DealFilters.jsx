import React, { useEffect, useRef, useState } from 'react'

// Status / Stage / Owner, as one "Filters" control.
//
// A popover rather than three dropdowns sitting permanently in the strip:
// filtering is occasional, and three always-visible selects take the width
// the view tabs need and imply the list is filtered when it is not.
//
// WHAT IS NOT HERE. Sort. The server orders by "recently updated" and pages
// with a keyset cursor anchored to that order, so a sort control could only
// reorder the page already loaded — which looks like sorting and is not.
// Offering it properly means teaching the cursor other sort keys.
//
// Pipeline is also absent: on the board it selects WHICH board rather than
// narrowing one, so it has its own picker beside the view switch.

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'abandoned', label: 'Abandoned' },
  // GHL's own list carries this and it means "don't filter", not a fourth
  // outcome — worth spelling out so nobody reads it as a status.
  { value: 'all', label: 'Any status' }
]

const SELECT = {
  width: '100%', height: 34, padding: '0 10px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
  color: 'var(--text-body)', cursor: 'pointer'
}

const LABEL = {
  fontSize: 'var(--text-sm)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--text-muted)'
}

export default function DealFilters({
  filters = {}, onChange, stages = [], users = []
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  // Close on an outside click or Escape. A popover that can only be closed by
  // the button that opened it traps a rep who clicked elsewhere to dismiss it.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // `status: 'open'` is the default the list already applies, so it is not
  // counted — a badge reading "1" on an unfiltered board would be wrong.
  const count = Object.entries(filters)
    .filter(([k, v]) => v && !(k === 'status' && v === 'open')).length

  const set = (key, value) => {
    const next = { ...filters }
    if (!value) delete next[key]
    else next[key] = value
    onChange(next)
  }

  return (
    <span ref={boxRef} style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Filter these deals"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 36, padding: '0 12px',
          border: '1px solid',
          borderColor: count ? 'var(--green-300)' : 'var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          background: count ? 'var(--tint-pine)' : 'var(--surface)',
          color: count ? 'var(--green-600)' : 'var(--text-body)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
          fontWeight: count ? 600 : 500,
          cursor: 'pointer'
        }}
      >
        <span className="ms" style={{ fontSize: 17 }}>filter_list</span>
        Filters{count ? ` (${count})` : ''}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filter deals"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40,
            width: 260, padding: 'var(--space-3)',
            display: 'grid', gap: 'var(--space-3)',
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.10)'
          }}
        >
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={LABEL}>Status</span>
            <select
              value={filters.status || 'open'}
              onChange={(e) => set('status', e.target.value)}
              style={SELECT}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          {/* Stage is offered only when there ARE stages — on a location whose
              pipelines have not synced, an empty dropdown says nothing. */}
          {stages.length > 0 && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={LABEL}>Stage</span>
              <select
                value={filters.stageId || ''}
                onChange={(e) => set('stageId', e.target.value)}
                style={SELECT}
              >
                <option value="">Any stage</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}

          {users.length > 0 && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={LABEL}>Owner</span>
              <select
                value={filters.assignedTo || ''}
                onChange={(e) => set('assignedTo', e.target.value)}
                style={SELECT}
              >
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
                ))}
              </select>
            </label>
          )}

          {count > 0 && (
            <button
              onClick={() => { onChange({}); setOpen(false) }}
              style={{
                height: 32, border: 'none',
                borderRadius: 'var(--radius-md)',
                background: 'var(--gray-100)', color: 'var(--text-body)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                fontWeight: 500, cursor: 'pointer'
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </span>
  )
}
