import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Select, Spin } from 'antd'
import { contactsAPI } from '../../api/contacts'

// Pick the contact a task or note belongs to.
//
// WHY THIS EXISTS. Tasks and notes are stored against a CONTACT in GHL, so
// creating either needs one. On the Deal Hub that's easy — the deal supplies its
// people. On the standalone Tasks and Notes pages there is no deal in scope, and
// the editors were being handed an empty list: the Select rendered disabled with
// "No contacts", so a task could not be created there at all.
//
// Searches OUR contacts table (GET /api/contacts?q=), not GHL's endpoint
// directly. Three reasons: it runs under RLS so a search can only ever return
// this sub-account's people, it matches name, email, phone AND business in one
// query, and it doesn't spend a GHL API call per keystroke.
//
// `options` are seeded from whatever the caller already has (a deal's people),
// so the common case needs no request at all.

const DEBOUNCE_MS = 250
const PAGE = 20

export default function ContactPicker({
  value,
  onChange,
  // Contacts the caller already holds — a deal's people. Shown before any
  // search, so picking from a deal stays a single click.
  seed = [],
  disabled,
  invalid,
  autoFocus
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  // The contact currently chosen, kept so its label survives a new search that
  // doesn't include it — otherwise the box would go blank mid-edit.
  const [chosen, setChosen] = useState(null)

  const reqId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    const id = ++reqId.current
    const t = window.setTimeout(() => {
      contactsAPI.list({ q, limit: PAGE })
        .then((res) => {
          // Ignore a response that arrived after a newer one — typing fast
          // otherwise leaves an earlier query's results on screen.
          if (id !== reqId.current) return
          setResults(res.contacts || [])
        })
        .catch(() => { if (id === reqId.current) setError(true) })
        .finally(() => { if (id === reqId.current) setLoading(false) })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  const options = useMemo(() => {
    const seen = new Set()
    const rows = []
    // Chosen first so it is always present, then the seed, then results.
    for (const c of [chosen, ...seed, ...results].filter(Boolean)) {
      if (!c.id || seen.has(c.id)) continue
      seen.add(c.id)
      rows.push({ value: c.id, label: labelFor(c), contact: c })
    }
    return rows.map(({ value: v, label, contact }) => ({
      value: v,
      label,
      // Two lines, like GHL's own user picker: who they are, then how to tell
      // them apart. A list of "Contact / lead" rows is unusable.
      title: label,
      renderLabel: contact
    }))
  }, [chosen, seed, results])

  return (
    <Select
      className={invalid ? 'pp-invalid-select' : undefined}
      value={value || undefined}
      onChange={(v, opt) => {
        setChosen(opt?.renderLabel || null)
        onChange(v || '')
      }}
      onSearch={setQuery}
      // Server-side search — antd must not also filter the results it was given,
      // or a match on phone or business gets hidden because the visible label
      // doesn't contain the query.
      filterOption={false}
      options={options}
      optionRender={(opt) => <ContactRow contact={opt.data.renderLabel} />}
      labelRender={(opt) => opt.label}
      showSearch
      allowClear
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder="Search by name, email, phone or business"
      style={{ width: '100%' }}
      popupClassName="pp-menu"
      listHeight={300}
      notFoundContent={
        loading ? (
          <div style={{ padding: 14, textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : error ? (
          <Empty>Could not search contacts — try again</Empty>
        ) : query.trim() ? (
          <Empty>No contact matches “{query.trim()}”</Empty>
        ) : (
          <Empty>Start typing to find a contact</Empty>
        )
      }
    />
  )
}

function Empty({ children }) {
  return (
    <div
      style={{
        padding: '14px 12px',
        fontSize: 'var(--text-md)', color: 'var(--text-muted)',
        textAlign: 'center'
      }}
    >
      {children}
    </div>
  )
}

// Name on top, the distinguishing detail beneath — the shape GHL's own user
// picker uses, and the only way a list of leads is tellable apart.
function ContactRow({ contact: c }) {
  if (!c) return null
  const detail = [c.email, c.phone, c.business].filter(Boolean)[0]
  return (
    <span style={{ display: 'block', minWidth: 0, padding: '2px 0' }}>
      <span
        style={{
          display: 'block',
          fontSize: 'var(--text-md)', fontWeight: 500, color: 'var(--text-body)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}
      >
        {nameOf(c)}
      </span>
      {detail && (
        <span
          style={{
            display: 'block', marginTop: 1,
            fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {detail}
        </span>
      )}
    </span>
  )
}

// Never a bare phone number as a name — it reads as a data error. Falls through
// the same chain the contact cards use.
function nameOf(c) {
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim()
  if (full) return full
  if (c.name) return c.name
  if (c.business) return c.business
  if (c.email) return c.email
  if (c.phone) return c.phone
  return 'Unnamed contact'
}

// The collapsed label, once chosen. Carries the detail too, so the closed box
// still says which of two people called James this is.
function labelFor(c) {
  const name = nameOf(c)
  const detail = [c.email, c.phone, c.business].filter(Boolean)[0]
  return detail && detail !== name ? `${name} · ${detail}` : name
}
