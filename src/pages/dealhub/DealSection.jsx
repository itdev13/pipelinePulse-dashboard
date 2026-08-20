import React, { useState } from 'react'

// Deal Hub — Deal section (the deal's own facts).
//
// Sibling of PeopleSection on the left-rail tabs: People / Deal / Media.
// Four columns across one bordered card, in the order a rep reads a deal:
//
//   Customer   — who it's for + what it is (the opportunity name)
//   Value      — the money, the quote revision, the expected close
//   Stage      — where it sits, who owns it, how stale it is
//   Product    — what's being sold, where it came from, sibling deals
//
// Accent is pine (the deal's own colour) so it reads as a different lens
// from People (sky). Stage + expected close render as real controls — the
// write endpoints don't exist yet (/api/deals is read-only), so they hold
// local state and carry a "coming next" title, same as PeopleSection's
// Make primary / Remove.

export default function DealSection({
  deal,
  stages = [],
  siblingDeals = [],
  onOpenDeal,
  onStageChange,
  onExpectedCloseChange
}) {
  if (!deal) return null

  const accent = 'var(--accent-pine)'
  const customerName = primaryName(deal.people)

  return (
    <section
      style={{
        border: `2px solid ${accent}`,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: accent }}>person</span>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: accent, margin: 0, flex: 1 }}>
          Deal
        </h3>
        {deal.status && deal.status !== 'open' && (
          <StatusPill status={deal.status} />
        )}
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 0
        }}
      >
        <Column label="Customer">
          <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--text-heading)', lineHeight: 1.25 }}>
            {customerName}
          </div>
          {deal.opportunityName && (
            <p
              style={{
                margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.45,
                color: 'var(--text-muted)'
              }}
            >
              {deal.opportunityName}
            </p>
          )}
        </Column>

        <ValueColumn
          deal={deal}
          onExpectedCloseChange={onExpectedCloseChange}
        />

        <StageColumn
          deal={deal}
          stages={stages}
          onStageChange={onStageChange}
        />

        <ProductColumn
          deal={deal}
          siblingDeals={siblingDeals}
          onOpenDeal={onOpenDeal}
        />
      </div>
    </section>
  )
}

// ── Columns ───────────────────────────────────────────────────────────

function ValueColumn({ deal, onExpectedCloseChange }) {
  const [expectedClose, setExpectedClose] = useState(
    deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : ''
  )

  return (
    <Column label="Value">
      <div
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500,
          letterSpacing: '-0.02em', color: 'var(--text-heading)'
        }}
      >
        {deal.value || <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </div>

      {/* Quote revision — GHL has no revision field yet, so this only
          appears once something upstream supplies deal.quoteRevision. */}
      {deal.quoteRevision != null && (
        <RevisionBadge
          revision={deal.quoteRevision}
          provisional={deal.valueProvisional}
        />
      )}

      <FieldLabel>Expected close</FieldLabel>
      <input
        type="date"
        value={expectedClose}
        title="Expected close — write flow coming next"
        onChange={(e) => {
          setExpectedClose(e.target.value)
          if (onExpectedCloseChange) onExpectedCloseChange(e.target.value)
        }}
        style={{
          width: '100%', height: 34, boxSizing: 'border-box',
          padding: '0 10px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-body)'
        }}
      />
      {deal.valueProvisional && (
        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
          Provisional — excluded from pipeline totals
        </p>
      )}
    </Column>
  )
}

function StageColumn({ deal, stages, onStageChange }) {
  const [stage, setStage] = useState(deal.stage || '')

  // Days in stage comes from the stage the deal currently sits on. The
  // stages endpoint carries enteredAt on the current entry when available;
  // otherwise fall back to the deal's own updated_at, which moves on every
  // stage change.
  const current = stages.find((s) => s.isCurrent)
  const enteredAt = current?.enteredAt || deal.currentStageEnteredAt
  const daysInStage = daysSince(enteredAt)

  const lastContact = deal.lastCustomerContactAt
  const lastContactDays = daysSince(lastContact)
  // 14 days of silence on an open deal is the point it reads as stale.
  const stale = lastContactDays != null && lastContactDays >= 14

  return (
    <Column label="Stage">
      <select
        value={stage}
        title="Stage change — write flow coming next"
        onChange={(e) => {
          setStage(e.target.value)
          if (onStageChange) onStageChange(e.target.value)
        }}
        style={{
          width: '100%', height: 38, boxSizing: 'border-box',
          padding: '0 10px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500,
          color: 'var(--text-heading)',
          cursor: 'pointer'
        }}
      >
        {/* The deal's stage may be retired or missing from pipeline_stages
            (the /stages route already handles that by injecting a virtual
            entry) — keep it selectable either way so the control never
            silently shows the wrong stage. */}
        {stages.length === 0 && stage && <option value={stage}>{stage}</option>}
        {stages.map((s) => (
          <option key={s.name} value={s.name}>
            {s.isActive === false ? `${s.name} (retired)` : s.name}
          </option>
        ))}
      </select>

      <dl style={{ margin: '12px 0 0', display: 'grid', gap: 7 }}>
        <Row
          label="Owner"
          value={deal.owner}
          // A deal still belongs to its owner after they leave the account
          // — flag it rather than hiding it, so it's visibly reassignable.
          suffix={deal.ownerActive === false ? 'left account' : null}
          title={
            deal.ownerActive === false
              ? 'This user is no longer active on the sub-account'
              : undefined
          }
        />
        <Row
          label="Days in stage"
          value={daysInStage != null ? daysInStage : null}
          mono
        />
        <Row
          label="Last customer contact"
          value={lastContact ? formatDate(lastContact) : null}
          tone={stale ? 'danger' : undefined}
          title={
            stale
              ? `${lastContactDays} days since the customer last made contact`
              : undefined
          }
        />
        {/* Creator is a different fact from owner: it never changes, and it's
            populated even when Owner is unassigned — which is the common
            case, so this is often the only person attributable to a deal. */}
        <Row
          label="Created by"
          value={deal.createdBy}
          title={deal.createdVia ? `Created via ${deal.createdVia}` : undefined}
        />
        {deal.source && <Row label="Source" value={deal.source} />}
        {deal.quoteRevision != null && (
          <Row label="Quote revision" value={`Rev ${deal.quoteRevision}`} mono />
        )}
      </dl>
    </Column>
  )
}

function ProductColumn({ deal, siblingDeals, onOpenDeal }) {
  // The reassignment-targets payload includes the current deal — it's the
  // "move this message to" list. Here we only want the siblings.
  const others = (siblingDeals || []).filter((d) => d.id && !d.current)

  return (
    <Column label="Product" last>
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-heading)' }}>
        {deal.product || <span style={{ color: 'var(--text-faint)' }}>—</span>}
      </div>

      {deal.leadSource && (
        <>
          <FieldLabel>Lead source</FieldLabel>
          <div style={{ fontSize: 13.5, color: 'var(--text-heading)' }}>
            {deal.leadSource}
          </div>
        </>
      )}

      <TagList
        dealTags={deal.dealTags}
        contactTags={deal.contactTags}
      />

      {others.length > 0 && (
        <>
          <FieldLabel>
            {others.length === 1
              ? 'Other open deal — same contact'
              : 'Other open deals — same contact'}
          </FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {others.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenDeal && onOpenDeal(d.id)}
                title={[d.pipeline, d.stage].filter(Boolean).join(' · ')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  maxWidth: '100%',
                  cursor: onOpenDeal ? 'pointer' : 'default',
                  height: 28, padding: '0 10px',
                  border: '1px solid var(--green-100)',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--tint-pine)',
                  color: 'var(--green-600)',
                  fontFamily: 'var(--font-sans)', fontSize: 12.5
                }}
              >
                <span
                  style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}
                >
                  {d.label}
                </span>
                {d.value && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, flex: 'none' }}>
                    · {d.value}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </Column>
  )
}

// Tags. GHL's tag model is contact-scoped — confirmed against
// vw_opportunity_effective_tags, which resolves a deal's tags through the
// contact join. So contact tags are NOT second-class here: they're the tags
// GHL's own opportunity modal displays, and they get the normal treatment.
//
// opportunities.tags is the rarer case (only populated when an opp event
// carries a tags[] array). When a tag appears on both sides it renders once,
// with the deal-scoped marker, since that's the more specific fact.
// Collapses past six with a "+N" toggle, matching GHL's own overflow.
function TagList({ dealTags = [], contactTags = [] }) {
  const [expanded, setExpanded] = useState(false)

  const deal = dealTags || []
  const seen = new Set(deal)
  const contact = (contactTags || []).filter((t) => !seen.has(t))
  const all = [
    ...deal.map((t) => ({ name: t, scope: 'deal' })),
    ...contact.map((t) => ({ name: t, scope: 'contact' }))
  ]
  if (all.length === 0) return null

  const LIMIT = 6
  const shown = expanded ? all : all.slice(0, LIMIT)
  const hidden = all.length - shown.length

  return (
    <>
      <FieldLabel>Tags</FieldLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {shown.map((t) => (
          <span
            key={`${t.scope}:${t.name}`}
            title={
              t.scope === 'deal'
                ? 'Set on the opportunity record'
                : 'Applied to the contact — GHL scopes tags to contacts'
            }
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              maxWidth: '100%',
              height: 24, padding: '0 9px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-default)',
              background: 'var(--gray-50)',
              color: 'var(--text-body)',
              fontSize: 11.5, fontWeight: 500
            }}
          >
            {/* Deal-scoped tags are rare enough to be worth marking, but
                not worth a second colour scheme — a dot reads as "more
                specific" without implying contact tags are lesser. */}
            {t.scope === 'deal' && (
              <span
                style={{
                  width: 5, height: 5, flex: 'none',
                  borderRadius: '50%', background: 'var(--accent-pine)'
                }}
              />
            )}
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {t.name}
            </span>
          </span>
        ))}
        {(hidden > 0 || expanded) && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              height: 24, padding: '0 9px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: '#fff', color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            {expanded ? 'Show less' : `+${hidden}`}
          </button>
        )}
      </div>
    </>
  )
}

// ── Primitives ────────────────────────────────────────────────────────

function Column({ label, children, last }) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: '14px 18px 16px',
        borderRight: last ? 'none' : '1px solid var(--border-default)'
      }}
    >
      <span
        style={{
          display: 'block', marginBottom: 8,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <span
      style={{
        display: 'block', margin: '14px 0 6px',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)'
      }}
    >
      {children}
    </span>
  )
}

function Row({ label, value, mono, tone, title, suffix }) {
  const danger = tone === 'danger'
  return (
    <div
      title={title}
      style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5 }}
    >
      <dt style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)' }}>{label}</dt>
      <dd
        style={{
          margin: 0, flex: 'none', textAlign: 'right',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontWeight: 500,
          color: danger ? 'var(--status-stuck)' : 'var(--text-heading)'
        }}
      >
        {value != null && value !== '' ? value : <span style={{ color: 'var(--text-faint)' }}>—</span>}
        {suffix && (
          <span
            style={{
              marginLeft: 6,
              fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              padding: '2px 6px', borderRadius: 'var(--radius-sm)',
              background: 'var(--gray-100)', color: 'var(--text-muted)'
            }}
          >
            {suffix}
          </span>
        )}
      </dd>
    </div>
  )
}

function RevisionBadge({ revision, provisional }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        marginTop: 8, height: 28, padding: '0 12px',
        borderRadius: 'var(--radius-md)',
        background: provisional ? 'var(--status-working)' : 'var(--tint-pine)',
        color: provisional ? '#fff' : 'var(--green-600)',
        fontSize: 12.5, fontWeight: 600
      }}
    >
      Rev {revision}{provisional ? ' · provisional' : ''}
    </span>
  )
}

function StatusPill({ status }) {
  const tone = {
    won: { bg: 'var(--tint-pine)', fg: 'var(--green-600)' },
    lost: { bg: 'var(--tint-rose)', fg: 'var(--status-stuck)' },
    abandoned: { bg: 'var(--gray-100)', fg: 'var(--text-muted)' }
  }[status] || { bg: 'var(--gray-100)', fg: 'var(--text-muted)' }

  return (
    <span
      style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
        textTransform: 'uppercase',
        padding: '3px 9px', borderRadius: 'var(--radius-sm)',
        background: tone.bg, color: tone.fg
      }}
    >
      {status}
    </span>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

// Mirrors PeopleSection's identifier fallback: contacts in GHL are often
// skeletal, so pick the best label we actually have rather than "Contact".
function primaryName(people = []) {
  const p = people.find((x) => x.primary) || people[0]
  if (!p) return 'Unnamed deal'
  const first = (p.firstName || '').trim()
  const last = (p.lastName || '').trim()
  if (first && last) return `${first} ${last}`
  return first || last || p.email || p.phone || p.business || 'Contact'
}

function daysSince(ts) {
  if (!ts) return null
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / 86400000))
}

function toDateInput(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function formatDate(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
