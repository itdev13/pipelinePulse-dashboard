import React, { useEffect, useState } from 'react'
import { Select } from 'antd'
import { createPortal } from 'react-dom'

// Status / Stage / Owner, as a panel with Apply and Cancel.
//
// WHY A PANEL AND NOT A DROPDOWN. It was an absolutely-positioned popover
// anchored to its button, and it was invisible: the board's horizontally
// scrolling column strip sits directly beneath the toolbar and covered it.
// Rendering into a portal at the document root puts it above every stacking
// context on the page rather than fighting them one at a time.
//
// WHY APPLY. Each select used to fire a request the moment it changed, so
// setting three filters meant three round trips and two intermediate results
// the rep never wanted to see. Changes are now staged and sent once — which
// also makes Cancel meaningful.
//
// NOT HERE: sort (the keyset cursor is anchored to "recently updated", so a
// sort control could only reorder the page already loaded) and pipeline (on
// the board it selects WHICH board, so it lives beside the view switch).

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'abandoned', label: 'Abandoned' },
  // "Any status" rather than GHL's "all": it means "do not filter", not a
  // fifth outcome, and the wording should not invite reading it as one.
  { value: 'all', label: 'Any status' }
]

const SELECT = {
  width: '100%', height: 38, padding: '0 11px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface-card)',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
  color: 'var(--text-body)', cursor: 'pointer'
}

const LABEL = {
  fontSize: 'var(--text-sm)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--text-muted)'
}

// `status: 'open'` is the default the list already applies, so it does not
// count — a badge reading "1" on an unfiltered board would be wrong.
export function countFilters(f = {}) {
  return Object.entries(f).filter(([k, v]) => v && !(k === 'status' && v === 'open')).length
}

export default function DealFilters({
  filters = {}, onChange, stages = [], users = []
}) {
  const [open, setOpen] = useState(false)
  // Staged, not live: edits apply on Apply, and Cancel throws them away.
  const [draft, setDraft] = useState(filters)

  // Re-seed each time the panel opens, so it always reflects what is actually
  // applied rather than an abandoned edit from last time.
  useEffect(() => { if (open) setDraft(filters) }, [open, filters])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const applied = countFilters(filters)

  const set = (key, value) => {
    setDraft((d) => {
      const next = { ...d }
      if (!value) delete next[key]
      else next[key] = value
      return next
    })
  }

  function apply() {
    onChange(draft)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Filter these deals"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 36, padding: '0 12px', flex: 'none',
          border: '1px solid',
          borderColor: applied ? 'var(--green-300)' : 'var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          background: applied ? 'var(--tint-pine)' : 'var(--surface-card)',
          color: applied ? 'var(--green-600)' : 'var(--text-body)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
          fontWeight: applied ? 600 : 500,
          cursor: 'pointer'
        }}
      >
        <span className="ms" style={{ fontSize: 17 }}>filter_list</span>
        Filters{applied ? ` (${applied})` : ''}
      </button>

      {open && createPortal(
        // .pp-portal — the design tokens and the icon font are scoped to
        // [data-dealhub], which a portal escapes. Without it every var()
        // below resolves to nothing and the icons render as literal text.
        <div
          className="pp-portal"
          role="dialog"
          aria-modal="true"
          aria-label="Filter deals"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.32)',
            display: 'flex', justifyContent: 'flex-end'
          }}
        >
          <div
            style={{
              width: 'min(380px, 100vw)', height: '100%',
              background: 'var(--surface-card)',
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 28px rgba(0,0,0,0.14)'
            }}
          >
            <header style={{
              flex: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              borderBottom: '1px solid var(--border-default)'
            }}>
              <h2 style={{
                margin: 0, fontSize: 'var(--text-xl)', fontWeight: 600,
                color: 'var(--text-heading)', letterSpacing: '-0.01em'
              }}>
                Filters
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, flex: 'none',
                  border: '1px solid var(--border-default)', borderRadius: '50%',
                  background: 'transparent', color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <span className="ms" style={{ fontSize: 18 }}>close</span>
              </button>
            </header>

            <div style={{
              flex: 1, overflowY: 'auto',
              padding: 'var(--space-4)',
              display: 'grid', gap: 'var(--space-4)', alignContent: 'start'
            }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={LABEL}>Status</span>
                <Select
                  value={draft.status || 'open' || undefined}
                  onChange={(v) => set('status', v)}
                  options={STATUS_OPTIONS}
                  // Searchable, and OUR menu — a native <select>
                  // renders the OS's own list, which cannot be
                  // styled, searched or given the app's type.
                  showSearch
                  optionFilterProp="label"
                  popupClassName="pp-menu"
                  style={{ width: '100%' }}
                  styles={{ root: { height: 38 } }}
                />
              </label>

              {/* Offered only when the lists exist. On a sub-account whose
                  pipelines or users have not synced, an empty dropdown says
                  nothing useful — better absent than broken. */}
              {stages.length > 0 && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={LABEL}>Stage</span>
                  <Select
                    value={draft.stageId || undefined}
                    onChange={(v) => set('stageId', v)}
                    // Searchable, and OUR menu: a native <select> renders the
                    // OS's own list, which cannot be styled or searched.
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="Any stage"
                    options={stages.map((s) => ({ value: s.id, label: s.name }))}
                    popupClassName="pp-menu"
                    style={{ width: '100%' }}
                    styles={{ root: { height: 38 } }}
                  />
                </label>
              )}

              {users.length > 0 && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={LABEL}>Owner</span>
                  <Select
                    value={draft.assignedTo || undefined}
                    onChange={(v) => set('assignedTo', v)}
                    // Searchable, and OUR menu: a native <select> renders the
                    // OS's own list, which cannot be styled or searched.
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    placeholder="Anyone"
                    options={users.map((u) => ({ value: u.id, label: u.name || u.email || u.id }))}
                    popupClassName="pp-menu"
                    style={{ width: '100%' }}
                    styles={{ root: { height: 38 } }}
                  />
                </label>
              )}
            </div>

            <footer style={{
              flex: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              borderTop: '1px solid var(--border-default)'
            }}>
              {/* Clears the DRAFT, not the applied filters — nothing here
                  takes effect until Apply, including this. */}
              <button
                onClick={() => setDraft({})}
                disabled={!countFilters(draft)}
                style={{
                  height: 36, padding: '0 4px',
                  border: 'none', background: 'transparent',
                  color: countFilters(draft) ? 'var(--text-muted)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                  textDecoration: countFilters(draft) ? 'underline' : 'none',
                  cursor: countFilters(draft) ? 'pointer' : 'default'
                }}
              >
                Clear all
              </button>

              <span style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    height: 36, padding: '0 14px',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-card)',
                    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                    fontWeight: 500, color: 'var(--text-body)', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={apply}
                  className="pp-btn-primary"
                  style={{
                    height: 36, padding: '0 16px',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    background: 'var(--brand-primary)', color: '#fff',
                    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                    fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
              </span>
            </footer>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
