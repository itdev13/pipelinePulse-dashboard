import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Timeline from './dealhub/Timeline'
import { dealsAPI } from '../api/deals'

// Deal Hub — real backend, no mocks. Fetches:
//   GET /api/deals/:id           → header card + people list
//   GET /api/deals/:id/timeline  → merged message thread
//
// Filter chips are client-side per rule 7 (person filter narrows the merged
// thread without splitting it) — instant toggles, no roundtrip.
export default function DealHub() {
  const { id } = useParams()

  const [deal, setDeal] = useState(null)
  const [messages, setMessages] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [channelFilter, setChannelFilter] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [peopleFilter, setPeopleFilter] = useState([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([dealsAPI.get(id), dealsAPI.timeline(id)])
      .then(([d, t]) => {
        if (!alive) return
        setDeal(d)
        // Resolve outbound-to names using the deal's people list so the
        // "to Sarah" line renders without a second API call.
        const nameById = Object.fromEntries(
          (d.people || []).map((p) => [p.id, p.firstName || p.lastName || 'Contact'])
        )
        const rows = (t.messages || []).map((m) => ({
          ...m,
          toNames: (m.toIds || []).map((cid) => nameById[cid]).filter(Boolean)
        }))
        setMessages(rows)
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setError(err.message || 'Failed to load deal')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  const toggleIncluded = (m) => {
    // Optimistic local toggle. The "which messages the AI reads" flag will
    // need a real endpoint later — for now the state lives client-side so the
    // filter chips + coverage line stay live.
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, included: !x.included } : x))
    )
  }

  const filtered = useMemo(() => {
    if (!messages) return []
    return messages.filter((m) => {
      if (channelFilter && m.channel !== channelFilter) return false
      if (statusFilter === 'inc' && !(m.readable && m.included)) return false
      if (statusFilter === 'exc' && m.readable && m.included) return false
      if (peopleFilter.length > 0) {
        const senderMatch = m.senderId && peopleFilter.includes(m.senderId)
        const recipientMatch = (m.toIds || []).some((cid) => peopleFilter.includes(cid))
        if (!senderMatch && !recipientMatch) return false
      }
      return true
    })
  }, [messages, channelFilter, statusFilter, peopleFilter])

  const chip = (label, active, onClick, extra) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        cursor: 'pointer',
        height: 30, padding: '0 14px',
        border: active ? '2px solid var(--brand-primary)' : '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--surface-selected)' : '#fff',
        color: active ? 'var(--brand-primary)' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13, fontWeight: active ? 500 : 400,
        transition: 'all 0.15s ease-out'
      }}
    >
      {extra}
      {label}
    </button>
  )

  return (
    <div data-dealhub style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          minHeight: 60, padding: '6px 20px',
          borderBottom: '1px solid var(--border-default)',
          background: '#fff'
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-heading)' }}>
          EverGreen Junction
        </span>
        <span style={{ color: 'var(--border-strong)' }}>/</span>
        <Link
          to="/"
          title="Back to dashboard"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28,
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)', background: '#fff',
            textDecoration: 'none'
          }}
        >
          <span className="ms" style={{ fontSize: 17, color: 'var(--text-body)' }}>
            arrow_back
          </span>
        </Link>
        <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-body)' }}>Deal Hub</span>
      </header>

      {/* Opportunity header card */}
      {deal && (
        <div style={{ padding: '14px 20px 0' }}>
          <div
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: '#fff', boxShadow: 'var(--shadow-card)'
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
                padding: '14px 16px'
              }}
            >
              <span
                style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--text-muted)'
                }}
              >
                Opportunity
              </span>
              <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-heading)' }}>
                {deal.dealTag}
              </span>
              {deal.value && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)'
                  }}
                >
                  {deal.value}
                </span>
              )}
              <span
                style={{
                  fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto'
                }}
              >
                {[deal.location, deal.stage, deal.owner].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* People chips */}
      {deal && deal.people?.length > 0 && (
        <div
          style={{
            padding: '14px 20px 0',
            maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4
              }}
            >
              People
            </span>
            {chip(
              'Everyone',
              peopleFilter.length === 0,
              () => setPeopleFilter([]),
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'transparent'
                }}
              />
            )}
            {deal.people.map((p) => {
              const active = peopleFilter.includes(p.id)
              return chip(
                p.firstName,
                active,
                () =>
                  setPeopleFilter((prev) =>
                    active ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                  ),
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: `var(--accent-${p.accent})`
                  }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Content chips */}
      <div
        style={{
          padding: '10px 20px 0',
          maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chip('All', statusFilter === 'all' && !channelFilter, () => {
            setStatusFilter('all')
            setChannelFilter(null)
          })}
          {chip('Included only', statusFilter === 'inc', () => setStatusFilter('inc'))}
          {chip('Excluded only', statusFilter === 'exc', () => setStatusFilter('exc'))}
          {[
            ['Email', 'EMAIL'],
            ['WhatsApp', 'WHATSAPP'],
            ['SMS', 'SMS'],
            ['iMessage', 'IMESSAGE'],
            ['Call', 'CALL'],
            ['Note', 'NOTE']
          ].map(([label, ch]) =>
            chip(label, channelFilter === ch, () =>
              setChannelFilter(channelFilter === ch ? null : ch)
            )
          )}
        </div>
      </div>

      {/* Timeline */}
      <div
        style={{
          padding: '14px 20px 24px',
          maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
        }}
      >
        {loading && (
          <div
            style={{
              padding: 40, textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 14
            }}
          >
            Loading deal…
          </div>
        )}
        {error && (
          <div
            style={{
              padding: 16,
              border: '1px solid var(--status-stuck)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--tint-rose)',
              color: 'var(--status-stuck)',
              fontSize: 13
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && messages && (
          <Timeline messages={filtered} onToggleIncluded={toggleIncluded} />
        )}
      </div>
    </div>
  )
}
