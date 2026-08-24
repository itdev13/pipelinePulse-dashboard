import React, { useEffect, useMemo, useState, useRef } from 'react'
import Timeline from '../dealhub/Timeline'
import StageStepper from '../dealhub/StageStepper'
import PeopleSection from '../dealhub/PeopleSection'
import DealSection from '../dealhub/DealSection'
import AskDeal from '../dealhub/AskDeal'
import QualificationSection from '../dealhub/QualificationSection'
import { DealTasksSection, DealNotesSection } from '../dealhub/DealTasksSection'
import {
  DealHubSkeleton, DealBodySkeleton, SkeletonStyles
} from '../dealhub/Skeleton'
import { dealsAPI } from '../../api/deals'
import { aiAPI } from '../../api/ai'

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

  // Left-rail tabs — Deal / People / Media. Deal comes first and is the
  // default: it's the record the whole page is about, and the header the rep
  // reads before anything else. Media is still to come.
  const [leftRail, setLeftRail] = useState('deal')

  // Sibling open deals on the same contact — powers the "other open deals"
  // chips in the Deal section. Reuses the reassignment-targets endpoint,
  // which already answers exactly this question (every open opp on the
  // contact) and includes the current deal, which DealSection filters out.
  const [siblingDeals, setSiblingDeals] = useState([])


  // Filter state
  const [channelFilter, setChannelFilter] = useState(null)
  const [peopleFilter, setPeopleFilter] = useState([])
  // null = all, true = included only, false = excluded only.

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
    setSiblingDeals([])
    Promise.all([
      dealsAPI.get(dealId),
      dealsAPI.timeline(dealId),
      dealsAPI.stages(dealId),
      // Siblings are decoration on one column — a failure here must not
      // take the whole deal view down with it.
      dealsAPI.reassignmentTargets(dealId).catch(() => ({ targets: [] }))
    ])
      .then(([d, t, s, r]) => {
        if (!alive) return
        setDeal(d)
        setStages(s.stages || [])
        setSiblingDeals(r.targets || [])
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

  // AI citations reference the GHL message_id; the timeline's jump anchors are
  // keyed on the row primary key (see routes/deals.js — `id` vs `messageId`).
  // Translate, then scroll + highlight.
  const [highlightedId, setHighlightedId] = useState(null)
  const jumpToMessage = (ghlMessageId) => {
    if (!ghlMessageId || !messages) return
    const row = messages.find((m) => m.messageId === ghlMessageId)
    if (!row) return
    setHighlightedId(row.id)
    const el = document.getElementById(`tl-${row.id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Clear the highlight so a later jump to the same message re-triggers it.
    window.setTimeout(() => setHighlightedId((cur) => (cur === row.id ? null : cur)), 2600)
  }

  const filtered = useMemo(() => {
    if (!messages) return []
    return messages.filter((m) => {
      if (channelFilter && m.channel !== channelFilter) return false
      // Inclusion applies to real messages only — events have no checkbox,
      // so filtering them by it would silently hide the deal's history.
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
  // Counts every conversation message per channel, ticked or not — this chip
  // filters the timeline VIEW, so it must promise the number of rows it will
  // show. The Ask panel counts differently on purpose (only what the AI can
  // read), which is why its chips are labelled "Ask about" rather than
  // repeating these numbers.
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
    ['Call',     'CALL'],
    ['Note',     'NOTE']
  ]

  // `key` defaults to the label, but callers must pass an explicit one when
  // labels can repeat — two unnamed contacts both render as "Contact", and a
  // duplicate React key would collapse them into one element.
  const chip = (label, active, onClick, extra, key) => (
    <button
      key={key ?? label}
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

  // First load: no switcher or header to frame yet, so the skeleton stands
  // in for the whole tab.
  if (!deals) return <DealHubSkeleton />

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
          <div ref={switcherRef} style={{ position: 'relative', width: 420, flex: 'none' }}>
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              title={deal ? deal.dealTag : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                cursor: 'pointer',
                height: 34, padding: '0 12px',
                width: '100%',
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
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  textAlign: 'left'
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
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
                  maxHeight: 460,
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

          {/* Header facts belong to the loaded deal — during a switch `deal`
              still holds the previous one, so gate on !loading or the value
              briefly reads as the new deal's. */}
          {deal && !loading && deal.value && (
            <span
              style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)' }}
            >
              {deal.value}
            </span>
          )}
          {deal && !loading && (
            <span
              style={{
                fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto'
              }}
            >
              {[deal.location, deal.owner].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        {/* Stage stepper — per pipeline, current stage highlighted. `stages`
            is cleared on switch, so hold the row's height with a placeholder
            instead of letting the header collapse and rebound. */}
        {loading ? (
          <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
            <SkeletonStyles />
            {[96, 112, 88, 104, 92].map((w, i) => (
              <span
                key={i}
                className="pp-sk"
                style={{ display: 'block', width: w, height: 26, borderRadius: 'var(--radius-pill)' }}
              />
            ))}
          </div>
        ) : (
          stages && stages.length > 0 && <StageStepper stages={stages} />
        )}
        </div>
      </div>

      {/* Left-rail tabs (Deal / People / Media). Media comes next. */}
      {deal && !loading && (
        <div
          style={{
            padding: '14px 20px 0',
            maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              ['deal',   'Deal',   'person'],
              ['people', 'People', 'group'],
              ['media',  'Media',  'folder_open']
            ].map(([id, label, icon]) => {
              const active = leftRail === id
              const disabled = id === 'media'
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

          {leftRail === 'deal' && (
            <DealSection
              deal={deal}
              stages={stages || []}
              siblingDeals={siblingDeals}
              onOpenDeal={onSwitchDeal}
            />
          )}
        </div>
      )}

      {/* Filter bar — everything that narrows the timeline, plus the section
          index for the panels below it.

          Two rows on the left:
            1. People  — who sent/received
            2. Sources — inclusion (what the AI reads) + channel + add-a-source

          The section tabs sit right, wrapping under themselves rather than
          pushing the filters around. They aren't filters: they choose which
          discovery panel renders below, so they stay visually separate. */}
      {deal && !loading && (
        <div
          style={{
            padding: '14px 20px 0',
            maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
          }}
        >
          {/* Same grid as the Timeline / Commitments row below (2fr · 1fr,
              gap 14) so the section tabs start exactly on the Commitments
              panel's left edge. A flex row with its own basis values can't
              line up with a grid — the columns have to be declared the same
              way to share an edge. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
              gap: 14,
              alignItems: 'start'
            }}
          >
            {/* Left: the filter stack, in the Timeline column. */}
            <div
              style={{
                display: 'flex', flexDirection: 'column',
                gap: 8, minWidth: 0
              }}
            >
              {deal.people?.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                      textTransform: 'uppercase', color: 'var(--text-muted)'
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
                      // Two unnamed contacts both rendering as "Contact" is
                      // unusable as a filter — fall back through the same
                      // identifier chain PeopleSection uses.
                      chipNameFor(p),
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
                      />,
                      p.id
                    )
                  })}
                </div>
              )}

              {/* Sources row: inclusion + channel + add-a-source. All three
                  answer "which messages am I looking at", so they share a
                  line. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {(() => {
                  let allCount = 0
                  for (const n of dealChannels.values()) allCount += n
                  return chip(
                    `All${allCount ? ` · ${allCount}` : ''}`,
                    !channelFilter,
                    () => setChannelFilter(null),
                    null,
                    'all'
                  )
                })()}
                {CHANNEL_CHIPS.filter(([, ch]) => dealChannels.has(ch)).map(
                  ([label, ch]) => {
                    const n = dealChannels.get(ch) || 0
                    return chip(
                      `${label} · ${n}`,
                      channelFilter === ch,
                      () => setChannelFilter(channelFilter === ch ? null : ch),
                      null,
                      ch
                    )
                  }
                )}
                <button
                  title="Attach a message or document the sync missed — coming next"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 30, padding: '0 14px',
                    border: '1px dashed var(--border-strong)',
                    borderRadius: 'var(--radius-pill)',
                    background: '#fff', color: 'var(--text-body)',
                    fontFamily: 'var(--font-sans)', fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  <span className="ms" style={{ fontSize: 16 }}>add</span>
                  Add a source
                </button>
              </div>
            </div>

            {/* Empty right column. The section tabs used to live here; the
                panels are all stacked in the rail now, so nothing selects
                between them. The column stays so the filter stack keeps the
                same width as the Timeline below it. */}
            <div style={{ minWidth: 0 }} />
          </div>
        </div>
      )}

      {/* Switching deals swaps every panel below the header at once. Render
          the body's shape while it loads rather than leaving the previous
          deal on screen — otherwise you can't tell whether you're looking at
          the deal you just picked or the one before it. */}
      {loading && <DealBodySkeleton />}

      {/* Timeline */}
      <div
        style={{
          padding: loading ? 0 : '14px 20px 24px',
          maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
        }}
      >
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
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
                gap: 14,
                alignItems: 'start',
                marginBottom: 14
              }}
            >
              <Timeline
                messages={filtered}
                highlightedId={highlightedId}
              />
              {/* All three panels stacked, no tab to pick between them. With
                  only three sections left, switching cost a click and hid two
                  of them for no reason — a rep reading a deal wants the tasks
                  AND the notes. */}
              <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
                <DealTasksSection dealId={dealId} />
                <DealNotesSection dealId={dealId} />
                <QualificationSection qualification={deal?.qualification || []} />
              </div>
            </div>
            <AskDeal
              dealId={dealId}
              onJumpToMessage={jumpToMessage}
              // The live timeline rows. AskDeal derives its channel counts
              // from these so a checkbox tick updates them instantly —
              // re-fetching from the server would lag behind unflushed ticks.
              messages={messages || []}
            />
          </>
        )}
      </div>
    </div>
  )
}

// Short label for a people filter chip. Prefers a first name (chips are
// narrow), then any other identifier we hold, so two unnamed contacts stay
// tellable apart. Mirrors PeopleSection's displayFor() fallback chain.
function chipNameFor(p) {
  const first = (p.firstName || '').trim()
  if (first) return first
  const last = (p.lastName || '').trim()
  if (last) return last
  if (p.email) return p.email.split('@')[0]
  if (p.phone) return p.phone
  if (p.business) return p.business
  return 'Contact'
}
