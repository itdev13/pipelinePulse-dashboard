import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import ContactPicker from './ContactPicker'
import RemotePicker from './RemotePicker'
import { searchDeals } from '../../hooks/useLinkTargets'

// Contact / deal filters for the Tasks and Notes tabs.
//
// Same shape as DealFilters and ContactFilters: a portal so nothing clips it,
// staged edits so two changes are one request, and a badge counting only what
// is actually narrowing the list.
//
// Pickers rather than dropdowns: a location has thousands of contacts and
// hundreds of deals, so these SEARCH the server. A <select> would have to
// preload everything to be useful, and would still miss whatever fell outside
// the first page.

export function countWorkFilters(f = {}) {
  return Object.entries(f).filter(([k, v]) => v && k !== 'view').length
}

const LABEL = {
  fontSize: 'var(--text-sm)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--text-muted)'
}

export default function WorkFilters({ filters = {}, onChange, noun = 'tasks' }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(filters)

  useEffect(() => { if (open) setDraft(filters) }, [open, filters])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const applied = countWorkFilters(filters)

  const set = (key, value) => {
    setDraft((d) => {
      const next = { ...d }
      if (!value) delete next[key]
      else next[key] = value
      return next
    })
  }

  // The deal picker is scoped to the chosen contact when there is one — the
  // same rule the note and task editors follow, so a filter cannot offer a
  // deal that contact is not on.
  const dealSearch = React.useCallback(
    (q) => searchDeals(q, { contactId: draft.contactId || undefined }),
    [draft.contactId]
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Filter these ${noun}`}
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
        <div
          className="pp-portal"
          role="dialog"
          aria-modal="true"
          aria-label={`Filter ${noun}`}
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
                <span style={LABEL}>Contact</span>
                <ContactPicker
                  value={draft.contactId || null}
                  onChange={(id) => {
                    set('contactId', id)
                    // The deal picker is scoped to the contact, so a deal
                    // chosen under the previous one may no longer be valid.
                    setDraft((d) => { const n = { ...d }; delete n.dealId; return n })
                  }}
                  placeholder="Anyone"
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={LABEL}>Deal</span>
                <RemotePicker
                  value={draft.dealId || null}
                  onChange={(id) => set('dealId', id)}
                  search={dealSearch}
                  seed={[]}
                  placeholder="Any deal"
                  emptyText="No deal matches that"
                  style={{ width: '100%' }}
                />
              </label>
            </div>

            <footer style={{
              flex: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--space-3)', padding: 'var(--space-4)',
              borderTop: '1px solid var(--border-default)'
            }}>
              <button
                onClick={() => setDraft({})}
                disabled={!countWorkFilters(draft)}
                style={{
                  height: 36, padding: '0 4px',
                  border: 'none', background: 'transparent',
                  color: countWorkFilters(draft) ? 'var(--text-muted)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                  textDecoration: countWorkFilters(draft) ? 'underline' : 'none',
                  cursor: countWorkFilters(draft) ? 'pointer' : 'default'
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
