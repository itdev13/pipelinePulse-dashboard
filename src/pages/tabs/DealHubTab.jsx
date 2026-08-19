import React, { useEffect, useMemo, useState, useRef } from 'react'
import Timeline from '../dealhub/Timeline'
import StageStepper from '../dealhub/StageStepper'
import PeopleSection from '../dealhub/PeopleSection'
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

  // Left-rail tabs — People / Deal / Media. Only People is real for now.
  const [leftRail, setLeftRail] = useState('people')

  // Filter state
  const [channelFilter, setChannelFilter] = useState(null)
  const [peopleFilter, setPeopleFilter] = useState([])

  // Deal switcher dropdown open/close
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switcherQ, setSwitcherQ] = useState('')
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
        setPeopleFilter([])
      })
      .catch((err) => {
        if (!alive) return
        setError(err.message || 'Failed to load deal')
        setLoading(false)
      })
    return () => { alive = false }
  }, [dealId])

  // Close the switcher on outside click. Also clear its search when closed
  // so the next open starts fresh.
  useEffect(() => {
    if (!switcherOpen) {
      if (switcherQ) setSwitcherQ('')
      return
    }
    const handler = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (peopleFilter.length > 0) {
        const senderMatch = m.senderId && peopleFilter.includes(m.senderId)
        const recipientMatch = (m.toIds || []).some((cid) => peopleFilter.includes(cid))
        if (!senderMatch && !recipientMatch) return false
      }
      return true
    })
  }, [messages, channelFilter, peopleFilter])

  // Channels that ACTUALLY appear on this deal. Derived from the fetched
  // messages so a Rear-Elevation-with-only-emails doesn't show a WhatsApp
  // chip. Event rows (ACTIVITY/TASK/SYSTEM) don't count — the filter chips
  // are for real conversation channels.
  //
  // Always returns a Map (never an array) so downstream `.has()` / `.get()`
  // calls work before messages have loaded.
  const dealChannels = useMemo(() => {
    const counts = new Map()
    if (!messages) return counts
    for (const m of messages) {
      if (m.event) continue
      counts.set(m.channel, (counts.get(m.channel) || 0) + 1)
    }
    return counts
  }, [messages])

  // Chip presentation order — keep the fixed order across deals so users
  // don't hunt for a channel that moved position. We just skip channels
  // that don't exist on the current deal.
  const CHANNEL_CHIPS = [
    ['Email',    'EMAIL'],
    ['WhatsApp', 'WHATSAPP'],
    ['SMS',      'SMS'],
    ['iMessage', 'IMESSAGE'],
    ['Call',     'CALL']
  ]

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
          <div ref={switcherRef} style={{ position: 'relative', minWidth: 0, maxWidth: 420, flex: '0 1 auto' }}>
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              title={deal ? deal.dealTag : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                cursor: 'pointer',
                height: 34, padding: '0 12px',
                maxWidth: '100%',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 14,
                color: 'var(--text-heading)', fontWeight: 600
              }}
            >
              <span className="ms" style={{ fontSize: 16, color: 'var(--accent-pine)', flex: 'none' }}>sell</span>
              <span
                style={{
                  minWidth: 0, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {deal ? deal.dealTag : 'Select a deal…'}
              </span>
              <span className="ms" style={{ fontSize: 18, color: 'var(--text-faint)', flex: 'none' }}>
                expand_more
              </span>
            </button>

            {switcherOpen && (() => {
              const q = switcherQ.trim().toLowerCase()
              const visible = q
                ? deals.filter((d) =>
                    [d.dealTag, d.contact?.firstName, d.contact?.lastName, d.contact?.business, d.stage, d.owner]
                      .filter(Boolean).join(' ').toLowerCase().includes(q)
                  )
                : deals
              return (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                  width: 380, maxHeight: 460,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  background: '#fff', boxShadow: 'var(--shadow-overlay)',
                  display: 'flex', flexDirection: 'column'
                }}
              >
                {/* Search — sticky at the top of the dropdown */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-default)'
                  }}
                >
                  <span className="ms" style={{ fontSize: 17, color: 'var(--text-muted)' }}>search</span>
                  <input
                    autoFocus
                    value={switcherQ}
                    onChange={(e) => setSwitcherQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setSwitcherOpen(false)}
                    placeholder="Search deals, contacts, business…"
                    style={{
                      flex: 1, minWidth: 0,
                      border: 'none', outline: 'none', background: 'transparent',
                      fontFamily: 'var(--font-sans)', fontSize: 13,
                      color: 'var(--text-body)'
                    }}
                  />
                  {switcherQ && (
                    <button
                      onClick={() => setSwitcherQ('')}
                      title="Clear"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22,
                        border: 'none', borderRadius: 'var(--radius-sm)',
                        background: 'var(--gray-50)', cursor: 'pointer',
                        color: 'var(--text-muted)'
                      }}
                    >
                      <span className="ms" style={{ fontSize: 14 }}>close</span>
                    </button>
                  )}
                </div>

                <div style={{ overflowY: 'auto', padding: 6 }}>
                <div
                  style={{
                    padding: '6px 8px',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'var(--text-muted)'
                  }}
                >
                  {q
                    ? `${visible.length} of ${deals.length} match`
                    : `Open deals (${deals.length})`}
                </div>
                {visible.length === 0 && q && (
                  <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                    No deals match "{switcherQ}"
                  </div>
                )}
                {visible.map((d) => {
                  const active = d.id === dealId
                  return (
                    <button
                      key={d.id}
                      title={d.dealTag}
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
              </div>
              )
            })()}
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

      {/* Left-rail tabs (People / Deal / Media). Only People rendered
          for now — Deal + Media come next iterations. */}
      {deal && (
        <div
          style={{
            padding: '14px 20px 0',
            maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              ['people', 'People',        'group'],
              ['deal',   'Deal',          'person'],
              ['media',  'Media',         'folder_open']
            ].map(([id, label, icon]) => {
              const active = leftRail === id
              const disabled = id !== 'people'
              return (
                <button
                  key={id}
                  onClick={() => !disabled && setLeftRail(id)}
                  disabled={disabled}
                  title={disabled ? 'Coming next' : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    height: 32, padding: '0 12px',
                    border: active
                      ? '1.5px solid var(--brand-primary)'
                      : '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-pill)',
                    background: active ? 'var(--surface-selected)' : '#fff',
                    color: active
                      ? 'var(--brand-primary)'
                      : disabled
                      ? 'var(--text-faint)'
                      : 'var(--text-body)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12.5, fontWeight: active ? 600 : 400,
                    opacity: disabled ? 0.55 : 1
                  }}
                >
                  <span className="ms" style={{ fontSize: 16 }}>{icon}</span>
                  {label}
                </button>
              )
            })}
          </div>

          {leftRail === 'people' && (
            <PeopleSection
              people={deal.people || []}
              peopleFilter={peopleFilter}
              onPeopleFilterChange={setPeopleFilter}
            />
          )}
        </div>
      )}

      {/* People filter chips (below the section — narrows the timeline) */}
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

      {/* Channel filter chips.
          Note chips (Included / Excluded only) are deferred until Stage 4 AI
          extraction is live — right now every readable message defaults to
          `included: true` and there's no user-facing toggle, so those chips
          would be misleading. `Note` filter is redundant with the dedicated
          Notes pane / tab. */}
      <div
        style={{
          padding: '10px 20px 0',
          maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(() => {
            // Total conversation-channel messages on this deal (excludes
            // events, tasks, system rows). Used for the All chip's count.
            let allCount = 0
            for (const n of dealChannels.values()) allCount += n
            return chip(
              `All${allCount ? ` · ${allCount}` : ''}`,
              !channelFilter,
              () => setChannelFilter(null)
            )
          })()}
          {CHANNEL_CHIPS.filter(([, ch]) => dealChannels.has(ch)).map(
            ([label, ch]) => {
              const n = dealChannels.get(ch) || 0
              return chip(
                `${label} · ${n}`,
                channelFilter === ch,
                () => setChannelFilter(channelFilter === ch ? null : ch)
              )
            }
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
