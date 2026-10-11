import React from 'react'
import { Truncate } from '../shared/ListChrome'

// The bordered field boxes inside the deal card (client design, Oct 2026).
//
// Three places wanted the same shape — the customer's details, the deal's own
// name, and the stage facts (owner, days in stage, last contact, source):
//
//   ┌─ CUSTOMER · Alex Morgan ──────────────┐   <- a tinted strip
//   │ ⬚ FIRST NAME   │ ⬚ SECOND NAME        │   <- cells, 1px apart
//   │   Alex      ✎  │   Morgan        ✎    │
//   └────────────────┴───────────────────────┘
//
// Previously these were bare label-над-value pairs on the card's own white, so
// nine of them read as one undifferentiated block. The border is what makes
// "the customer's record" a thing you can see the edges of.
//
// THE 1px GAPS ARE THE BACKGROUND SHOWING THROUGH, not borders on the cells.
// Nine cells each drawing their own 1px line would double up where they meet
// and leave a 2px seam down the middle of the grid.

export function FieldCard({ icon, label, value, action, children, style }) {
  return (
    <div
      style={{
        border: '1px solid var(--gray-200)',
        borderRadius: 'var(--radius-sm)',
        background: '#fff',
        overflow: 'hidden',
        ...style
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px',
          background: 'var(--gray-25)',
          borderBottom: '1px solid var(--gray-200)'
        }}
      >
        {icon && (
          <span className="ms" style={{ fontSize: 16, color: 'var(--text-muted)', flex: 'none' }}>
            {icon}
          </span>
        )}
        <span className="pp-label" style={{ marginBottom: 0 }}>{label}</span>
        {value != null && value !== '' && (
          <Truncate style={{
            fontSize: 'var(--text-base)', fontWeight: 600,
            color: 'var(--text-heading)', marginLeft: 4, minWidth: 0
          }}>
            {value}
          </Truncate>
        )}
        {action && <span style={{ marginLeft: 'auto', flex: 'none' }}>{action}</span>}
      </div>
      {children}
    </div>
  )
}

// The grid the cells sit in. `background` is the gap colour — see the note
// above about why the cells themselves draw no borders.
export function FieldGrid({ children, columns = 2, style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 1,
        background: 'var(--gray-200)',
        ...style
      }}
    >
      {children}
    </div>
  )
}

// One cell: an icon, its label, and the value with an optional edit affordance.
export function FieldCell({ icon, label, value, onEdit, editTitle, tone, title }) {
  const empty = value == null || value === ''
  return (
    <div style={{ minWidth: 0, padding: '8px 12px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        {icon && (
          <span className="ms" style={{ fontSize: 15, color: 'var(--text-muted)', flex: 'none' }}>
            {icon}
          </span>
        )}
        <span className="pp-label" style={{ marginBottom: 0 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {/* An em dash, not a blank: an empty row and a row whose value is
            missing look identical otherwise, and a gap in the customer's
            record is the thing a rep is meant to notice. */}
        {/* `tone` carries a warning the value itself cannot say — a last
            contact date is just a date until you know it is two weeks old.
            The title explains it in words, since colour alone is not a
            message a screen reader relays. */}
        <Truncate title={title} style={{
          fontSize: 'var(--text-base)', lineHeight: 1.35,
          fontWeight: tone === 'danger' ? 600 : 400,
          color: tone === 'danger'
            ? 'var(--status-stuck-text)'
            : (empty ? 'var(--text-faint)' : 'var(--text-body)')
        }}>
          {empty ? '—' : value}
        </Truncate>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title={editTitle || `Edit ${String(label).toLowerCase()}`}
            aria-label={editTitle || `Edit ${String(label).toLowerCase()}`}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flex: 'none', width: 20, height: 20, padding: 0,
              border: 'none', background: 'none',
              color: 'var(--text-faint)', cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 15 }}>edit</span>
          </button>
        )}
      </div>
    </div>
  )
}
