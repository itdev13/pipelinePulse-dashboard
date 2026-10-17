import React, { useEffect, useMemo, useRef, useState } from 'react'
import { contactsAPI } from '../api/contacts'
import { initialsFor } from '../pages/shared/ListChrome'

// RecipientsField — the To / CC / BCC rows of an email draft, GHL-style.
//
// An email in GHL files under ONE contact's conversation, so To is a single
// person; CC and BCC are lists. The rows mirror that: To is one chip that
// can be swapped, CC and BCC take any number. Each row's picker offers the
// deal's own people first (handed in as `options` by the server), then
// searches every contact in the sub-account as the rep types, and accepts
// a typed address that matches nobody — a solicitor, a builder's office —
// on Enter or comma.
//
// Value contract mirrors the server's payload:
//   { to: {contactId, name, email}, cc: [{contactId?, name?, email}], bcc: [...] }

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/
const DEBOUNCE_MS = 250

const nameOf = (c) =>
  [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.business || c.email || 'Contact'

const fromContact = (c) => ({ contactId: c.id, name: nameOf(c), email: String(c.email || '').toLowerCase() })

export default function RecipientsField({ value, onChange, options = [], disabled = false }) {
  const v = useMemo(() => value || { to: null, cc: [], bcc: [] }, [value])
  const [showBcc, setShowBcc] = useState((v.bcc || []).length > 0)
  const taken = useMemo(() => {
    const s = new Set()
    if (v.to?.email) s.add(v.to.email.toLowerCase())
    for (const r of [...(v.cc || []), ...(v.bcc || [])]) if (r?.email) s.add(r.email.toLowerCase())
    return s
  }, [v])

  const set = (patch) => onChange({ to: v.to, cc: v.cc || [], bcc: v.bcc || [], ...patch })

  return (
    <div style={{
      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-card)', overflow: 'visible'
    }}>
      <Row label="To" last={false}>
        <ChipInput
          single
          contactsOnly
          values={v.to ? [v.to] : []}
          onAdd={(r) => set({ to: r })}
          onRemove={() => {}}
          options={options}
          taken={taken}
          disabled={disabled}
          placeholder={v.to ? '' : 'Choose a contact'}
        />
      </Row>
      <Row label="CC" last={!showBcc} trailing={!showBcc && (
        <button type="button" onClick={() => setShowBcc(true)} style={linkBtn}>Bcc</button>
      )}>
        <ChipInput
          values={v.cc || []}
          onAdd={(r) => set({ cc: [...(v.cc || []), r] })}
          onRemove={(i) => set({ cc: (v.cc || []).filter((_, j) => j !== i) })}
          options={options}
          taken={taken}
          disabled={disabled}
          placeholder={(v.cc || []).length ? '' : 'Add people or an email'}
        />
      </Row>
      {showBcc && (
        <Row label="BCC" last>
          <ChipInput
            values={v.bcc || []}
            onAdd={(r) => set({ bcc: [...(v.bcc || []), r] })}
            onRemove={(i) => set({ bcc: (v.bcc || []).filter((_, j) => j !== i) })}
            options={options}
            taken={taken}
            disabled={disabled}
            placeholder={(v.bcc || []).length ? '' : 'Add people or an email'}
          />
        </Row>
      )}
    </div>
  )
}

const linkBtn = {
  border: 0, background: 'none', padding: '0 4px', cursor: 'pointer',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
  color: 'var(--accent-sky-text)'
}

function Row({ label, children, last, trailing }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', alignItems: 'start',
      gap: 8, padding: '6px 10px',
      borderBottom: last ? 'none' : '1px solid var(--border-default)'
    }}>
      <span style={{
        paddingTop: 5, fontSize: 'var(--text-sm)', fontWeight: 600,
        color: 'var(--text-muted)', letterSpacing: 'var(--tracking-label)'
      }}>
        {label}
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
      <span style={{ paddingTop: 3 }}>{trailing || null}</span>
    </div>
  )
}

// Chips plus a search box, with the suggestion list beneath.
function ChipInput({ values, onAdd, onRemove, options, taken, disabled, placeholder, single = false, contactsOnly = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const reqId = useRef(0)

  // Server search as the rep types. The deal's people are already in
  // `options`, so the request only matters once the query leaves them.
  useEffect(() => {
    const q = query.trim()
    if (!open || !q) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = ++reqId.current
    const t = window.setTimeout(() => {
      contactsAPI.list({ q, limit: 8 })
        .then((res) => { if (id === reqId.current) setResults(res?.contacts || []) })
        .catch(() => { if (id === reqId.current) setResults([]) })
        .finally(() => { if (id === reqId.current) setLoading(false) })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query, open])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = query.trim().toLowerCase()
  const suggestions = useMemo(() => {
    const seen = new Set()
    const rows = []
    const push = (r, source) => {
      const k = (r.email || '').toLowerCase()
      if (!k || seen.has(k) || taken.has(k)) return
      seen.add(k)
      rows.push({ ...r, source })
    }
    for (const o of options) {
      if (!q || `${o.name} ${o.email}`.toLowerCase().includes(q)) push(o, 'deal')
    }
    for (const c of results) if (c.email) push(fromContact(c), 'search')
    // A typed address is only an option where a non-contact can go: the To
    // is the conversation the email files under, so it has to be a contact.
    if (!contactsOnly && q && EMAIL_RE.test(q) && !seen.has(q) && !taken.has(q)) rows.push({ email: q, name: null, source: 'typed' })
    return rows
  }, [options, results, q, taken, contactsOnly])

  useEffect(() => { setActive(0) }, [suggestions.length, q])

  const pick = (r) => {
    if (!r) return
    onAdd({ contactId: r.contactId || null, name: r.name || null, email: r.email })
    setQuery('')
    if (single) setOpen(false)
    else inputRef.current?.focus()
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (!open || !suggestions.length) {
        if (!contactsOnly && q && EMAIL_RE.test(q)) { e.preventDefault(); pick({ email: q }) }
        return
      }
      e.preventDefault()
      pick(suggestions[active])
    } else if (e.key === 'Backspace' && !query && values.length && !single) {
      onRemove(values.length - 1)
    } else if (e.key === 'Escape') setOpen(false)
  }

  const showInput = !(single && values.length)

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus() } }}
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 30, cursor: 'text' }}
      >
        {values.map((r, i) => (
          <Chip
            key={`${r.email}-${i}`}
            r={r}
            onRemove={disabled || single ? null : () => onRemove(i)}
            single={single}
            onSwap={single && !disabled ? () => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) } : null}
          />
        ))}
        {(showInput || (single && open)) && (
          <input
            ref={inputRef}
            value={query}
            disabled={disabled}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder={placeholder}
            style={{
              flex: '1 1 140px', minWidth: 120, height: 28, border: 0, outline: 'none',
              background: 'transparent', fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-base)', color: 'var(--text-heading)'
            }}
          />
        )}
      </div>
      {open && !disabled && (suggestions.length > 0 || loading || q) && (
        <div
          role="listbox"
          style={{
            position: 'absolute', left: -54, right: -10, top: 'calc(100% + 6px)', zIndex: 20,
            maxHeight: 280, overflowY: 'auto',
            background: 'var(--surface-raised, #fff)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', boxShadow: '0 12px 32px rgba(16, 24, 40, 0.14)',
            padding: 4
          }}
        >
          {suggestions.map((r, i) => (
            <button
              type="button"
              key={`${r.email}-${r.source}`}
              onMouseDown={(e) => { e.preventDefault(); pick(r) }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '7px 10px', border: 0, textAlign: 'left', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                background: i === active ? 'var(--surface-hover)' : 'transparent',
                fontFamily: 'var(--font-sans)'
              }}
            >
              <Avatar r={r} />
              <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-heading)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.source === 'typed' ? `Add "${r.email}"` : r.name}
                </span>
                {r.source !== 'typed' && (
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.email}
                  </span>
                )}
              </span>
              {r.source === 'deal' && (
                <span style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent-pine-text)',
                  background: 'var(--tint-pine)', borderRadius: 'var(--radius-pill)', padding: '2px 8px'
                }}>
                  {r.isPrimary ? 'Primary' : 'On deal'}
                </span>
              )}
            </button>
          ))}
          {loading && (
            <div style={{ padding: '8px 10px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Searching…</div>
          )}
          {!loading && !suggestions.length && q && (
            <div style={{ padding: '8px 10px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              No contact matches — type a full address to add it.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Avatar({ r, size = 24 }) {
  const label = r.name || r.email || '?'
  return (
    <span aria-hidden="true" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, flex: 'none', borderRadius: '50%',
      background: r.contactId ? 'var(--tint-sky)' : 'var(--gray-100)',
      color: r.contactId ? 'var(--accent-sky-text)' : 'var(--gray-600)',
      fontSize: size <= 24 ? 10 : 'var(--text-xs)', fontWeight: 700, letterSpacing: 0.3
    }}>
      {initialsFor(label)}
    </span>
  )
}

function Chip({ r, onRemove, single, onSwap }) {
  const label = r.name && r.email ? `${r.name}` : (r.email || r.name || '')
  return (
    <span
      title={r.email || undefined}
      onClick={onSwap || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28,
        padding: '0 6px 0 3px', borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--border-default)', background: 'var(--gray-50)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
        color: 'var(--text-heading)', maxWidth: '100%', cursor: onSwap ? 'pointer' : 'default'
      }}
    >
      <Avatar r={r} size={22} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {r.name && r.email && (
        <span style={{ color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.email}
        </span>
      )}
      {onRemove && !single && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          style={{
            border: 0, background: 'none', padding: 0, marginLeft: 2, cursor: 'pointer',
            display: 'inline-flex', color: 'var(--text-muted)'
          }}
        >
          <span className="ms" style={{ fontSize: 15 }}>close</span>
        </button>
      )}
      {single && onSwap && (
        <span className="ms" style={{ fontSize: 15, color: 'var(--text-muted)' }}>expand_more</span>
      )}
    </span>
  )
}
