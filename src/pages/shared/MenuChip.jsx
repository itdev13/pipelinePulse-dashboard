import React from 'react'
import { Popover } from 'antd'

// The list views' chip-with-a-menu: "[👤 2 contacts ▾]", "[🏷 2 · £46,300 ▾]".
//
// Shared by the Deals List and the Businesses List so the two read as one
// application — same shape, same colours per kind of record, same menu.
// The row behind a chip opens its record, so a click on the chip (or inside
// its menu) never reaches the row.

// Chip colours, by what the chip is. Tasks carry a STATE: no open tasks on an
// open deal is the thing to notice, so `noTasks` is red.
export const TONES = {
  contact:  { border: 'var(--accent-sky)', fg: 'var(--accent-sky-text)', bg: 'var(--surface-card)' },
  business: { border: 'var(--accent-plum)', fg: 'var(--accent-plum-text)', bg: 'var(--surface-card)' },
  deals:    { border: 'var(--green-500)', fg: 'var(--green-600)', bg: 'var(--tint-pine)' },
  neutral:  { border: 'var(--border-strong)', fg: 'var(--text-body)', bg: 'var(--surface-card)' },
  tasks:    { border: 'var(--accent-clay)', fg: 'var(--accent-clay-text)', bg: 'var(--tint-clay)' },
  noTasks:  { border: 'var(--status-stuck)', fg: 'var(--status-stuck-text)', bg: 'var(--surface-card)' },
  notes:    { border: 'var(--accent-gold)', fg: 'var(--accent-gold-text)', bg: 'var(--tint-gold)' },
  muted:    { border: 'var(--border-strong)', fg: 'var(--text-muted)', bg: 'var(--surface-card)' }
}

// A chip with a ▾ that opens `menu`. Without a menu it is a plain label.
export function MenuChip({ icon, tone = 'neutral', label, title, menu, onOpenChange, maxWidth = 150 }) {
  const t = TONES[tone] || TONES.neutral
  const chip = (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      title={title || label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        maxWidth, height: 26, padding: menu ? '0 6px 0 9px' : '0 9px',
        border: `1px solid ${t.border}`, borderRadius: 'var(--radius-pill)',
        background: t.bg, color: t.fg,
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 500,
        cursor: menu ? 'pointer' : 'default', whiteSpace: 'nowrap'
      }}
    >
      <span className="ms" style={{ fontSize: 15, flex: 'none' }}>{icon}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {menu && <span className="ms" style={{ fontSize: 16, flex: 'none' }}>expand_more</span>}
    </button>
  )
  if (!menu) return chip
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      // .pp-portal: the popover renders at the document root, outside
      // [data-dealhub], and without this class every token in it is unset.
      rootClassName="pp-portal"
      content={<div onClick={(e) => e.stopPropagation()} style={{ minWidth: 220, maxWidth: 300 }}>{menu}</div>}
      onOpenChange={onOpenChange}
    >
      {chip}
    </Popover>
  )
}

export function MenuHeading({ children }) {
  return <div className="pp-label" style={{ marginBottom: 6 }}>{children}</div>
}

export function MenuNote({ children, danger }) {
  return (
    <p style={{
      margin: '2px 0', fontSize: 'var(--text-md)',
      color: danger ? 'var(--status-stuck-text)' : 'var(--text-muted)'
    }}>
      {children}
    </p>
  )
}

export function MenuFooter({ label, onClick }) {
  if (!onClick) return null
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%',
        marginTop: 8, paddingTop: 8, border: 'none',
        borderTop: '1px solid var(--border-default)', background: 'none',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
        color: 'var(--text-link)', cursor: 'pointer'
      }}
    >
      {label}
      <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
    </button>
  )
}

// The list toolbar's pill buttons — Collapse all, Columns.
export const TOOL_BUTTON = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-pill)',
  background: 'var(--surface-card)', color: 'var(--text-body)',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
  cursor: 'pointer'
}

// "Columns · 7 of 10 ▾" — a popover of checkboxes, one per hideable column.
// `columns` is [{ key, label }]; `hidden` a Set of keys; `fixed` how many
// columns cannot be hidden (counted in the "of" total).
export function ColumnsMenu({ columns, hidden, onToggle, fixed = 1 }) {
  const shown = columns.filter((c) => !hidden.has(c.key)).length
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      rootClassName="pp-portal"
      content={
        <div style={{ display: 'grid', gap: 4, minWidth: 190 }}>
          <MenuHeading>Show columns</MenuHeading>
          {columns.map((c) => (
            <label key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
              fontSize: 'var(--text-md)', color: 'var(--text-body)', cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={!hidden.has(c.key)}
                onChange={() => onToggle(c.key)}
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              {c.label}
            </label>
          ))}
        </div>
      }
    >
      <button type="button" style={TOOL_BUTTON}>
        <span className="ms" style={{ fontSize: 17 }}>view_column</span>
        Columns · {shown + fixed} of {columns.length + fixed}
        <span className="ms" style={{ fontSize: 17 }}>expand_more</span>
      </button>
    </Popover>
  )
}
