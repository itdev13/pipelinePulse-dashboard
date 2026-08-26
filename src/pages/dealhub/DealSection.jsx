import React, { useState } from 'react'
import { DatePicker, Select } from 'antd'
import dayjs from 'dayjs'
import TagPicker from '../shared/TagPicker'

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
  onOpenBusiness,
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

        {/* Businesses sits INSIDE this column, under Expected close. As its own
            column it took a quarter of the card's width to say "no business
            linked" — a whole panel for a field that is usually empty and never
            more than a chip or two when filled. */}
        <ValueColumn
          deal={deal}
          onExpectedCloseChange={onExpectedCloseChange}
          onOpenBusiness={onOpenBusiness}
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

      <TagRow deal={deal} />

      <ProductFooter
        deal={deal}
        siblingDeals={siblingDeals}
        onOpenDeal={onOpenDeal}
      />
    </section>
  )
}

// ── Columns ───────────────────────────────────────────────────────────

// Businesses this deal reaches.
//
// GHL has no opportunities.business_id — a deal links to a business only
// through the contacts on it (contacts.business_id). So this is usually one
// company, occasionally two when a deal spans a homeowner and their architect,
// and often none: the link only exists once the Businesses sync has run and
// the contact actually carries a businessId.
// A block within the Value column rather than a column of its own — see the
// grid above. Keeps its own label so the field is still named.
function BusinessBlock({ deal, onOpenBusiness }) {
  const businesses = deal.businesses || []

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <FieldLabel>{businesses.length === 1 ? 'Business' : 'Businesses'}</FieldLabel>
      {businesses.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-md)', lineHeight: 'var(--leading-normal)',
            color: 'var(--text-faint)'
          }}
        >
          {/* One line now, not three. In a narrower slot the old sentence wrapped
              to three lines and became the largest thing in the column — a lot of
              text to explain an absence. The "why" moves to the tooltip. */}
          <span title="A business is linked through the contact, so this fills in once one is set there.">
            None linked
          </span>
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {businesses.map((b) => (
            <button
              key={b.id}
              onClick={() => onOpenBusiness && onOpenBusiness(b.id)}
              title={`Open ${b.name}`}
              disabled={!onOpenBusiness}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                maxWidth: '100%',
                cursor: onOpenBusiness ? 'pointer' : 'default',
                padding: '7px 12px',
                border: '1px solid var(--accent-sky)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--tint-sky)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-md)', fontWeight: 600,
                color: 'var(--accent-sky-text)',
                textAlign: 'left'
              }}
            >
              <span className="ms" style={{ fontSize: 17, flex: 'none' }}>domain</span>
              <span
                style={{
                  minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {b.name}
              </span>
              {onOpenBusiness && (
                <span className="ms" style={{ fontSize: 15, flex: 'none' }}>
                  arrow_forward
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ValueColumn({ deal, onExpectedCloseChange, onOpenBusiness }) {
  const [expectedClose, setExpectedClose] = useState(
    deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : ''
  )

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
          // Unpriced still reads at display size — it's the number the card is
          // about, and shrinking it to grey made the least-finished deal the
          // hardest thing to notice. The amber pill carries the meaning.
          return (
            <div>
              <div
                className="pp-num"
                style={{
                  fontSize: 'var(--text-display)', fontWeight: 600,
                  letterSpacing: '-0.03em', lineHeight: 1.05,
                  color: 'var(--text-faint)'
                }}
              >
                {deal.value || '—'}
              </div>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  marginTop: 6, padding: '3px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--tint-gold)', color: 'var(--accent-gold-text)',
                  fontSize: 'var(--text-sm)', fontWeight: 600
                }}
              >
                <span className="ms" style={{ fontSize: 14 }}>error</span>
                Not priced yet
              </span>
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
      {/* antd's picker, which has a real placeholder — the native
          <input type="date"> renders the browser's own "dd/mm/yyyy" when empty,
          which read as a broken field. That's also why the old
          reveal-on-click "Set a date" button existed; the picker makes it
          unnecessary. */}
      <DatePicker
        value={expectedClose ? dayjs(expectedClose) : null}
        onChange={(d) => {
          const v = d ? d.format('YYYY-MM-DD') : ''
          setExpectedClose(v)
          if (onExpectedCloseChange) onExpectedCloseChange(v)
        }}
        format="D MMM YYYY"
        placeholder="Set a date"
        style={{ width: '100%' }}
      />

      {deal.valueProvisional && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Provisional — excluded from pipeline totals
        </p>
      )}

      <BusinessBlock deal={deal} onOpenBusiness={onOpenBusiness} />
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
      {/* antd Select. The stage change is the primary action on this card, so
          it keeps the brand-tinted treatment via className rather than reverting
          to a default form control. */}
      <Select
        value={stage || undefined}
        onChange={(v) => {
          setStage(v)
          if (onStageChange) onStageChange(v)
        }}
        placeholder="No stage"
        size="large"
        className="pp-stage-select"
        style={{ width: '100%' }}
        // The deal's stage may be retired or missing from pipeline_stages (the
        // /stages route injects a virtual entry for that) — keep it selectable
        // either way, so the control never silently shows the wrong stage.
        options={
          stages.length
            ? stages.map((st) => ({
                value: st.name,
                label: st.isActive === false ? `${st.name} (retired)` : st.name
              }))
            : stage ? [{ value: stage, label: stage }] : []
        }
      />

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

      {/* Tags share this line rather than getting their own labelled block
          below. They're the same kind of thing — small facts about the deal —
          and a full section with a stacked TAGS heading spent ~90px of card
          height on what is often a single pill. */}
    </div>
  )
}

// Tags, on their own line under the chip row.
//
// A "Tags:" prefix rather than a stacked uppercase heading — the label sits on
// the same line as the pills, so it reads as a sentence and costs one row
// instead of the ~90px a full labelled section took.
function TagRow({ deal }) {
  // Local so a change shows immediately. The webhook reconciles our database a
  // moment later; re-fetching the deal to see a pill appear would be slower and
  // no more accurate.
  const [contactTags, setContactTags] = useState(deal.contactTags || [])
  const [picking, setPicking] = useState(false)

  // Tags live on the CONTACT, so editing needs one. GHL names an opportunity
  // after its contact and the primary is who the deal is about, so that's the
  // one to edit — with several people on a deal, a picker for "which person's
  // tags" would be a question the rep didn't ask.
  const people = deal.people || []
  const target = people.find((p) => p.primary) || people[0] || null

  const count = (deal.dealTags?.length || 0) + (contactTags?.length || 0)

  // Unlike before, an untagged deal still renders — the row is now how you ADD
  // the first tag, so hiding it when empty would hide the only way in.
  if (count === 0 && !target) return null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        flexWrap: 'wrap',
        padding: '10px var(--space-4)',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      <span
        style={{
          flex: 'none',
          fontSize: 'var(--text-md)', fontWeight: 600,
          color: 'var(--text-muted)'
        }}
      >
        Tags:
      </span>
      {/* TagList dedupes a tag applied to both the deal and the contact, so
          it stays the single source for the pill list. */}
      <TagList dealTags={deal.dealTags} contactTags={contactTags} inline />

      {count === 0 && (
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
          None yet
        </span>
      )}

      {target && (
        <button
          onClick={() => setPicking(true)}
          title={`Edit tags on ${target.firstName || target.name || 'this contact'}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 26, padding: '0 10px 0 8px',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-pill)',
            background: '#fff', color: 'var(--text-body)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <span className="ms" style={{ fontSize: 15 }}>edit</span>
          Edit
        </button>
      )}

      {picking && target && (
        <TagPicker
          contactId={target.id}
          tags={contactTags}
          // Deal-scoped tags can't be changed through the contact endpoint, so
          // they're shown locked rather than offered and silently ignored.
          readOnlyTags={deal.dealTags || []}
          onChange={setContactTags}
          onClose={() => setPicking(false)}
        />
      )}
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
          : `${label} has no value on this deal`
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        maxWidth: '100%',
        height: 34, padding: '0 12px',
        // A SET field is solid and filled — it carries information, so it reads
        // as content. An UNSET one stays dashed and amber: a gap to fill, not an
        // error. Before, both were white outlines and the five unset chips were
        // the loudest thing in the row.
        border: set
          ? '1px solid var(--border-strong)'
          : '1px dashed var(--accent-gold)',
        borderRadius: 'var(--radius-sm)',
        background: set ? 'var(--gray-25)' : 'transparent'
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
          fontSize: 'var(--text-md)',
          fontWeight: set ? 600 : 500,
          // accent-gold-text, not accent-gold: at 11px on white the lighter
          // value is 3.25:1, below AA.
          color: set ? 'var(--text-heading)' : 'var(--accent-gold-text)'
        }}
      >
        {set ? value : 'Not set'}
      </span>
    </span>
  )
}

// Sibling deals, below the chip row. Tags used to live here too, but they now
// share the chip row — a labelled block spent ~90px of card height on what is
// often a single pill.
function ProductFooter({ deal, siblingDeals, onOpenDeal }) {
  // The reassignment-targets payload includes the current deal — it's the
  // "move this message to" list. Here we only want the siblings.
  const others = (siblingDeals || []).filter((d) => d.id && !d.current)
  // Tags moved up into the chip row — rendering them here too would show every
  // tag twice. This footer is now sibling deals only.
  if (others.length === 0) return null

  return (
    <div
      style={{
        display: 'grid', gap: 10,
        padding: '11px var(--space-4)',
        borderTop: '1px solid var(--border-default)'
      }}
    >
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

function TagList({ dealTags = [], contactTags = [], inline = false }) {
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

  const pills = (
    <>
        {shown.map((t) => (
          <span
            key={`${t.scope}:${t.name}`}
            title={
              t.scope === 'deal'
                ? 'Set on the opportunity record'
                : 'Applied to the contact — tags are scoped to contacts'
            }
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
              maxWidth: '100%',
              height: 28, padding: '0 11px',
              borderRadius: 'var(--radius-pill)',
              // Tinted rather than grey-on-grey. A tag is a label someone chose
              // to apply, so it should read as one.
              border: '1px solid var(--green-100)',
              background: 'var(--tint-pine)',
              color: 'var(--accent-pine-text)',
              fontSize: 'var(--text-md)', fontWeight: 600
            }}
          >
            {/* Deal-scoped tags are rare enough to be worth marking, but
                not worth a second colour scheme — a dot reads as "more
                specific" without implying contact tags are lesser. */}
            {t.scope === 'deal' && (
              <span
                style={{
                  width: 5, height: 5, flex: 'none',
                  borderRadius: '50%', background: 'var(--green-700)'
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
    </>
  )

  // Inline: the pills join the parent's flex row, so no wrapper and no label.
  // Standalone keeps the labelled block for anywhere else that needs it.
  if (inline) return pills

  return (
    <>
      <FieldLabel>Tags</FieldLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{pills}</div>
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
        padding: 'var(--space-5)',
        // gray-300, not border-default. border-default IS gray-200 (1.34:1 on
        // white) — at that weight the three columns read as one continuous
        // field rather than three zones.
        borderRight: last ? 'none' : '1px solid var(--gray-300)'
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
      style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        // A tinted band on the row that needs attention. Four rows at identical
        // weight meant a stale "last contact" read exactly like a healthy
        // "4 days in stage" — the colour was on the value alone, which is a
        // detail you have to already be looking at to notice.
        padding: danger ? '3px 8px' : '3px 0',
        margin: danger ? '0 -8px' : 0,
        borderRadius: 'var(--radius-sm)',
        background: danger ? 'var(--tint-rose)' : 'transparent',
        fontSize: 'var(--text-md)'
      }}
    >
      <dt
        style={{
          flex: 1, minWidth: 0,
          // status-stuck is a FILL colour — 3.81:1 as text on the rose tint
          // this row now sits on. status-stuck-text is the AA-passing pair.
          color: danger ? 'var(--status-stuck-text)' : 'var(--text-muted)',
          fontWeight: danger ? 600 : 400
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0, flex: 'none', textAlign: 'right',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontWeight: 600,
          color: danger ? 'var(--status-stuck-text)' : 'var(--text-heading)'
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
