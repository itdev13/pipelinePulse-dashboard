import React from 'react'

// Shared chrome for the list tabs (Notes / Tasks / Deals).
//
// All three share a vocabulary: a page header with a subtitle and an optional
// action, an accent-bordered section with a count, contact + deal chips, and
// the same loading/empty/error states. Before this, each tab re-implemented
// all of it with slightly different padding and chip borders.

export function PageHeader({ title, subtitle, action }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        flexWrap: 'wrap', marginBottom: 4
      }}
    >
      <h1 style={{ fontSize: 25, fontWeight: 600, margin: 0 }}>{title}</h1>
      {subtitle && (
        <p
          style={{
            margin: 0, flex: 1, minWidth: 200,
            fontSize: 13, color: 'var(--text-muted)'
          }}
        >
          {subtitle}
        </p>
      )}
      {action}
    </div>
  )
}

export function Panel({ icon, title, accent, meta, children, toolbar }) {
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
          padding: '12px 16px'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color }}>{icon}</span>
        <h2 style={{ fontSize: 18, fontWeight: 600, color, margin: 0, flex: 1 }}>
          {title}
        </h2>
        {meta != null && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{meta}</span>
        )}
      </header>

      {toolbar && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 16px',
            borderTop: '1px solid var(--border-default)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--gray-50)'
          }}
        >
          {toolbar}
        </div>
      )}

      {children}
    </section>
  )
}

// A row in a Panel. Last row drops its divider so it doesn't double up with
// the panel's own border.
export function Row({ children, last, align = 'flex-start' }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: align, gap: 12,
        padding: '13px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border-default)'
      }}
    >
      {children}
    </div>
  )
}

// ── Chips ─────────────────────────────────────────────────────────────

export function ContactChip({ name, onClick }) {
  return (
    <Chip icon="person" onClick={onClick} title={onClick ? 'Open contact record' : undefined}>
      {name || 'Contact'}
    </Chip>
  )
}

export function DealChip({ name, onClick }) {
  return (
    <Chip
      icon="sell"
      onClick={onClick}
      title={onClick ? 'Open this deal' : undefined}
      tone="deal"
    >
      {name}
    </Chip>
  )
}

export function Chip({ icon, children, onClick, title, tone, danger }) {
  const isDeal = tone === 'deal'
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={!onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        maxWidth: 260,
        height: 30, padding: '0 12px',
        border: `1px solid ${
          danger ? 'var(--border-default)'
            : isDeal ? 'var(--green-300)'
            : 'var(--border-default)'
        }`,
        borderRadius: 'var(--radius-pill)',
        background: isDeal ? 'var(--green-50)' : '#fff',
        color: danger
          ? 'var(--status-stuck)'
          : isDeal ? 'var(--green-600)' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12.5, fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap'
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 15, flex: 'none' }}>{icon}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </button>
  )
}

// Small square icon button for row-level edit / delete.
export function RowAction({ icon, onClick, title, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, flex: 'none',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        color: danger ? 'var(--status-stuck)' : 'var(--text-muted)',
        cursor: 'pointer'
      }}
    >
      <span className="ms" style={{ fontSize: 16 }}>{icon}</span>
    </button>
  )
}

export function PrimaryAction({ children, onClick, icon = 'add' }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 36, padding: '0 16px',
        border: 'none', borderRadius: 'var(--radius-md)',
        background: 'var(--green-600)', color: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500,
        cursor: 'pointer'
      }}
    >
      <span className="ms" style={{ fontSize: 18 }}>{icon}</span>
      {children}
    </button>
  )
}

export function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 32, padding: '0 15px',
        border: active
          ? '1.5px solid var(--brand-primary)'
          : '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--surface-selected)' : '#fff',
        color: active ? 'var(--brand-primary)' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )
}

export function SearchInput({ value, onChange, placeholder, width = 300 }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width, maxWidth: '100%', height: 36, boxSizing: 'border-box',
        padding: '0 12px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-body)'
      }}
    />
  )
}

// Loading / empty / error, so every tab words these the same way.
export function StateMessage({ loading, error, empty, emptyText, loadingText }) {
  if (error) {
    return (
      <div
        style={{
          padding: '16px', borderLeft: '3px solid var(--status-stuck)',
          background: 'var(--tint-rose)', color: 'var(--status-stuck)',
          fontSize: 13
        }}
      >
        {error}
      </div>
    )
  }
  if (loading) {
    return <Muted>{loadingText || 'Loading…'}</Muted>
  }
  if (empty) {
    return <Muted>{emptyText}</Muted>
  }
  return null
}

function Muted({ children }) {
  return (
    <div style={{ padding: '22px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}

export function Shell({ children, maxWidth = 1140 }) {
  return (
    <div
      style={{
        maxWidth, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: '4px 20px 48px',
        display: 'grid', gap: 16
      }}
    >
      {children}
    </div>
  )
}

// ── Date helpers, shared so the tabs word dates identically ───────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDate(iso, withYear = true) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`
}

// Relative phrasing for recent things ("2 days ago"), absolute past a
// fortnight where "23 days ago" stops being easier to read than a date.
export function relativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days <= 14) return `${days} days ago`
  return formatDate(iso)
}

// Due dates read as "due yesterday / today / tomorrow" near now, and as a
// date further out — matching the design's phrasing.
export function formatDue(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDue = new Date(d)
  startOfDue.setHours(0, 0, 0, 0)
  const days = Math.round((startOfDue - startOfToday) / 86400000)
  if (days === 0) return 'due today'
  if (days === -1) return 'due yesterday'
  if (days === 1) return 'due tomorrow'
  if (days < -1 && days >= -14) return `due ${Math.abs(days)} days ago`
  return `due ${formatDate(iso, false)}`
}

export function initialsFor(firstName, lastName, fallback) {
  const a = (firstName || '').trim()
  const b = (lastName || '').trim()
  if (a && b) return (a[0] + b[0]).toUpperCase()
  if (a) return a.slice(0, 2).toUpperCase()
  if (b) return b.slice(0, 2).toUpperCase()
  const f = (fallback || '').trim()
  return f ? f[0].toUpperCase() : '?'
}

export function nameFor(p) {
  const first = (p?.firstName || '').trim()
  const last = (p?.lastName || '').trim()
  if (first && last) return `${first} ${last}`
  return first || last || p?.email || p?.phone || p?.business || 'Contact'
}
