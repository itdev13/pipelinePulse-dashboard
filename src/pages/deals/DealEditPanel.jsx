import React, { useEffect, useMemo, useState } from 'react'
import { DatePicker, Select, Input } from 'antd'
import dayjs from 'dayjs'
import { dealsAPI } from '../../api/deals'
import { contactsAPI } from '../../api/contacts'
import ConfirmDialog from '../shared/ConfirmDialog'
import { nameFor } from '../shared/ListChrome'
import ContactPicker from '../shared/ContactPicker'
import { currencySymbol } from '../../utils/money'

// The inline deal editor — everything GHL's own edit modal offers, in the row.
//
// WHY INLINE RATHER THAN A MODAL. A rep working a list is comparing deals; a
// modal hides the list it was opened from. Expanding in place keeps the
// surrounding rows visible, so "is this the one I meant?" stays answerable
// while editing.
//
// WHAT IT WRITES, AND WHERE. Three different endpoints, because GHL splits them
// and so does our server:
//
//   PATCH  /api/deals/:id            name, pipeline, stage, value, owner,
//                                    close date, business, source
//   PUT    /api/deals/:id/status     status — the ONLY route that records a
//                                    lost reason, so it cannot be folded in
//   POST   /api/deals/:id/followers  additive; a partial list must not delete
//   DELETE /api/deals/:id/followers  the rest, so add and remove are separate
//
// Contact fields go to the CONTACT, not the opportunity: primary name, email
// and phone are properties of the contact record that GHL's modal happens to
// render alongside the deal. They save through contactsAPI, and tags likewise
// (tags are additive for the same reason as followers).
//
// ONE SAVE PER EDIT SESSION. Every control writes to local draft state and
// nothing goes to the network until Update. The alternative — save per control
// — was measured at ~700ms per round trip on the Deal Hub chips, so editing six
// fields meant six waits. Here it is one request per endpoint that actually has
// changes, and usually that is one request total.
//
// NOTHING IS WRITTEN LOCALLY. Opportunities have full webhook coverage and
// stage_history (every "days in stage" figure) is maintained only by that path,
// so a change lands in our database when the webhook arrives, not on save. The
// panel therefore applies GHL's echoed response optimistically and tells the
// parent to refetch.

// Status is a fixed enum on GHL's side. `all` appears in their docs but is a
// search filter only and is rejected on a write — the server's STATUSES list
// says the same.
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'abandoned', label: 'Abandon' }
]

// Trim, then treat '' as "cleared" rather than as a value. GHL distinguishes
// absent from empty, and sending '' where the rep meant "leave it alone" would
// wipe the field.
const clean = (v) => {
  const s = (v ?? '').toString().trim()
  return s === '' ? null : s
}

// Compare two arrays as SETS. Followers are unordered, so a reordered array is
// not an edit — treating it as one would fire a pointless write.
//
// Length first, then a sorted element-wise comparison. No join separator: any
// separator can appear inside a value (a GHL user id is opaque), and comparing
// element by element has no such ambiguity.
const sameSet = (a = [], b = []) => {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

// Reference data (pipelines, users) is fetched ONCE by the tab and passed in.
//
// It is location-wide and identical for every row, so fetching it inside the
// panel would be two requests per expand — 40 on a 20-deal list if a rep opened
// each one. `refError` likewise comes from the parent, which knows whether the
// single shared fetch failed.
export default function DealEditPanel({
  deal, pipelines, users, refError, onSaved, onDeleted, onClose,
  // Called after a contact is linked or unlinked, so the caller refetches the
  // deal. Separate from onSaved: those writes go straight to GHL rather than
  // through this form's Update, so the panel stays open and only the people
  // list changes.
  onPeopleChanged
}) {
  const [lostReasons, setLostReasons] = useState(null)

  // ── Opportunity draft ───────────────────────────────────────────────────
  const [name, setName] = useState(deal.opportunityName || deal.dealTag || '')
  const [pipelineId, setPipelineId] = useState(deal.pipelineId || null)
  const [stageId, setStageId] = useState(deal.stageId || null)
  const [status, setStatus] = useState(deal.status || 'open')
  const [lostReasonId, setLostReasonId] = useState(null)
  // The RAW number. deal.value is display-formatted ("£26,000") and the input
  // prints its own £ prefix, so binding to it renders "£ £26,000" and sends the
  // formatted string back on save.
  const [value, setValue] = useState(
    deal.monetaryValue != null ? String(deal.monetaryValue) : ''
  )
  const [assignedTo, setAssignedTo] = useState(deal.assignedTo || null)
  const [followers, setFollowers] = useState(deal.followers || [])
  const [source, setSource] = useState(deal.source || '')
  const [closeDate, setCloseDate] = useState(
    deal.forecastCloseDate ? dayjs(deal.forecastCloseDate).format('YYYY-MM-DD') : ''
  )

  // ── Contact draft ───────────────────────────────────────────────────────
  const primary = useMemo(
    () => (deal.people || []).find((p) => p.primary) || (deal.people || [])[0] || null,
    [deal.people]
  )
  const [email, setEmail] = useState(primary?.email || '')
  const [phone, setPhone] = useState(primary?.phone || '')
  const [business, setBusiness] = useState(primary?.business || '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Stages for the SELECTED pipeline, not the deal's stored one — picking a new
  // pipeline must repopulate this list immediately.
  const stagesForPipeline = useMemo(() => {
    if (!pipelines) return []
    const p = pipelines.find((x) => x.id === pipelineId)
    return p?.stages || []
  }, [pipelines, pipelineId])

  // Changing pipeline invalidates the stage: a stage belongs to exactly one
  // pipeline, and the server rejects a mismatch (422). Rather than let the rep
  // hit that error, move to the new pipeline's first stage.
  const onPipelineChange = (next) => {
    setPipelineId(next)
    const p = (pipelines || []).find((x) => x.id === next)
    const first = (p?.stages || []).find((s) => s.isActive) || (p?.stages || [])[0]
    setStageId(first?.id || null)
  }

  // Marking a deal lost needs the reason list, which is fetched from GHL rather
  // than our table — a reason nobody has used yet would be missing from the
  // very list whose job is to offer it. Fetched on demand: most edits never
  // touch status.
  useEffect(() => {
    if (status !== 'lost' || lostReasons !== null) return
    dealsAPI.lostReasons()
      .then((r) => setLostReasons(r?.lostReasons || r?.reasons || []))
      .catch(() => setLostReasons([]))
  }, [status, lostReasons])

  // ── What changed ────────────────────────────────────────────────────────
  //
  // Split by endpoint, because they are three different requests and a panel
  // with only a tag edit must not PATCH the opportunity.
  const wasName = deal.opportunityName || deal.dealTag || ''
  const wasValue = deal.monetaryValue != null ? String(deal.monetaryValue) : ''
  const wasClose = deal.forecastCloseDate
    ? dayjs(deal.forecastCloseDate).format('YYYY-MM-DD') : ''

  const dealPatch = useMemo(() => {
    const out = {}
    if (name.trim() !== wasName) out.name = name.trim()
    if (pipelineId !== (deal.pipelineId || null)) out.pipelineId = pipelineId
    if (stageId !== (deal.stageId || null)) out.pipelineStageId = stageId
    if (value.trim() !== wasValue) out.value = clean(value)
    if (assignedTo !== (deal.assignedTo || null)) out.assignedTo = assignedTo
    if (closeDate !== wasClose) out.expectedCloseDate = closeDate || null
    return out
  }, [
    name, wasName, pipelineId, stageId, value, wasValue, assignedTo,
    closeDate, wasClose, deal.pipelineId, deal.stageId, deal.assignedTo
  ])

  const statusChanged = status !== (deal.status || 'open')

  // Add-only — see the Followers field. There is no stored baseline to diff
  // against, so whatever is in the box is what gets added. sameSet is still
  // used for the initial state so reopening a panel isn't treated as an edit.
  const followerChanges = useMemo(() => {
    const was = deal.followers || []
    if (sameSet(was, followers)) return null
    return { add: followers.filter((f) => !was.includes(f)) }
  }, [followers, deal.followers])

  const contactPatch = useMemo(() => {
    if (!primary) return {}
    const out = {}
    if (clean(email) !== clean(primary.email)) out.email = clean(email)
    if (clean(phone) !== clean(primary.phone)) out.phone = clean(phone)
    if (clean(business) !== clean(primary.business)) out.companyName = clean(business)
    return out
  }, [email, phone, business, primary])

  const changeCount =
    Object.keys(dealPatch).length +
    (statusChanged ? 1 : 0) +
    (followerChanges ? 1 : 0) +
    Object.keys(contactPatch).length

  const dirty = changeCount > 0

  const revert = () => {
    setName(wasName)
    setPipelineId(deal.pipelineId || null)
    setStageId(deal.stageId || null)
    setStatus(deal.status || 'open')
    setLostReasonId(null)
    setValue(wasValue)
    setAssignedTo(deal.assignedTo || null)
    setFollowers(deal.followers || [])
    setSource(deal.source || '')
    setCloseDate(wasClose)
    setEmail(primary?.email || '')
    setPhone(primary?.phone || '')
    setBusiness(primary?.business || '')
    setError(null)
    setErrorField(null)
  }

  const save = async () => {
    if (!dirty || saving) return
    // A lost deal without a reason is the one case worth blocking: GHL accepts
    // it, but the reason is the whole point of recording a loss and it cannot
    // be added afterwards through this panel.
    if (status === 'lost' && !lostReasonId && (lostReasons || []).length > 0) {
      setError('Pick a reason for the loss')
      setErrorField('lostReasonId')
      return
    }
    setSaving(true)
    setError(null)
    setErrorField(null)
    try {
      // Sequential, not parallel, and deliberately so: status and the field
      // patch both write the same opportunity in GHL, and firing them together
      // let the second overwrite the first's echo.
      if (Object.keys(dealPatch).length > 0) {
        await dealsAPI.update(deal.id, dealPatch)
      }
      if (statusChanged) {
        await dealsAPI.setStatus(deal.id, status, lostReasonId || undefined)
      }
      if (followerChanges?.add?.length) {
        await dealsAPI.addFollowers(deal.id, followerChanges.add)
      }
      if (Object.keys(contactPatch).length > 0 && primary?.id) {
        await contactsAPI.update(primary.id, contactPatch)
      }
      // The parent refetches. Nothing is written to our database by these
      // routes — the webhook does that — so the panel cannot show the
      // authoritative row itself.
      onSaved && onSaved()
    } catch (err) {
      setError(err.message || 'Could not save that — try again')
      setErrorField(err.data?.field || null)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await dealsAPI.remove(deal.id)
      onDeleted && onDeleted()
    } catch (err) {
      setError(err.message || 'Could not delete that deal')
      setSaving(false)
    }
  }

  const loadingRef = pipelines === null || users === null

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-default)',
        background: 'var(--gray-25)',
        padding: 'var(--space-4)'
      }}
    >
      {refError && (
        <p
          style={{
            margin: '0 0 var(--space-3)',
            fontSize: 'var(--text-base)', color: 'var(--status-stuck-text)'
          }}
        >
          {refError} — the text fields still save.
        </p>
      )}

      <Group title="Opportunity details">
        <Row>
          <Field label="Deal name" required span={2}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              status={errorField === 'name' ? 'error' : undefined}
              placeholder="Name this deal"
            />
          </Field>
        </Row>
        <Row>
          <Field label="Pipeline">
            <Select
              value={pipelineId || undefined}
              onChange={onPipelineChange}
              // Searchable: a location can carry a dozen pipelines and the
              // names are long ('Marketing pipeline', 'Chris Spilsbury').
              showSearch
              optionFilterProp="label"
              disabled={saving}
              loading={loadingRef}
              placeholder={loadingRef ? 'Loading…' : 'No pipeline'}
              options={(pipelines || []).map((p) => ({ value: p.id, label: p.name }))}
              notFoundContent="No pipelines found in this sub-account"
              popupClassName="pp-menu"
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Stage">
            <Select
              value={stageId || undefined}
              onChange={setStageId}
              showSearch
              optionFilterProp="label"
              disabled={saving || !pipelineId}
              loading={loadingRef}
              placeholder={pipelineId ? 'No stage' : 'Pick a pipeline first'}
              status={errorField === 'pipelineStageId' ? 'error' : undefined}
              options={stagesForPipeline.map((s) => ({
                value: s.id,
                // A retired stage is shown (a deal may be parked on one) but
                // labelled, so nobody moves a deal onto a dead stage by
                // accident.
                label: s.isActive ? s.name : `${s.name} (retired)`,
                disabled: !s.isActive && s.id !== deal.stageId
              }))}
              notFoundContent="This pipeline has no stages"
              popupClassName="pp-menu"
              style={{ width: '100%' }}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Status">
            <Select
              value={status}
              onChange={(v) => { setStatus(v); if (v !== 'lost') setLostReasonId(null) }}
              disabled={saving}
              options={STATUSES}
              popupClassName="pp-menu"
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Value">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              status={errorField === 'value' ? 'error' : undefined}
              prefix={<span style={{ color: 'var(--text-faint)' }}>{currencySymbol(deal?.currency)}</span>}
              placeholder="Not priced"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
        </Row>

        {/* Only when it applies. A reason picker permanently on screen would be
            a control that does nothing for the other three statuses. */}
        {status === 'lost' && (
          <Row>
            <Field label="Reason for loss" required span={2}>
              <Select
                value={lostReasonId || undefined}
                onChange={setLostReasonId}
                showSearch
                optionFilterProp="label"
                disabled={saving}
                loading={lostReasons === null}
                status={errorField === 'lostReasonId' ? 'error' : undefined}
                placeholder={lostReasons === null ? 'Loading…' : 'Why was it lost?'}
                options={(lostReasons || []).map((r) => ({
                  value: r.id || r.value,
                  label: r.name || r.label
                }))}
                notFoundContent="No lost reasons configured in your CRM"
                popupClassName="pp-menu"
                style={{ width: '100%' }}
              />
            </Field>
          </Row>
        )}

        <Row>
          <Field label="Owner">
            <Select
              value={assignedTo || undefined}
              onChange={setAssignedTo}
              disabled={saving}
              loading={loadingRef}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Unassigned"
              options={(users || []).map((u) => ({ value: u.id, label: u.name }))}
              notFoundContent="No matching user"
              popupClassName="pp-menu"
              style={{ width: '100%' }}
            />
          </Field>
          {/* ADD-ONLY, and labelled as such.
              Nothing stores a deal's followers: GHL has no read endpoint for
              them, no column holds them, and no route returns them. So this
              control cannot show who already follows the deal, and a "remove"
              would diff against an empty baseline and delete nothing.
              Offering add alone is honest; a multi-select that looked like the
              full list would imply the blanks mean "nobody follows this". */}
          <Field label="Add followers">
            <Select
              mode="multiple"
              value={followers}
              onChange={setFollowers}
              disabled={saving}
              loading={loadingRef}
              showSearch
              optionFilterProp="label"
              placeholder="Add followers"
              options={(users || []).map((u) => ({ value: u.id, label: u.name }))}
              notFoundContent="No matching user"
              popupClassName="pp-menu"
              style={{ width: '100%' }}
            />
            <span
              style={{
                display: 'block', marginTop: 4,
                fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
              }}
            >
              Your CRM doesn’t report existing followers, so this only adds.
            </span>
          </Field>
        </Row>
        <Row>
          <Field label="Expected close">
            <DatePicker
              popupClassName="pp-cal"
              value={closeDate ? dayjs(closeDate) : null}
              onChange={(d) => setCloseDate(d ? d.format('YYYY-MM-DD') : '')}
              disabled={saving}
              status={errorField === 'expectedCloseDate' ? 'error' : undefined}
              format="D MMM YYYY"
              placeholder="Set a date"
              style={{ width: '100%' }}
            />
          </Field>
          {/* READ-ONLY, and it has to be.
              GHL's opportunity update endpoint has no writable `source` — it
              is absent from opportunityPatch's FIELD_MAP, so a patch key for
              it is dropped silently. This was an editable Input, which meant
              typing a source looked like it saved and never did. GHL sets it
              from how the opportunity was created ("public api" here). */}
          <Field label="Source">
            <Input
              value={source}
              readOnly
              disabled
              placeholder="Not recorded"
              title="Your CRM sets this from how the deal was created — it can't be edited"
            />
          </Field>
        </Row>
      </Group>

      {/* WHO IS ON THE DEAL, above the primary's own fields.
          The panel edited the primary contact's email and phone but never
          showed who the deal's people were — so a rep had no indication that
          two others were linked, and no way to add or remove one without
          leaving for the deal hub. */}
      <PeopleEditor
        dealId={deal.id}
        people={deal.people || []}
        onChanged={onPeopleChanged}
        disabled={saving}
      />

      {/* Contact details. These write to the CONTACT record, not the
          opportunity — GHL's modal renders them together, but they are
          different objects and different endpoints. Hidden entirely when the
          deal has no contact: fields that cannot save are worse than absent. */}
      {/* nameFor, not primary.name — the list route sends firstName/lastName and
          no combined `name`, and a contact created from an inbound SMS has
          neither, so nameFor falls back to business or email. */}
      {primary && (
        <Group title={`Contact details — ${nameFor(primary)}`}>
          <Row>
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                status={errorField === 'email' ? 'error' : undefined}
                placeholder="No email"
                inputMode="email"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
                status={errorField === 'phone' ? 'error' : undefined}
                placeholder="No phone"
                inputMode="tel"
              />
            </Field>
          </Row>
          <Row>
            <Field label="Business name" span={2}>
              <Input
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                disabled={saving}
                placeholder="No business"
              />
            </Field>
          </Row>
          {/* NO TAG PICKER HERE, deliberately.
              TagSelect edits CONTACT tags and needs the contact's current list
              to diff against. The list route does not send it: `deal.tags` is
              opportunities.tags (the OPPORTUNITY's tags), and contact tags come
              from a separate contact_tags query that only GET /api/deals/:id
              runs. Seeding the picker from the wrong array would show no tags
              and let a "remove" delete ones it never displayed.
              Tags are editable in the Deal Hub, which has the real list. */}
        </Group>
      )}

      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            margin: '0 0 var(--space-3)',
            padding: '9px 11px',
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-base)', color: 'var(--status-stuck-text)'
          }}
        >
          <span className="ms" style={{ fontSize: 15, flex: 'none', marginTop: 1 }}>error</span>
          {error}
        </div>
      )}

      {/* Actions. Delete sits apart from Cancel/Update so the destructive one
          is not adjacent to the one people click by reflex. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          paddingTop: 'var(--space-3)',
          borderTop: '1px solid var(--border-default)'
        }}
      >
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={saving}
          title="Delete this deal in your CRM"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 34, padding: '0 13px',
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', color: 'var(--status-stuck-text)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
            cursor: saving ? 'default' : 'pointer'
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>delete</span>
          Delete
        </button>

        <span
          style={{
            flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-faint)',
            textAlign: 'right'
          }}
        >
          {/* Nothing shown on a pristine panel. "No changes" sat beside a
              button labelled Close and a disabled Update, restating what both
              already said — three controls reporting one fact. The count
              earns its place only when there IS something unsaved. */}
          {saving
            ? 'Saving to your CRM…'
            : dirty
              ? `${changeCount} unsaved change${changeCount === 1 ? '' : 's'}`
              : ''}
        </span>

        <button
          // Cancel does two jobs depending on state, and is NEVER disabled.
          //
          // It used to be `disabled={!dirty || saving}`, which left the panel
          // with no way out: with no changes to discard the button was inert,
          // so closing meant scrolling back up to the Edit toggle. A visible
          // control that does nothing is worse than no control.
          //
          // With edits  → discard them and stay open, so the rep can see the
          //               original values restored.
          // Without     → close the panel.
          onClick={dirty ? revert : onClose}
          disabled={saving}
          title={dirty ? 'Discard these changes' : 'Close the editor'}
          style={{
            height: 34, padding: '0 15px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', color: 'var(--text-body)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.55 : 1
          }}
        >
          {/* The label names what the click will do. "Cancel" on a pristine
              panel reads as "cancel what?" — there is nothing to cancel. */}
          {dirty ? 'Cancel' : 'Close'}
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 34, padding: '0 17px',
            border: 'none', borderRadius: 'var(--radius-md)',
            background: dirty ? 'var(--brand-primary)' : 'var(--gray-200)',
            color: dirty ? '#fff' : 'var(--text-faint)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
            cursor: dirty && !saving ? 'pointer' : 'default'
          }}
        >
          {saving && (
            <span className="ms pp-spin" style={{ fontSize: 15 }}>progress_activity</span>
          )}
          {saving ? 'Saving' : 'Update'}
        </button>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this deal?"
          message={
            'This deletes the deal in your CRM, along with its stage history in '
            + 'PipelinePulse. It cannot be undone.'
          }
          // The deal's own name, so the reader can verify the target before
          // confirming — the dialog is rendered from a row in a long list.
          preview={deal.dealTag || deal.opportunityName || null}
          confirmLabel="Delete deal"
          tone="danger"
          busy={saving}
          error={error}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

// ── Layout helpers ────────────────────────────────────────────────────────
//
// A labelled band with a rule, matching GHL's "Opportunity details" /
// "Contact details" split so a rep moving between the two apps reads the same
// grouping.
// The people on this deal: who is primary, who else is linked, and a picker
// to add someone.
//
// WHY IT LIVES IN THE EDIT PANEL. The panel already edited the primary
// contact's email, phone and business — but gave no way to see WHO the deal's
// contacts are, let alone change them. A rep editing "Contact details —
// prasad" had no indication that two other people were on the deal, and no
// route to add or remove one without opening the deal hub.
//
// WRITES GO STRAIGHT TO GHL, not into the panel's dirty-state. Adding or
// removing a contact is an association change — a different object and a
// different endpoint from the opportunity patch this form builds — and
// batching it behind Update would mean a half-saved deal if the patch failed
// after the link succeeded. So each action fires immediately and the parent
// refetches, which is also how the deal hub's rail behaves.
//
// The cap is the same 11 the deal hub enforces: a primary plus ten others.
const MAX_PEOPLE = 11

function PeopleEditor({ dealId, people = [], onChanged, disabled }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  // Unlinking is not reversible from here — re-adding creates a fresh GHL
  // relation — and Remove sits next to "Make primary", so a misfire is easy.
  const [confirming, setConfirming] = useState(null)

  const alreadyOn = useMemo(
    () => (people || []).map((p) => p.id).filter(Boolean),
    [people]
  )
  const full = people.length >= MAX_PEOPLE

  const flash = (msg) => {
    setError(msg)
    window.setTimeout(() => setError(null), 4000)
  }

  const add = async (contactId) => {
    if (!contactId || busy) return
    if (full) { flash(`A deal can hold ${MAX_PEOPLE} people — remove someone first`); return }
    setBusy('add')
    try {
      await dealsAPI.addContact(dealId, contactId)
      setAdding(false)
      onChanged && onChanged()
    } catch (err) {
      flash(err.message || 'Could not add that person')
    } finally {
      setBusy(null)
    }
  }

  const makePrimary = async (p) => {
    if (!p?.id || p.primary || busy) return
    setBusy(p.id)
    try {
      await dealsAPI.setPrimaryContact(dealId, p.id)
      onChanged && onChanged()
    } catch (err) {
      flash(err.message || 'Could not change the primary contact')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (p) => {
    // The link id, not the contact id. A synthesised primary row has none —
    // its link does not exist in opportunity_contacts, so there is nothing to
    // delete and the button is hidden for it.
    if (!p.relationId || busy) return
    setBusy(p.id)
    setError(null)
    try {
      await dealsAPI.removeContact(dealId, p.relationId)
      setConfirming(null)
      onChanged && onChanged()
    } catch (err) {
      // Rendered inside the dialog, which stays open so the reason is
      // readable and the action retryable.
      setError(err.message || 'Could not remove that person')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Group title={`People — ${people.length} of ${MAX_PEOPLE}`}>
      <div style={{ display: 'grid', gap: 6 }}>
        {people.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: p.primary ? 'var(--tint-pine)' : 'var(--surface-card)'
            }}
          >
            <span className="ms" style={{ fontSize: 16, color: 'var(--text-faint)', flex: 'none' }}>
              person
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {nameFor(p)}
              </span>
              {(p.email || p.phone) && (
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}
                >
                  {p.email || p.phone}
                </span>
              )}
            </span>

            {/* PRIMARY: a badge on the one that is, a button on the others.
                contactId is @HideApiProperty on GHL's PUT /opportunities/:id
                — undocumented, but the service applies it and validates the
                contact first. It goes through its own endpoint rather than
                this form's Update: it is an immediate write, and batching it
                behind a patch that might fail would leave the deal pointing
                at a contact the rep did not confirm. */}
            {p.primary ? (
              <span
                title="The deal is filed against this contact"
                style={{
                  flex: 'none',
                  padding: '1px 8px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-default)',
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: 'var(--accent-pine-text)'
                }}
              >
                Primary
              </span>
            ) : (
              <button
                type="button"
                onClick={() => makePrimary(p)}
                disabled={disabled || !!busy}
                title={`Make ${nameFor(p)} the primary contact`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  flex: 'none',
                  height: 24, padding: '0 8px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-pill)',
                  background: '#fff',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: 'var(--text-body)',
                  cursor: busy ? 'progress' : 'pointer'
                }}
              >
                <span className="ms" style={{ fontSize: 13 }}>
                  {busy === p.id ? 'progress_activity' : 'star'}
                </span>
                Make primary
              </button>
            )}

            {/* Removing the LAST contact would leave a deal GHL cannot file
                notes or tasks against, so one must always remain. */}
            {p.relationId && people.length > 1 && (
              <button
                type="button"
                onClick={() => { setError(null); setConfirming(p) }}
                disabled={disabled || !!busy}
                title={`Remove ${nameFor(p)} from this deal`}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flex: 'none', width: 26, height: 26, padding: 0,
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  background: '#fff',
                  color: 'var(--status-stuck-text)',
                  cursor: busy ? 'progress' : 'pointer'
                }}
              >
                <span className="ms" style={{ fontSize: 15 }}>
                  {busy === p.id ? 'progress_activity' : 'person_remove'}
                </span>
              </button>
            )}
          </div>
        ))}

        {adding ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>
              <ContactPicker
                value={null}
                onChange={add}
                seed={[]}
                // Nobody already on the deal, so a duplicate cannot be picked.
                exclude={alreadyOn}
                // A first page before typing — see ContactPicker.
                showInitial
                disabled={disabled || !!busy}
                autoFocus
              />
            </span>
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={!!busy}
              style={{
                height: 30, padding: '0 11px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                color: 'var(--text-body)', cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={disabled || full || !dealId}
            title={
              full ? `This deal already has ${MAX_PEOPLE} people, the maximum`
                : 'Add someone to this deal'
            }
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              alignSelf: 'start',
              height: 30, padding: '0 12px 0 10px',
              border: '1px dashed var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-card)',
              color: full ? 'var(--text-faint)' : 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 500,
              cursor: (full || disabled) ? 'not-allowed' : 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>person_add</span>
            {full ? `${MAX_PEOPLE} people — limit reached` : 'Add someone'}
          </button>
        )}

        {/* Only when no dialog is open — a removal failure shows inside the
            confirm, and both at once reads as two separate errors. */}
        {error && !confirming && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)' }}>
            {error}
          </span>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title="Remove from this deal?"
          message={
            `${nameFor(confirming)} will no longer be linked to this deal. `
            + 'Their contact record and its history are not deleted.'
          }
          preview={[nameFor(confirming), confirming.email || confirming.phone]
            .filter(Boolean).join(' · ')}
          confirmLabel="Remove"
          busy={busy === confirming.id}
          error={error}
          onConfirm={() => remove(confirming)}
          onCancel={() => { setConfirming(null); setError(null) }}
        />
      )}
    </Group>
  )
}

function Group({ title, children }) {
  return (
    <section style={{ marginBottom: 'var(--space-4)' }}>
      <h4
        style={{
          margin: '0 0 var(--space-2)',
          paddingBottom: 6,
          borderBottom: '1px solid var(--border-default)',
          fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
        }}
      >
        {title}
      </h4>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>{children}</div>
    </section>
  )
}

// Two columns that collapse to one on a narrow iframe. The Deal Hub renders in
// a GHL panel whose width the host controls, so a fixed two-up grid would
// overflow rather than reflow.
function Row({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: 'var(--space-3)'
      }}
    >
      {children}
    </div>
  )
}

function Field({ label, children, required = false, span = 1 }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span === 2 ? '1 / -1' : undefined }}>
      <span
        style={{
          display: 'block', marginBottom: 5,
          fontSize: 'var(--text-xs)', fontWeight: 600,
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--status-stuck)', marginLeft: 3 }} aria-hidden="true">*</span>
        )}
      </span>
      {children}
    </div>
  )
}
