import React, { useEffect, useMemo, useState, useRef } from 'react'
import Timeline from '../dealhub/Timeline'
import StageStepper from '../dealhub/StageStepper'
import { dealsAPI } from '../../api/deals'

// Deal Hub tab — the core view.
//
// Behaviour:
//   • On mount (or when the selected dealId is null), fetch the list of open
//     deals for the location and auto-select the first one. This is Option B
//     from the design conversation: users always land on a real deal, not an
//     empty state.
//   • Deal-switcher dropdown at the top lets users change deal in-place
//     without leaving the tab.
//   • Filter chips (people + channels + inclusion) narrow the timeline
//     client-side per rule 7 — never a round-trip.

export default function DealHubTab({ dealId, onSwitchDeal }) {
  // Deal list for the switcher dropdown
  const [deals, setDeals] = useState(null)
  const [dealsError, setDealsError] = useState(null)

  // The one active deal
  const [deal, setDeal] = useState(null)
  const [stages, setStages] = useState(null)
  const [messages, setMessages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Filter state
  const [channelFilter, setChannelFilter] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [peopleFilter, setPeopleFilter] = useState([])

  // Deal switcher dropdown open/close
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef(null)

  // Load the deal list once — used by the switcher and the auto-select.
  useEffect(() => {
    let alive = true
    dealsAPI.list({ status: 'open', limit: 200 })
      .then((res) => {
        if (!alive) return
        setDeals(res.deals || [])
        // Auto-select the first open deal if none is selected yet.
        if (!dealId && res.deals && res.deals.length > 0) {
          onSwitchDeal(res.deals[0].id)
        }
      })
      .catch((err) => alive && setDealsError(err.message || 'Failed to load deals'))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the currently-selected deal.
  useEffect(() => {
    if (!dealId) return
    let alive = true
    setLoading(true)
    setError(null)
    setStages(null)
    Promise.all([dealsAPI.get(dealId), dealsAPI.timeline(dealId), dealsAPI.stages(dealId)])
      .then(([d, t, s]) => {
        if (!alive) return
        setDeal(d)
        setStages(s.stages || [])
        const nameById = Object.fromEntries(
          (d.people || []).map((p) => [p.id, p.firstName || p.lastName || 'Contact'])
        )
        const rows = (t.messages || []).map((m) => ({
          ...m,
          toNames: (m.toIds || []).map((cid) => nameById[cid]).filter(Boolean)
        }))
        setMessages(rows)
        setLoading(false)
        // Reset filters when the deal changes.
        setChannelFilter(null)
        setStatusFilter('all')
        setPeopleFilter([])
      })
      .catch((err) => {
        if (!alive) return
        setError(err.message || 'Failed to load deal')
        setLoading(false)
      })
    return () => { alive = false }
  }, [dealId])

  // Close the switcher on outside click
  useEffect(() => {
    if (!switcherOpen) return
    const handler = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [switcherOpen])

  const toggleIncluded = (m) => {
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

  // Empty state — no open deals in this location
  if (deals && deals.length === 0) {
    return (
      <div
        style={{
          padding: 40, maxWidth: 640, margin: '40px auto',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: '#fff', textAlign: 'center'
        }}
      >
        <span
          className="ms"
          style={{ fontSize: 32, color: 'var(--text-faint)', marginBottom: 8, display: 'block' }}
        >
          sell
        </span>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>No open deals in this location</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Once a deal is created in GHL, it'll appear here automatically.
        </p>
      </div>
    )
  }

  if (dealsError) {
    return (
      <div
        style={{
          padding: 16, margin: 20,
          border: '1px solid var(--status-stuck)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--tint-rose)',
          color: 'var(--status-stuck)', fontSize: 13
        }}
      >
        Failed to load deals: {dealsError}
      </div>
    )
  }

  if (!deals) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Loading deals…
      </div>
    )
  }

  return (
    <div>
      {/* Deal-switcher dropdown + opportunity header + stage stepper */}
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
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
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

          {/* Deal switcher */}
          <div ref={switcherRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                cursor: 'pointer',
                height: 34, padding: '0 12px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 14,
                color: 'var(--text-heading)', fontWeight: 600
              }}
            >
              <span className="ms" style={{ fontSize: 16, color: 'var(--accent-pine)' }}>sell</span>
              {deal ? deal.dealTag : 'Select a deal…'}
              <span className="ms" style={{ fontSize: 18, color: 'var(--text-faint)' }}>
                expand_more
              </span>
            </button>

            {switcherOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                  width: 340, maxHeight: 420, overflowY: 'auto',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  background: '#fff', boxShadow: 'var(--shadow-overlay)',
                  padding: 6
                }}
              >
                <div
                  style={{
                    padding: '6px 8px',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'var(--text-muted)'
                  }}
                >
                  Open deals ({deals.length})
                </div>
                {deals.map((d) => {
                  const active = d.id === dealId
                  return (
                    <button
                      key={d.id}
                      onClick={() => {
                        onSwitchDeal(d.id)
                        setSwitcherOpen(false)
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 8, alignItems: 'center', width: '100%',
                        cursor: 'pointer',
                        padding: '8px 10px', textAlign: 'left',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: active ? 'var(--surface-selected)' : '#fff',
                        color: active ? 'var(--brand-primary)' : 'var(--text-body)',
                        fontFamily: 'var(--font-sans)', fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        marginBottom: 2
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.dealTag}
                        </div>
                        <div
                          style={{
                            fontSize: 11, color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}
                        >
                          {[d.stage, d.owner].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {d.value && (
                        <span
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}
                        >
                          {d.value}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {deal && deal.value && (
            <span
              style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)' }}
            >
              {deal.value}
            </span>
          )}
          {deal && (
            <span
              style={{
                fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto'
              }}
            >
              {[deal.location, deal.owner].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        {/* Stage stepper — per pipeline, current stage highlighted */}
        {stages && stages.length > 0 && (
          <StageStepper stages={stages} />
        )}
        </div>
      </div>

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
                p.firstName || 'Contact',
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
