import React, { useEffect, useState } from 'react'
import { contactsAPI } from '../../api/contacts'

// Contacts tab — every contact in this location.
// Grid of cards with editable-in-future fields; today they're read-only.
// Each card leads with the contact's accent (top-edge stripe + avatar tint)
// so the identity stays consistent with the rest of the app.
export default function ContactsTab() {
  const [contacts, setContacts] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    contactsAPI.list({ limit: 500 })
      .then((r) => alive && setContacts(r.contacts || []))
      .catch((err) => alive && setError(err.message || 'Failed to load contacts'))
    return () => { alive = false }
  }, [])

  const filtered = (contacts || []).filter((c) => {
    if (!q.trim()) return true
    const needle = q.toLowerCase()
    return [c.name, c.email, c.phone, c.business, ...(c.tags || [])]
      .filter(Boolean).join(' ').toLowerCase().includes(needle)
  })

  return (
    <div
      style={{
        maxWidth: 1660, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: '16px 20px 28px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontSize: 24 }}>Contacts</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {contacts ? `${contacts.length} in this location` : 'Loading…'}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, phone, business or tag"
          style={{
            marginLeft: 'auto',
            width: 360, height: 36, boxSizing: 'border-box',
            padding: '0 12px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', fontSize: 13, color: 'var(--text-body)'
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: 16, marginBottom: 14,
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--tint-rose)', color: 'var(--status-stuck)', fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {!contacts && !error && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Loading contacts…
        </div>
      )}

      {contacts && filtered.length === 0 && !error && (
        <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
          No contacts match — clear the search to see everything.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14
        }}
      >
        {filtered.map((c) => {
          const initials = ((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?'
          return (
            <div
              key={c.id}
              style={{
                border: '1px solid var(--border-default)',
                borderTop: `3px solid var(--accent-${c.accent})`,
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                boxShadow: 'var(--shadow-card)',
                padding: 14,
                display: 'grid', gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 38, height: 38, flex: 'none',
                    borderRadius: '50%',
                    background: `var(--tint-${c.accent})`,
                    color: `var(--accent-${c.accent})`,
                    fontSize: 13, fontWeight: 600
                  }}
                >
                  {initials}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 15, fontWeight: 600, color: 'var(--text-heading)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                  >
                    {c.name || '—'}
                  </div>
                  {c.contactType && (
                    <div
                      style={{
                        display: 'inline-block', marginTop: 3,
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                        background: `var(--tint-${c.accent})`, color: `var(--accent-${c.accent})`
                      }}
                    >
                      {c.contactType}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-body)' }}>
                {c.business && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>business</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.business}</span>
                  </div>
                )}
                {c.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>mail</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>call</span>
                    {c.phone}
                  </div>
                )}
                {c.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>location_on</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</span>
                  </div>
                )}
              </div>

              {/* Tags + deal count */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 2 }}>
                {c.openDeals > 0 && (
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--tint-pine)', color: 'var(--accent-pine)',
                      fontSize: 11, fontWeight: 600
                    }}
                  >
                    <span className="ms" style={{ fontSize: 13 }}>sell</span>
                    {c.openDeals} {c.openDeals === 1 ? 'open deal' : 'open deals'}
                  </span>
                )}
                {(c.tags || []).slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--gray-100)', color: 'var(--text-muted)',
                      fontSize: 11
                    }}
                  >
                    {tag}
                  </span>
                ))}
                {c.tags && c.tags.length > 5 && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    +{c.tags.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
