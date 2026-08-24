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

  const accent = 'var(--accent-pine-text)'
  const tint = 'var(--tint-pine)'
  // What the card leads with.
  //
  // The contact is often nameless — GHL creates one from an inbound SMS with
  // only a phone number. In that case the OPPORTUNITY name is the best human
  // label we hold ("Shrinivas Jaladanki"), and it was being relegated to the
  // subtitle while the raw phone number took the headline.
  const contactName = primaryName(deal.people)
  // A contact created from an inbound SMS has only a phone number, so
  // primaryName falls back to it. Showing a raw number as the card's headline
  // reads as broken data.
  const contactIsNameless = /^[+\d\s()-]+$/.test(contactName) || contactName === 'Unnamed contact'
  const dealName = deal.opportunityName || null

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: accent,
        ['--panel-tint']: tint,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: '13px var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--panel-tint, var(--gray-25))'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: accent }}>person</span>
        <h3
          style={{
            fontSize: 'var(--text-xl)', fontWeight: 600, color: accent,
            margin: 0, flex: 1, letterSpacing: '-0.01em'
          }}
        >
          Deal
        </h3>
        {deal.status && deal.status !== 'open' && (
          <StatusPill status={deal.status} />
        )}
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 0
        }}
      >
        {/* The DEAL leads — it's the record the page is about. The customer is
            named underneath it. These were conflated: the deal name was being
            substituted into the "Customer" slot when the contact had no name,
            so the label described the wrong thing and the deal name had nowhere
            of its own. */}
        <Column label="Deal">
          <div
            style={{
              fontSize: 'var(--text-3xl)', fontWeight: 600,
              color: 'var(--text-heading)',
              lineHeight: 1.15, letterSpacing: '-0.015em',
              overflowWrap: 'anywhere'
            }}
          >
            {dealName || 'Unnamed deal'}
          </div>

          <div style={{ marginTop: 'var(--space-3)' }}>
            <span className="pp-label" style={{ marginBottom: 3 }}>Customer</span>
            <div
              style={{
                fontSize: 'var(--text-lg)', fontWeight: 500,
                color: contactIsNameless ? 'var(--text-muted)' : 'var(--text-heading)'
              }}
            >
              {/* No name on the contact — say so rather than printing the phone
                  number twice (it already appears in the detail lines below). */}
              {contactIsNameless ? 'No name on this contact' : contactName}
            </div>
          </div>

          <ContactLines person={primaryPerson(deal.people)} />
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

      </div>

      {/* Custom-field chips. These are the opportunity's own GHL fields, so an
          unset one is a real gap in the record rather than something we failed
          to fetch — hence the dashed amber "Not set" treatment instead of
          hiding the chip. */}
      <FieldChipRow deal={deal} />

      <ProductFooter
        deal={deal}
        siblingDeals={siblingDeals}
        onOpenDeal={onOpenDeal}
      />
    </section>
  )
}

// ── Columns ───────────────────────────────────────────────────────────

function ValueColumn({ deal, onExpectedCloseChange }) {
  const [expectedClose, setExpectedClose] = useState(
    deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : ''
  )
  // Only swap in the date picker once the user asks for it — see below.
  const [editingClose, setEditingClose] = useState(false)

  return (
    <Column label="Value">
      {/* The value is the number the card is about, so it gets display size.
          A £0 or missing value is styled DOWN rather than shown at full weight:
          "£0" in 34px bold reads as a real figure, when what it means is "nobody
          has priced this yet". */}
      {(() => {
        const raw = String(deal.value ?? '').replace(/[^0-9.]/g, '')
        const unpriced = !deal.value || Number(raw) === 0
        if (unpriced) {
          return (
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xl)',
                  fontWeight: 500, color: 'var(--text-faint)'
                }}
              >
                {deal.value || '—'}
              </div>
              <div style={{ marginTop: 2, fontSize: 'var(--text-sm)', color: 'var(--accent-gold-text)' }}>
                Not priced yet
              </div>
            </div>
          )
        }
        return (
          <div
            className="pp-num"
            style={{
              fontSize: 'var(--text-display)', fontWeight: 600,
              letterSpacing: '-0.03em', lineHeight: 1.05,
              color: 'var(--text-heading)'
            }}
          >
            {deal.value}
          </div>
        )
      })()}

      {/* Quote revision — GHL has no revision field yet, so this only
          appears once something upstream supplies deal.quoteRevision. */}
      {deal.quoteRevision != null && (
        <RevisionBadge
          revision={deal.quoteRevision}
          provisional={deal.valueProvisional}
        />
      )}

      <FieldLabel>Expected close</FieldLabel>
      {/* An empty <input type="date"> renders the browser's own "dd/mm/yyyy"
          placeholder, which reads as a broken or half-loaded field rather than
          "no date set". Show the state as words; reveal the picker on click. */}
      {expectedClose || editingClose ? (
        <input
          type="date"
          autoFocus={editingClose && !expectedClose}
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
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-body)'
          }}
        />
      ) : (
        <button
          onClick={() => setEditingClose(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
            cursor: 'pointer',
            height: 34, padding: '0 10px',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
            color: 'var(--text-muted)'
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>event</span>
          Set a date
        </button>
      )}
      {deal.valueProvisional && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
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
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)', fontWeight: 500,
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
          // GHL stores whatever the user typed — this came through as
          // "jaladanki srinivas". Title-cased for display only.
          value={titleCase(deal.owner)}
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
        {deal.source && <Row label="Source" value={deal.source} />}
        {deal.quoteRevision != null && (
          <Row label="Quote revision" value={`Rev ${deal.quoteRevision}`} mono />
        )}
      </dl>
    </Column>
  )
}

// The five opportunity custom fields, as chips under the columns.
//
// Every one renders whether set or not: these are the deal's own GHL fields,
// so a blank is a real gap in the record — the dashed amber "Not set" is the
// point, not a placeholder for missing data on our side. Hiding an unset chip
// would make an incomplete deal look complete.
const FIELD_CHIPS = [
  ['Client type',           'clientType'],
  ['Product system',        'productSystem'],
  ['Product type',          'productType'],
  ['First contact method',  'firstContactMethod'],
  ['Lead source opportunity', 'leadSource']
]

function FieldChipRow({ deal }) {
  const isSet = (k) => {
    const v = deal[k]
    return v != null && String(v).trim() !== ''
  }
  // Set fields first: a rep scanning the card wants the values it HAS before
  // the gaps. Order within each group stays as declared.
  const ordered = [
    ...FIELD_CHIPS.filter(([, k]) => isSet(k)),
    ...FIELD_CHIPS.filter(([, k]) => !isSet(k))
  ]
  if (ordered.length === 0) return null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
        padding: '11px var(--space-4)',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      {ordered.map(([label, key]) => (
        <FieldChip key={key} label={label} value={deal[key]} />
      ))}
    </div>
  )
}


function FieldChip({ label, value }) {
  const set = value != null && String(value).trim() !== ''
  return (
    <span
      title={
        set
          ? `${label}: ${value}`
          : `${label} has no value on this deal in GoHighLevel`
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        maxWidth: '100%',
        height: 30, padding: '0 11px',
        border: set
          ? '1px solid var(--border-strong)'
          // Dashed + amber: unset is a gap to fill, not an error.
          : '1px dashed var(--accent-gold)',
        borderRadius: 'var(--radius-sm)',
        background: '#fff'
      }}
    >
      <span
        style={{
          flex: 'none',
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
      </span>
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 'var(--text-base)',
          fontWeight: set ? 500 : 400,
          color: set ? 'var(--text-heading)' : 'var(--accent-gold)'
        }}
      >
        {set ? value : 'Not set'}
      </span>
    </span>
  )
}

// Tags and sibling deals, below the chip row. These were in the Product column;
// they're full-width footers now that the columns are down to three.
function ProductFooter({ deal, siblingDeals, onOpenDeal }) {
  // The reassignment-targets payload includes the current deal — it's the
  // "move this message to" list. Here we only want the siblings.
  const others = (siblingDeals || []).filter((d) => d.id && !d.current)
  const hasTags = (deal.dealTags?.length || 0) + (deal.contactTags?.length || 0) > 0
  if (!hasTags && others.length === 0) return null

  return (
    <div
      style={{
        display: 'grid', gap: 10,
        padding: '11px var(--space-4)',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      {hasTags && (
        <TagList dealTags={deal.dealTags} contactTags={deal.contactTags} />
      )}

      {others.length > 0 && (
        <div>
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
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)'
                }}
              >
                <span className="ms" style={{ fontSize: 14 }}>sell</span>
                <span
                  style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}
                >
                  {d.name || 'Unnamed deal'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Email / phone / address / timezone for the primary contact, as icon rows.
function ContactLines({ person }) {
  if (!person) return null
  const lines = [
    ['mail', person.email],
    ['call', person.phone],
    ['location_on', person.address],
    ['schedule', person.timezone]
  ].filter(([, v]) => v)
  if (lines.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: 5, marginTop: 10 }}>
      {lines.map(([icon, value]) => (
        <span
          key={icon}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            fontSize: 'var(--text-base)', lineHeight: 1.4, color: 'var(--text-body)'
          }}
        >
          <span
            className="ms"
            style={{ fontSize: 'var(--text-lg)', color: 'var(--text-faint)', flex: 'none', marginTop: 1 }}
          >
            {icon}
          </span>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
        </span>
      ))}
    </div>
  )
}

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
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
              maxWidth: '100%',
              height: 24, padding: '0 9px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--border-default)',
              background: 'var(--gray-50)',
              color: 'var(--text-body)',
              fontSize: 'var(--text-sm)', fontWeight: 500
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
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500,
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
        // More room than before. The card carries the page's most important
        // facts and was the tightest thing on it — 14px of padding around
        // 34px display type reads as cramped.
        padding: 'var(--space-5) var(--space-5) var(--space-5)',
        borderRight: last ? 'none' : '1px solid var(--border-default)'
      }}
    >
      <span
        className="pp-label"
        style={{ marginBottom: 'var(--space-3)' }}
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
        fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
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
      style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 'var(--text-base)' }}
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
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600,
              letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
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
        marginTop: 8, height: 28, padding: '0 var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: provisional ? 'var(--status-working)' : 'var(--tint-pine)',
        color: provisional ? '#fff' : 'var(--green-600)',
        fontSize: 'var(--text-base)', fontWeight: 600
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
        fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
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
// The contact the card is about. Primary if one is flagged, else the first —
// same rule primaryName uses, factored out so the name and the contact details
// can never describe two different people.
function primaryPerson(people = []) {
  return people.find((x) => x.primary) || people[0] || null
}

function primaryName(people = []) {
  const p = primaryPerson(people)
  if (!p) return 'Unnamed deal'
  const first = (p.firstName || '').trim()
  const last = (p.lastName || '').trim()
  if (first && last) return `${first} ${last}`
  if (first || last) return first || last
  // No name on the contact. The business is the next most human label; an
  // email at least reads as a person. A raw phone number as the card's headline
  // is the worst option — it was showing "+447338628553" at display size with
  // the actual name underneath it as a subtitle.
  if (p.business) return p.business
  if (p.email) return p.email
  if (p.phone) return p.phone
  return 'Unnamed contact'
}

// GHL stores user names however they were typed — "jaladanki srinivas" came
// through lowercase. Title-case for display only; never for matching.
function titleCase(v) {
  if (!v) return v
  return String(v).replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
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
