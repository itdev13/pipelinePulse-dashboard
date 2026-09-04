import React, { useEffect, useMemo, useState } from 'react'
import { DatePicker, Select } from 'antd'
import dayjs from 'dayjs'
import TagSelect from '../shared/TagSelect'
import { currencySymbol } from '../../utils/money'

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
  // (field, value) => Promise. One field at a time: this card has no Save
  // button, and a picker commits the moment it changes.
  onSaveField,
  // The field currently in flight, so its control can show progress.
  saving = null,
  saved = null,
  saveError = null,
  // CRM users for the Owner picker, fetched lazily by the parent. null means
  // "not requested yet" — onNeedUsers triggers the fetch on first open.
  users = null,
  onNeedUsers,
  // Opens this deal's full editor on the Deals tab. The card edits the fields
  // a rep touches often; pipeline, status, followers and the contact's own
  // details live in that editor.
  onEditRecord,
  // { client_type: { id, label, options[], multiple }, ... } from
  // GET /api/deals/custom-field-options.
  fieldOptions = {}
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
        {/* The way to everything the card cannot edit inline — pipeline,
            status, followers, and the primary contact's own fields. Opens the
            Deals tab with THIS deal's editor already expanded, rather than
            leaving the rep to find the row.
            In the header, not beside a field: it is about the whole record. */}
        {onEditRecord && (
          <button
            onClick={onEditRecord}
            title="Open the full editor for this deal"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              flex: 'none',
              height: 28, padding: '0 11px 0 9px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-card)', color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
              fontWeight: 600, cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 15 }}>edit_note</span>
            Edit record
          </button>
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
          {/* Editable. It was plain text, so renaming a deal meant opening its
              row on the Deals tab or going to the CRM — even though `name` has
              been in the PATCH path since the deal writes landed. */}
          <InlineText
            label="Deal name"
            value={dealName}
            placeholder="Unnamed deal"
            fontSize="var(--text-3xl)"
            saving={saving === 'name'}
            onSave={(v) => onSaveField && onSaveField('name', v)}
          />

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
          onSaveField={onSaveField}
          saving={saving}
          onOpenBusiness={onOpenBusiness}
        />

        <StageColumn
          deal={deal}
          stages={stages}
          onSaveField={onSaveField}
          saving={saving}
          users={users}
          onNeedUsers={onNeedUsers}
        />

      </div>

      {/* Custom-field chips. These are the opportunity's own GHL fields, so an
          unset one is a real gap in the record rather than something we failed
          to fetch — hence the dashed amber "Not set" treatment instead of
          hiding the chip. */}
      <FieldChipRow
        deal={deal}
        fieldOptions={fieldOptions}
        onSaveField={onSaveField}
        saving={saving}
      />

      {/* Confirms a write. The controls on this card commit as soon as you pick
          a date or a stage — correct for a dropdown, but it meant a successful
          save looked exactly like doing nothing. */}
      {saved && !saveError && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            margin: '0 var(--space-4) 12px',
            fontSize: 'var(--text-sm)', fontWeight: 600,
            color: 'var(--status-done-text)'
          }}
        >
          <span className="ms" style={{ fontSize: 15 }}>check_circle</span>
          Saved to your CRM
        </div>
      )}

      {saveError && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            margin: '0 var(--space-4) 12px',
            padding: '9px 11px',
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-md)', color: 'var(--status-stuck-text)'
          }}
        >
          <span className="ms" style={{ fontSize: 16, flex: 'none', marginTop: 1 }}>error</span>
          {saveError}
        </div>
      )}

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

function ValueColumn({ deal, onSaveField, saving, onOpenBusiness }) {
  const [expectedClose, setExpectedClose] = useState(
    deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : ''
  )

  // Follow the deal — see StageColumn.
  useEffect(() => {
    setExpectedClose(deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : '')
  }, [deal.id, deal.forecastCloseDate])

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
              {/* Editable in BOTH branches — an unpriced deal is exactly the
                  one you want to price, so making only the priced state
                  editable would have been backwards. */}
              <ValueEditor deal={deal} onSaveField={onSaveField} saving={saving} muted />
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
        return <ValueEditor deal={deal} onSaveField={onSaveField} saving={saving} />
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
        popupClassName="pp-cal"
        value={expectedClose ? dayjs(expectedClose) : null}
        // Commits on pick. GHL stores a DATE only, so an empty pick clears it.
        onChange={(d) => {
          const v = d ? d.format('YYYY-MM-DD') : ''
          setExpectedClose(v)
          if (onSaveField) onSaveField('expectedCloseDate', v || null)
        }}
        disabled={saving === 'expectedCloseDate'}
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

function StageColumn({ deal, stages, onSaveField, saving, users, onNeedUsers }) {
  // Days in stage comes from the stage the deal currently sits on. The
  // stages endpoint carries enteredAt on the current entry when available;
  // otherwise fall back to the deal's own updated_at, which moves on every
  // stage change.
  const current = stages.find((s) => s.isCurrent)

  // The picker is keyed on the stage ID, not its name. GHL's update endpoint
  // takes pipelineStageId; no write endpoint accepts a name, so a picker whose
  // values were names could never save.
  const [stageId, setStageId] = useState(current?.id || null)

  // Follow the deal. useState seeds once, and DealSection is not keyed on the
  // deal id — so switching deals left the picker showing the PREVIOUS deal's
  // stage while the rest of the card updated.
  useEffect(() => {
    setStageId(current?.id || null)
  }, [current?.id, deal.id])
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
        value={stageId || current?.name || deal.stage || undefined}
        onChange={(v) => {
          setStageId(v)
          if (onSaveField) onSaveField('pipelineStageId', v)
        }}
        placeholder="No stage"
        size="large"
        className="pp-stage-select"
        // A pipeline can carry a dozen stages with similar names ("Marketing
        // Qualified" / "Sales Qualified"), so typing beats scrolling.
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        disabled={saving === 'pipelineStageId'}
        loading={saving === 'pipelineStageId'}
        popupClassName="pp-menu"
        // Stages come from a separate fetch, so an empty list means that call
        // failed — say so instead of antd's generic "No data".
        notFoundContent="Couldn't load this pipeline's stages"
        // The deal's stage may be retired or missing from pipeline_stages (the
        // /stages route injects a virtual entry for that) — keep it visible
        // either way, so the control never silently shows the wrong stage.
        //
        // An entry with no id is DISABLED: we can show where the deal sits but
        // cannot move it there, and an option that always fails is worse than
        // one that says it can't be picked.
        options={
          stages.length
            ? stages.map((st) => ({
                value: st.id || st.name,
                disabled: !st.id && !st.isCurrent,
                label: st.isActive === false
                  ? `${st.name} (retired)`
                  : !st.id ? `${st.name} (not in this pipeline)` : st.name
              }))
            : deal.stage ? [{ value: deal.stage, label: deal.stage, disabled: true }] : []
        }
      />

      <dl style={{ margin: '12px 0 0', display: 'grid', gap: 7 }}>
        {/* Owner is EDITABLE — `assignedTo` has been in the deal patch path all
            along, but this row rendered static text, so reassigning meant
            going to the Deals tab or the CRM.
            The other rows below stay read-only because they are not fields:
            Days in stage is computed from stage_history, Last customer contact
            is derived from messages, and GHL has no writable `source`. */}
        <OwnerRow
          deal={deal}
          users={users}
          onNeedUsers={onNeedUsers}
          saving={saving === 'assignedTo'}
          onSave={(v) => onSaveField && onSaveField('assignedTo', v)}
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
// [label, the deal property, GHL's custom-field key]
//
// The third column is EXPLICIT rather than derived from the second. A mechanical
// camelCase→snake_case conversion got three of five right and silently failed
// on the other two, so those chips rendered as read-only text while the rest
// became pickers:
//
//   firstContactMethod → first_contact_method   but GHL's key is
//                        first_contact__method  (double underscore — their typo,
//                                                but it is their key)
//   leadSource         → lead_source            but GHL's key is
//                        lead_source_opportunity
//
// stageHistoryWriter already accounts for the double underscore; the derivation
// here did not. Anything keyed off GHL's field names has to be spelled out.
const FIELD_CHIPS = [
  ['Client type',             'clientType',         'client_type'],
  ['Product system',          'productSystem',      'product_system'],
  ['Product type',            'productType',        'product_type'],
  ['First contact method',    'firstContactMethod', 'first_contact__method'],
  ['Lead source opportunity', 'leadSource',         'lead_source_opportunity']
]

// The five opportunity custom fields, as editable pickers.
//
// These were read-only chips because nothing sent their options — GHL defines
// them as picklists and customFieldsSync has stored the choices since migration
// 023, but no route exposed them. `fieldOptions` now carries
// { id, label, options[], multiple } per field.
//
// A field with no options in the response stays a plain chip: a free-text
// custom field must not render as an empty dropdown.
function FieldChipRow({ deal, fieldOptions = {}, onSaveField, saving }) {
  const isSet = (k) => {
    const v = deal[k]
    return v != null && String(v).trim() !== ''
  }

  // THE ORDER IS FROZEN ONCE, not recomputed on every render.
  //
  // This was the flicker, and it was not the Select's fault.
  //
  // Set fields sort before unset ones. Picking a value flips a field from
  // unset to set, so the chip being edited JUMPED from the end of the row to
  // the front — mid-interaction, because DealHubTab applies the value
  // optimistically the moment it is picked. React then reconciles a list whose
  // order changed, the picker's slot moves, and its `open` state resets: the
  // dropdown snapped shut and reopened.
  //
  // useMemo with an empty dep list pins the order to the first render, so the
  // row is stable for as long as the card is mounted. The sort still does its
  // job — a rep opening a deal sees values before gaps — it just does not
  // re-sort under the cursor. A reload picks up the new order.
  const ordered = useMemo(() => [
    ...FIELD_CHIPS.filter(([, k]) => isSet(k)),
    ...FIELD_CHIPS.filter(([, k]) => !isSet(k))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  // Both spellings, for the fields where GHL's own key is inconsistent — the
  // definitions endpoint reports whatever that location has, and a lookup that
  // misses leaves the chip read-only with no clue why.
  const specFor = (ghlKey, dealKey) =>
    fieldOptions[ghlKey]
    || fieldOptions[ghlKey.replace('__', '_')]
    || fieldOptions[dealKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)]
  if (ordered.length === 0) return null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
        padding: '11px var(--space-4)',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      {/* Each chip sits in a slot with a reserved minimum width.
          Without this the row still jumped horizontally: a closed chip is
          sized to its text ("FIRST CONTACT METHOD Not set"), and the open
          picker is a fixed 220px, so swapping them changed the slot's width
          and every chip after it moved along the wrapping row.

          minWidth on the slot, not the chip — the chip keeps its own hug-the-
          text sizing inside, so a short chip does not stretch its border to
          220px and look like an empty input. */}
      {ordered.map(([label, key, ghlKey]) => {
        const spec = specFor(ghlKey, key)
        // The slot. Editable fields reserve the picker's width so the swap is
        // dimensionless; a read-only chip has no open state and needs none.
        return spec && onSaveField ? (
          <span
            key={key}
            style={{
              display: 'inline-flex', alignItems: 'center',
              height: 34,
              // At least wide enough for a usable dropdown; wider if the
              // closed chip's own text needs it. flex:none so the wrapping row
              // never squeezes a slot below the width its chip established —
              // that squeeze was itself a source of movement.
              minWidth: 220, flex: 'none'
            }}
          >
            <FieldPicker
              label={label}
              value={deal[key]}
              spec={spec}
              saving={saving === spec.id}
              // dealKey travels so the handler can update the right property
              // optimistically — the response shape doesn't name it.
              onChange={(v) => onSaveField('customField', { id: spec.id, value: v, dealKey: key })}
            />
          </span>
        ) : (
          <FieldChip key={key} label={label} value={deal[key]} />
        )
      })}

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
      {/* NO TagList any more. TagSelect's collapsed view renders the contact
          tags AND the locked deal tags itself, so this duplicated both — the
          deal tags twice, and before that the contact tags twice.
          One component owns the pills and the editing, which is the point of
          collapsing it rather than keeping a separate display list. */}

      {/* INLINE, not a dialog behind an Edit button.
          Tags are one field, and a modal for one field dimmed the deal, trapped
          focus and had to be closed to edit a row of pills. Its suggestion list
          also grew taller than the dialog containing it.
          The select shows the current pills AND edits them, so the separate
          pill list above is only needed for the deal-scoped tags it cannot
          touch. */}
      {target && (
        <TagSelect
          contactId={target.id}
          tags={contactTags}
          // Deal-scoped tags can't be changed through the contact endpoint, so
          // they're listed as locked rather than offered and silently ignored.
          readOnlyTags={deal.dealTags || []}
          onChange={setContactTags}
        />
      )}
    </div>
  )
}

// An editable custom field. Reads as a chip until clicked, then becomes a
// picker — so a card with five of these still scans as a row of facts rather
// than a form.
// One save per EDIT, not per click.
//
// This used to call onChange — a PUT to GHL, ~700ms — on every option click.
// On a multi-select that meant three round trips to pick three options, with
// the dropdown blocked on each one, so picking felt like it hung.
//
// Now the picks are held in a local draft and written once, when the dropdown
// closes. Multi-select gets the bigger win (n saves become 1); single-select
// still saves immediately on pick, since choosing an option IS closing it.
function FieldPicker({ label, value, spec, saving, onChange }) {
  const [open, setOpen] = useState(false)
  const set = value != null && String(value).trim() !== ''

  // GHL multi-selects arrive as an array or a comma-joined string depending on
  // the path; the picker needs an array either way.
  const current = spec.multiple
    ? (Array.isArray(value) ? value : (set ? String(value).split(',').map((v) => v.trim()) : []))
    : (set ? String(value) : undefined)

  // The uncommitted selection. null means "nothing picked yet this session" —
  // distinct from [], which is a deliberate clear of every option.
  const [draft, setDraft] = useState(null)
  const shown = draft === null ? current : draft

  // Commit only when the draft actually differs. Opening a dropdown and
  // closing it again must not fire a write, and order is irrelevant for a
  // checkbox set, so both sides are sorted before comparing.
  const commit = () => {
    setOpen(false)
    if (draft === null) return
    const same = Array.isArray(draft) && Array.isArray(current)
      ? draft.length === current.length &&
        [...draft].sort().join('\u0000') === [...current].sort().join('\u0000')
      : draft === current
    setDraft(null)
    if (!same) onChange(draft)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={saving}
        title={`Change ${label}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          maxWidth: '100%',
          height: 34, padding: '0 12px',
          border: set
            ? '1px solid var(--border-strong)'
            : '1px dashed var(--accent-gold)',
          borderRadius: 'var(--radius-md)',
          background: set ? '#fff' : 'var(--tint-gold)',
          fontFamily: 'var(--font-sans)',
          cursor: saving ? 'progress' : 'pointer'
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)', fontWeight: 600,
            letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
            color: 'var(--text-muted)'
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 'var(--text-md)', fontWeight: 600,
            color: set ? 'var(--text-heading)' : 'var(--accent-gold-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {set ? String(value) : 'Not set'}
        </span>
        {/* pp-spin only while saving — the icon swapped to progress_activity
            but kept plain "ms", so it rendered as a static glyph that looked
            like a stalled spinner. Every other spinner in the app is
            "ms pp-spin"; this one was the outlier. */}
        <span
          className={saving ? 'ms pp-spin' : 'ms'}
          style={{ fontSize: 15, color: 'var(--text-faint)' }}
        >
          {saving ? 'progress_activity' : 'edit'}
        </span>
      </button>
    )
  }

  // SAME FOOTPRINT AS THE CHIP, which is the whole point of this branch's
  // layout.
  //
  // This used to be a flexDirection: column block — the label stacked ABOVE
  // the Select — with minWidth: 200. So opening a picker made the element both
  // taller and wider than the 34px chip it replaced, and since the row is a
  // wrapping flex container, every other chip reflowed around it. Clicking a
  // dropdown visibly threw the row about.
  //
  // Now: one row, 34px tall like the chip, with the label INSIDE as a prefix
  // rather than above. Nothing outside this element changes size, so nothing
  // moves.
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 34,
        // width:100% + the slot's minWidth:220 means the slot keeps whatever
        // width the closed chip gave it (never less than 220), and the picker
        // occupies it. Nothing resizes on the swap.
        width: '100%'
      }}
    >
      <Select
        autoFocus
        defaultOpen
        mode={spec.multiple ? 'multiple' : undefined}
        value={shown}
        onChange={(v) => {
          if (spec.multiple) {
            // Local only — written by commit() when the dropdown closes.
            setDraft(v)
            return
          }
          // Single-select: picking IS closing, so save straight away.
          setDraft(null)
          setOpen(false)
          if (v !== current) onChange(v)
        }}
        // ONLY onOpenChange. onBlur was also wired to commit(), and commit()
        // calls setOpen(false) — which unmounts the Select and renders the chip
        // again.
        //
        // That was survivable before this control had a search box. With
        // showSearch, antd moves focus between the selector and its search
        // input, so a transient blur fired mid-interaction: the picker
        // collapsed to a chip, focus came back, it reopened. Visible as a
        // flicker the moment the dropdown opened.
        //
        // onOpenChange fires once, on real dismissal — a click away, Escape,
        // or a pick — which is exactly when a commit is wanted.
        onOpenChange={(o) => { if (!o) commit() }}
        // Searchable: these are GHL picklists and some are long — the country
        // and product lists run to dozens of entries.
        //
        // optionFilterProp="label" rather than the default: antd filters on
        // `value` by default, and these options use the same string for both,
        // so filtering on label is equivalent here AND stays correct if the
        // shape ever splits into an id/name pair.
        showSearch
        optionFilterProp="label"
        options={spec.options.map((o) => ({ value: o, label: o }))}
        // The field name lives in the PLACEHOLDER, not a label element.
        //
        // A floating label above the box overlapped the chip row above it —
        // the picker is only 34px tall and sits in a tight wrapping row, so
        // there is no vertical room outside it. A sibling label ate the
        // horizontal space instead (that was the "Not…" truncation).
        //
        // The placeholder costs neither: it names the field while empty, and
        // once a value is picked the value itself says what it is.
        placeholder={label}
        allowClear
        // flex:1 so it fills the fixed-height wrapper above rather than
        // setting its own width. minWidth:0 is the flex-child fix — without it
        // a long multi-select value forces the item wider than its container
        // and the row reflows again, which is the bug this branch exists to
        // avoid.
        style={{ flex: 1, minWidth: 0 }}
        // The popup may be WIDER than the box, never narrower.
        //
        // antd's default sizes the popup to the trigger, so options were
        // truncated to whatever width the chip's slot happened to be —
        // "Telep…", "What…", "Unkn…" in a 100px dropdown. A minimum keeps
        // short values from a cramped list while letting long option names
        // show in full.
        popupMatchSelectWidth={false}
        // styles.popup.root, NOT popupStyle (which does not exist on this
        // component) and NOT dropdownStyle (deprecated in antd 5.25 in favour
        // of this). Checked against the installed typings — my first attempt
        // used popupStyle, which would have been silently ignored.
        styles={{ popup: { root: { minWidth: 240 } } }}
        // Pins the control to the chip's 34px so the swap does not change the
        // row's height — antd's default is 32px, and its box is on an inner
        // element a style prop cannot reach.
        className="pp-field-select"
        popupClassName="pp-menu"
        getPopupContainer={undefined}
      />
    </span>
  )
}

// Click-to-edit text, for the fields that were read-only despite being
// writable: the deal NAME and its VALUE.
//
// Both go through PATCH /api/deals/:id (name, value) — the write path has
// existed since the deal-write work, but the card rendered them as plain text,
// so the only way to rename a deal was to open its row on the Deals tab or go
// to GHL.
//
// Same interaction as FieldPicker above: display until clicked, then an input.
// Commits on Enter or blur, abandons on Escape — a rename is destructive
// enough that a mis-click should not save it.
// The Owner row, as a picker rather than static text.
//
// Renders as a plain value until clicked — a definition list of five facts
// should not have one row wearing a dropdown. `onNeedUsers` fires on first
// open so the parent fetches the list only when someone actually reassigns.
function OwnerRow({ deal, users, onNeedUsers, saving, onSave }) {
  const [open, setOpen] = useState(false)
  const loading = open && users === null

  const begin = () => {
    onNeedUsers && onNeedUsers()
    setOpen(true)
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
        <FieldLabel>Owner</FieldLabel>
        <button
          onClick={begin}
          disabled={saving}
          title="Reassign this deal"
          className="pp-inline-edit"
          style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 6,
            marginLeft: 'auto',
            padding: '1px 5px', margin: '-1px -5px -1px auto',
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-md)', fontWeight: 600,
            color: deal.owner ? 'var(--text-heading)' : 'var(--text-faint)',
            cursor: saving ? 'progress' : 'pointer'
          }}
        >
          {/* GHL stores whatever the user typed — this came through as
              "jaladanki srinivas". Title-cased for display only. */}
          <span>{titleCase(deal.owner) || 'Unassigned'}</span>
          {/* A deal still belongs to its owner after they leave the account —
              flag it rather than hiding it, so it reads as reassignable. */}
          {deal.ownerActive === false && (
            <span
              title="This user is no longer active on the sub-account"
              style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-faint)' }}
            >
              left account
            </span>
          )}
          <span
            className="ms pp-inline-pencil"
            style={{ fontSize: 14, color: 'var(--text-faint)', flex: 'none' }}
          >
            {saving ? 'progress_activity' : 'edit'}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <FieldLabel>Owner</FieldLabel>
      <Select
        autoFocus
        defaultOpen
        value={deal.assignedTo || undefined}
        onChange={(v) => { setOpen(false); onSave(v || null) }}
        onOpenChange={(o) => { if (!o) setOpen(false) }}
        loading={loading}
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder={loading ? 'Loading…' : 'Unassigned'}
        options={(users || []).map((u) => ({ value: u.id, label: u.name }))}
        notFoundContent={loading ? 'Loading…' : 'No users in this sub-account'}
        popupClassName="pp-menu"
        popupMatchSelectWidth={false}
        styles={{ popup: { root: { minWidth: 240 } } }}
        style={{ marginLeft: 'auto', minWidth: 190 }}
      />
    </div>
  )
}

// The monetary value, editable.
//
// Binds to deal.monetaryValue (the RAW number), never deal.value — that is
// display-formatted ("£26,000"), and editing it would send the formatted
// string back. The same trap the Deals tab hit.
function ValueEditor({ deal, onSaveField, saving, muted = false }) {
  // THE CURRENCY, AND WHY DISPLAY AND EDIT DIFFER.
  //
  // Reading the figure and typing it want different strings:
  //
  //   display — "£1,250". The symbol is part of what the number MEANS; a bare
  //     "123" beside a label reading VALUE could be pounds, dollars, or a
  //     count of something. The server already sends this, formatted through
  //     Intl with the deal's own currency (routes/deals.js), and this
  //     component was ignoring it and rendering monetaryValue raw.
  //
  //   edit — "1250". Separators and a symbol in an input are things a rep has
  //     to delete before typing, and the field is parsed back to digits on
  //     save anyway.
  //
  // NOT a hardcoded '£'. `currency` is a real column, defaulted to GBP but
  // set per opportunity, so a USD deal would have read "£1,250" — a wrong
  // number, not just a cosmetic slip.
  const symbol = currencySymbol(deal.currency)

  return (
    // display:block with width:100%, NOT inline-flex.
    //
    // inline-flex sizes to its content, so the `maxWidth: '100%'` on the
    // editor inside it resolved against the CONTENT width rather than the
    // column — and at --text-display (34px) the input grew past the column
    // border into the next one.
    <span className="pp-num" style={{ display: 'block', width: '100%', minWidth: 0 }}>
      <InlineText
        label="Value"
        // What the rep TYPES: the plain number.
        value={deal.monetaryValue != null ? String(deal.monetaryValue) : ''}
        // What the rep READS. Falls back to the raw number if the server sent
        // no formatted string, so a value never disappears on account of a
        // missing display field.
        display={
          deal.monetaryValue != null
            ? (deal.value || `${symbol}${deal.monetaryValue}`)
            : null
        }
        placeholder="—"
        fontSize="var(--text-display)"
        // Shown while EDITING, where the formatted string is not in the input.
        prefix={symbol}
        mono
        muted={muted}
        saving={saving === 'value'}
        // Strip everything but digits and a decimal point: a rep pasting
        // "£1,250.00" should not be rejected for the symbol and comma.
        parse={(v) => v.replace(/[^0-9.]/g, '')}
        onSave={(v) => onSaveField && onSaveField('value', v)}
      />
    </span>
  )
}

function InlineText({
  value, onSave, saving, label,
  // What to SHOW when not editing, when that differs from what to type.
  // The money field reads "£1,250" and edits "1250"; every other caller
  // omits this and shows `value` itself.
  display = undefined,
  // The deal name renders at --text-3xl; the value at --text-display. The
  // input has to match or the swap resizes the card.
  fontSize = 'var(--text-lg)', fontWeight = 600, placeholder,
  // Numeric fields get a prefix and a mono face.
  prefix = null, mono = false,
  // An unpriced deal keeps the faint colour it had before it was editable.
  muted = false,
  // Parses the input before it is sent. Value needs the currency symbol and
  // separators stripped; a name is sent as typed.
  parse = (v) => v.trim()
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const begin = () => {
    setDraft(value == null ? '' : String(value))
    setOpen(true)
  }

  const commit = () => {
    setOpen(false)
    const next = parse(draft)
    // No change, or cleared to nothing on a field that cannot be empty.
    if (next === '' || next === parse(String(value ?? ''))) return
    onSave(next)
  }

  // What the closed state shows. `display` is opt-in, so callers that never
  // pass it behave exactly as before.
  const shown = display !== undefined ? display : value

  if (!open) {
    return (
      <button
        onClick={begin}
        disabled={saving}
        // Includes the VALUE, not just the action: a figure truncated by the
        // ellipsis above has to be readable somewhere.
        // The tooltip carries the DISPLAY form: it exists so a figure cut off
        // by the ellipsis is readable somewhere, and "£1,250" is what the rep
        // is looking at.
        title={shown ? `${label}: ${shown} — click to edit` : `Edit ${label.toLowerCase()}`}
        className="pp-inline-edit"
        style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 8,
          maxWidth: '100%',
          padding: '2px 6px', margin: '-2px -6px',
          border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'none', textAlign: 'left',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize, fontWeight,
          color: (shown && !muted) ? 'var(--text-heading)' : 'var(--text-faint)',
          lineHeight: 1.15, letterSpacing: '-0.015em',
          // Text (the deal name) wraps anywhere so a long name doesn't
          // overflow the card. A number must never split mid-digit — "123"
          // breaking into "12" / "3" reads as two separate values — so mono
          // fields (currently only the money figure) get nowrap.
          //
          // But nowrap needs somewhere for the overflow to GO. The comment
          // here used to defer to "the container's own overflow handling",
          // and the container had none — so a large figure ran past the
          // column border into the next column. ellipsis keeps it inside;
          // the full value is in the title attribute either way.
          whiteSpace: mono ? 'nowrap' : 'normal',
          overflowWrap: mono ? 'normal' : 'anywhere',
          overflow: 'hidden',
          textOverflow: mono ? 'ellipsis' : 'clip',
          cursor: saving ? 'progress' : 'text'
        }}
      >
        <span>{shown || placeholder}</span>
        {/* Appears on hover — see .pp-inline-edit in the stylesheet. A pencil
            permanently beside a 34px heading competes with it. */}
        <span
          className="ms pp-inline-pencil"
          style={{ fontSize: 15, color: 'var(--text-faint)', flex: 'none' }}
        >
          {saving ? 'progress_activity' : 'edit'}
        </span>
      </button>
    )
  }

  return (
    // flex, not inline-flex, so this row fills the width available rather than
    // hugging its content. width:100% + minWidth:0 is the pair that lets the
    // input shrink instead of forcing the row wider — minWidth:0 alone is not
    // enough on a flex container whose child has intrinsic width.
    <span
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        width: '100%', minWidth: 0, maxWidth: '100%'
      }}
    >
      {prefix && (
        <span style={{ fontSize, fontWeight, color: 'var(--text-faint)' }}>{prefix}</span>
      )}
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          // Escape abandons. Without it the only way out of a mistyped rename
          // was to retype the original.
          if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
        }}
        style={{
          minWidth: 0, flex: 1,
          padding: '2px 6px', margin: '-2px 0',
          border: '1px solid var(--brand-primary)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-card)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize, fontWeight,
          color: 'var(--text-heading)',
          lineHeight: 1.15, letterSpacing: '-0.015em',
          outline: 'none'
        }}
      />
    </span>
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

// ── Primitives ────────────────────────────────────────────────────────

function Column({ label, children, last }) {
  return (
    <div
      style={{
        minWidth: 0,
        // CONTAINS its children. minWidth:0 lets the column shrink in the
        // grid, but on its own it does nothing to stop an over-wide child
        // painting outside the box — which is what the value editor did at
        // 34px, spilling across the border into the next column.
        //
        // The columns are separated by a 1px border, so anything crossing it
        // reads as a rendering fault rather than as long content.
        overflow: 'hidden',
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
