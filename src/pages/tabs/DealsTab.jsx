import React, { useEffect, useState } from 'react'
import { dealsAPI } from '../../api/deals'

// Deals tab — a stacked list of open deals for this location.
// Clicking a card fires onOpenDeal(id) which the shell interprets as
// "flip to Deal hub tab and show that deal".

export default function DealsTab({ onOpenDeal }) {
  const [deals, setDeals] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    dealsAPI.list({ status: 'open', limit: 500 })
      .then((r) => alive && setDeals(r.deals || []))
      .catch((err) => alive && setError(err.message || 'Failed to load deals'))
    return () => { alive = false }
  }, [])

  const filtered = (deals || []).filter((d) => {
    if (!q.trim()) return true
    const needle = q.toLowerCase()
    return [d.dealTag, d.contact?.firstName, d.contact?.lastName, d.contact?.email, d.contact?.business]
      .filter(Boolean).join(' ').toLowerCase().includes(needle)
  })

  return (
    <div
      style={{
        maxWidth: 1240, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: '16px 20px 28px', display: 'grid', gap: 14
      }}
    >
      {/* Title + search */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24 }}>Deals</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {deals ? `${deals.length} open` : 'Loading…'}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by deal name, contact or business"
          style={{
            marginLeft: 'auto',
            width: 320, height: 36, boxSizing: 'border-box',
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
            padding: 16,
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--tint-rose)', color: 'var(--status-stuck)', fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {deals && filtered.length === 0 && !error && (
        <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
          No deals match — clear the search to see everything.
        </div>
      )}

      {filtered.map((d) => (
        <div
          key={d.id}
          style={{
            border: '2px solid var(--accent-pine)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', padding: 16, display: 'grid', gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="ms" style={{ fontSize: 20, color: 'var(--accent-pine)' }}>sell</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-heading)' }}>
                {d.dealTag}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {[d.pipeline, d.stage, d.owner].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              onClick={() => onOpenDeal(d.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                height: 32, padding: '0 14px',
                border: '1px solid transparent',
                borderRadius: 'var(--radius-md)',
                background: 'var(--brand-primary)', color: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500
              }}
            >
              Open deal
              <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Value
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-heading)', marginTop: 2 }}>
                {d.value || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Stage
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{d.stage || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Owner
              </div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{d.owner || '—'}</div>
            </div>
          </div>

          {d.contact && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                Contact
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '5px 10px 5px 5px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-pill)',
                    background: '#fff', fontSize: 12
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 22, height: 22, flex: 'none',
                      borderRadius: '50%',
                      background: `var(--tint-${d.contact.accent})`,
                      color: `var(--accent-${d.contact.accent})`,
                      fontSize: 10, fontWeight: 600
                    }}
                  >
                    {(d.contact.firstName?.[0] || '')}{(d.contact.lastName?.[0] || '')}
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                    {[d.contact.firstName, d.contact.lastName].filter(Boolean).join(' ') || 'Contact'}
                  </span>
                  {d.contact.business && (
                    <span style={{ color: 'var(--text-muted)' }}>· {d.contact.business}</span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}

      {!deals && !error && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Loading deals…
        </div>
      )}
    </div>
  )
}
