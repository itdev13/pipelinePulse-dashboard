import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Contact type / tag, as a panel with Apply and Cancel.
//
// Deliberately the same shape as DealFilters: a portal so nothing on the page
// can clip it, staged edits so three changes are one request rather than
// three, and a badge that counts only what is actually narrowing the list.
//
// Not shared with DealFilters as one component: the two have different fields
// and different option sources, and a single component taking a schema would
// be harder to read than two that each say what they filter.

const TYPE_OPTIONS = [
  { value: '', label: 'Any type' },
  { value: 'lead', label: 'Lead' },
  { value: 'customer', label: 'Customer' }
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

export function countContactFilters(f = {}) {
  return Object.entries(f).filter(([k, v]) => v && k !== 'view').length
}

export default function ContactFilters({ filters = {}, onChange, tags = [] }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(filters)

  useEffect(() => { if (open) setDraft(filters) }, [open, filters])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const applied = countContactFilters(filters)

  const set = (key, value) => {
    setDraft((d) => {
      const next = { ...d }
      if (!value) delete next[key]
      else next[key] = value
      return next
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Filter these contacts"
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
        // .pp-portal — tokens and the icon font are scoped to [data-dealhub],
        // which a portal escapes.
        <div
          className="pp-portal"
          role="dialog"
          aria-modal="true"
          aria-label="Filter contacts"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.32)',
            display: 'flex', justifyContent: 'flex-end'
          }}
        >
          <div style={{
            width: 'min(380px, 100vw)', height: '100%',
            background: 'var(--surface-card)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 28px rgba(0,0,0,0.14)'
          }}>
            <header style={{
              flex: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--space-3)', padding: 'var(--space-4)',
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
              flex: 1, overflowY: 'auto', padding: 'var(--space-4)',
              display: 'grid', gap: 'var(--space-4)', alignContent: 'start'
            }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={LABEL}>Contact type</span>
                <select
                  value={draft.contactType || ''}
                  onChange={(e) => set('contactType', e.target.value)}
                  style={SELECT}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              {/* Only when the location HAS tags — an empty dropdown says
                  nothing useful, and a sub-account that tags nothing should
                  not be shown a control it can never use. */}
              {tags.length > 0 && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={LABEL}>Tag</span>
                  <select
                    value={draft.tag || ''}
                    onChange={(e) => set('tag', e.target.value)}
                    style={SELECT}
                  >
                    <option value="">Any tag</option>
                    {tags.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <footer style={{
              flex: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--space-3)', padding: 'var(--space-4)',
              borderTop: '1px solid var(--border-default)'
            }}>
              {/* Clears the DRAFT — nothing here takes effect until Apply. */}
              <button
                onClick={() => setDraft({})}
                disabled={!countContactFilters(draft)}
                style={{
                  height: 36, padding: '0 4px',
                  border: 'none', background: 'transparent',
                  color: countContactFilters(draft) ? 'var(--text-muted)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                  textDecoration: countContactFilters(draft) ? 'underline' : 'none',
                  cursor: countContactFilters(draft) ? 'pointer' : 'default'
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
                  onClick={() => { onChange(draft); setOpen(false) }}
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
