import { Select } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import { contactsAPI } from '../../api/contacts'
import CustomFieldSections from '../shared/CustomFieldSections'
import {
  Panel, StateMessage, SkeletonStyles, Bar, formatDate, initialsFor, nameFor
} from '../shared/ListChrome'
import TagSelect from '../shared/TagSelect'
import { htmlToText } from '../../utils/sanitiseHtml'
import EmailBody from '../dealhub/EmailBody'
import MessageDealPill from '../dealhub/MessageDealPill'

// Contact record — everything about one person, in four panels:
//
//   Header      identity + how to reach them
//   Details     editable fields, saved on blur
//   Do not disturb   per-channel switches
//   Deals       which opportunities they're on
//   All messages     every message, with the deal it's filed to
//
// The last panel is the useful one: showing all messages together is what
// makes a wrongly-filed message visible, because it's the row whose deal tag
// looks wrong beside its content.
// GHL's echo uses its own camelCase field names; the UI uses ours. Map only the
// keys we display — an unmapped key would quietly leave a stale value on screen.// GHL's field name -> the label the user sees on that input.
function labelFor(field) {
  const map = {
    firstName: 'First name', lastName: 'Last name', email: 'Email',
    phone: 'Phone', address1: 'Address', city: 'City', state: 'State',
    postalCode: 'Postal code', website: 'Website', timezone: 'Timezone',
    country: 'Country', dateOfBirth: 'Date of birth', tags: 'Tags'
  }
  return map[field] || field
}

function fromGhl(c) {
  if (!c) return null
  const out = {}
  const map = {
    firstName: 'firstName', lastName: 'lastName', email: 'email', phone: 'phone',
    address1: 'address', city: 'city', state: 'state', postalCode: 'postalCode',
    website: 'website', timezone: 'timezone', country: 'country'
  }
  for (const [from, to] of Object.entries(map)) {
    if (c[from] !== undefined) out[to] = c[from]
  }
  return Object.keys(out).length ? out : null
}

export default function ContactDetail({ contactId, onBack, onOpenDeal }) {
  const [contact, setContact] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setContact(null)
    setError(null)
    contactsAPI.get(contactId)
      .then((c) => alive && setContact(c))
      .catch((err) => alive && setError(err.message || 'Failed to load contact'))
    return () => { alive = false }
  }, [contactId])

  if (error) {
    return (
      <Shell onBack={onBack}>
        <div
          style={{
            padding: 16, borderLeft: '3px solid var(--status-stuck)',
            background: 'var(--tint-rose)', color: 'var(--status-stuck)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-md)'
          }}
        >
          {error}
        </div>
      </Shell>
    )
  }

  if (!contact) {
    return (
      <Shell onBack={onBack}>
        <SkeletonStyles />
        {[120, 220, 260, 140].map((h, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: '#fff', padding: 16, display: 'grid', gap: 10
            }}
          >
            <Bar w={i % 2 ? '32%' : '46%'} h={15} />
            <Bar w="100%" h={h / 3} r="var(--radius-md)" />
          </div>
        ))}
      </Shell>
    )
  }

  return (
    <Shell onBack={onBack}>
      <Header contact={contact} />
      <Details
        contact={contact}
        onSaved={(patch) => setContact((c) => ({ ...c, ...patch }))}
      />
      {/* Custom fields, in GHL's own folders. Above DND because they are
          content a rep reads and edits, where DND is a setting. */}
      <CustomFields
        contact={contact}
        onSaved={(groups) => setContact((c) => ({ ...c, customFieldGroups: groups }))}
      />
      <DoNotDisturb
        contact={contact}
        onChange={(dnd) => setContact((c) => ({ ...c, dnd }))}
      />
      <Deals deals={contact.deals} onOpenDeal={onOpenDeal} />
      <AllMessages
        contactId={contactId}
        deals={contact.deals || []}
        onOpenDeal={onOpenDeal}
      />
    </Shell>
  )
}

function Shell({ children, onBack }) {
  return (
    <div
      style={{
        maxWidth: 1000, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: 'var(--space-1) 20px var(--space-7)',
        display: 'grid', gap: 14
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          style={{
            justifySelf: 'start',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: 'none', background: 'none', padding: 'var(--space-1) 0',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
            color: 'var(--text-link)'
          }}
        >
          <span className="ms" style={{ fontSize: 17 }}>arrow_back</span>
          All contacts
        </button>
      )}
      {children}
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────

function Header({ contact }) {
  const accent = `var(--accent-${contact.accent || 'sky'})`
  const tint = `var(--tint-${contact.accent || 'sky'})`
  const name = nameFor(contact)

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: accent,
        ['--panel-tint']: tint,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        padding: 'var(--space-4) 18px',
        display: 'grid', gap: 'var(--space-3)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 46, height: 46, flex: 'none',
            borderRadius: '50%',
            background: tint, color: accent,
            fontSize: 'var(--text-lg)', fontWeight: 600
          }}
        >
          {initialsFor(contact.firstName, contact.lastName, name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--text-heading)' }}>
              {name}
            </h1>
            <span
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase',
                padding: '3px 9px', borderRadius: 'var(--radius-sm)',
                background: 'var(--gray-100)', color: 'var(--text-muted)'
              }}
            >
              Contact record
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
            {[contact.contactType, contact.business].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px 22px',
          fontSize: 'var(--text-md)', color: 'var(--text-body)'
        }}
      >
        {contact.email && <Fact icon="mail" href={`mailto:${contact.email}`}>{contact.email}</Fact>}
        {contact.phone && <Fact icon="call" href={`tel:${contact.phone}`}>{contact.phone}</Fact>}
        {contact.address && <Fact icon="location_on">{contact.address}</Fact>}
        {contact.timezone && <Fact icon="schedule">{contact.timezone}</Fact>}
      </div>

      <TagStrip contactId={contact.id} tags={contact.tags || []} />
    </section>
  )
}

// Tags on the contact record. Editable through the dedicated add/remove
// endpoints — the field-level save on this page goes through the contact update
// endpoint, which REPLACES the whole tag array and is therefore refused for
// tags (see the server's contactPatch.js). Hence a separate control rather than
// another input in the form.
function TagStrip({ contactId, tags }) {
  const [current, setCurrent] = useState(tags)

  // The select renders the pills AND edits them, so the hand-rolled pill list
  // and the "Edit tags" button that opened a modal are both gone — three
  // controls for one field became one.
  return (
    <TagSelect
      contactId={contactId}
      tags={current}
      onChange={setCurrent}
    />
  )
}

function Fact({ icon, children, href }) {
  const inner = (
    <>
      <span className="ms" style={{ fontSize: 15, color: 'var(--text-faint)' }}>{icon}</span>
      {children}
    </>
  )
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
    color: 'inherit', textDecoration: href ? 'none' : undefined
  }
  return href ? <a href={href} style={style}>{inner}</a> : <span style={style}>{inner}</span>
}

// ── Details (editable) ────────────────────────────────────────────────

const FIELDS = [
  ['firstName', 'First name', 'text'],
  ['lastName', 'Last name', 'text'],
  ['business', 'Business', 'text'],
  ['address', 'Address', 'text'],
  ['email', 'Primary email', 'email'],
  ['phone', 'Primary phone', 'tel']
]

// GHL's own two values, and there are only two — its contact panel offers
// Lead and Customer and nothing else.
//
// This list previously read ['Homeowner', 'Architect', 'Builder', 'Trade
// account', 'Developer'], which is not a GHL concept at all: those are this
// client's CLIENT TYPE custom field. The control was disabled, so the wrong
// list never surfaced.
//
// Stored lowercase, shown capitalised.
const CONTACT_TYPES = [
  { value: 'lead', label: 'Lead' },
  { value: 'customer', label: 'Customer' }
]

function Details({ contact, onSaved }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(FIELDS.map(([k]) => [k, contact[k] || '']))
  )
  const [type, setType] = useState(contact.contactType || '')
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  // Which field GHL rejected, so the message can sit beside the box rather
  // than as a banner that doesn't say what's wrong.
  const [errorField, setErrorField] = useState(null)
  const timer = useRef(null)

  // Save on blur rather than per keystroke: a PATCH per character is a lot of
  // requests for no benefit, and a half-typed email saved mid-word then shown
  // "everywhere this contact appears" reads as data corruption.
  const save = async (patch) => {
    setState('saving')
    setError(null)
    setErrorField(null)
    try {
      const res = await contactsAPI.update(contact.id, patch)
      // Prefer what GHL echoed back over what we sent. GHL normalises some
      // fields on write — "+1 888-888-8888" comes back "+18888888888" — so
      // applying our own patch would show the pre-normalised value until the
      // next refresh, and the field would appear to have saved wrongly.
      onSaved(fromGhl(res?.contact) || patch)
      setState('saved')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      // The API names the offending field, so mark it rather than showing a
      // banner that doesn't say which box is wrong.
      setError(err?.response?.data?.error || err.message || 'Could not save')
      setErrorField(err?.response?.data?.field || null)
      setState('error')
    }
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  // Which fields differ from what's saved. Compared against `contact`, the last
  // value the server confirmed — not against the initial draft, so a field
  // edited and then typed back to its original stops counting as dirty.
  const isDirty = (key) => {
    const current = key === 'contactType' ? type : draft[key]
    return (contact[key] || '') !== (current || '')
  }

  // contactType is deliberately NOT included: it's a GHL custom field, not a
  // property of the contact object, so the update endpoint drops it. Including
  // it here would let someone change the dropdown, press Save, and see nothing
  // happen.
  const dirtyKeys = FIELDS.map(([k]) => k).filter(isDirty)

  // One request for every change, not one per field. Each PATCH is a round trip
  // to GHL plus a webhook back, so saving five fields separately would fire
  // five of each and the last webhook would win in an unpredictable order.
  const saveAll = () => {
    if (!dirtyKeys.length) return

    // CHECKED BEFORE SENDING.
    //
    // The server rejects a malformed address (contactPatch.js) and the panel
    // reports it — but only after a round trip, and the reader has usually
    // moved on by then. The same rule applied here turns that into instant
    // feedback on the field they are still looking at.
    //
    // Deliberately the SERVER'S regex, character for character. A stricter
    // one here would refuse addresses the API accepts; a looser one would let
    // the round trip happen anyway and change nothing.
    if (dirtyKeys.includes('email')) {
      const email = (draft.email || '').trim()
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('That email address is not valid')
        setErrorField('email')
        setState('error')
        return
      }
    }

    const patch = {}
    for (const k of dirtyKeys) {
      patch[k] = k === 'contactType' ? type : draft[k]
    }
    save(patch)
  }

  const revert = () => {
    setDraft(Object.fromEntries(FIELDS.map(([k]) => [k, contact[k] || ''])))
    setType(contact.contactType || '')
    setError(null)
    setErrorField(null)
    setState('idle')
  }

  return (
    <Panel
      icon="badge"
      title="Details"
      accent="sky"
      meta={
        state === 'saving' ? 'Saving…'
          : state === 'saved' ? 'Saved'
          // Name the field GHL rejected. "That email address is not valid" is
          // clear; the same message with no field named on a six-input form is
          // not.
          : state === 'error'
            ? (errorField ? `${labelFor(errorField)}: ${error}` : error)
          : 'Editable'
      }
      // Red and announced, not the same grey as "Editable" — see Panel.
      metaTone={state === 'error' ? 'error' : 'muted'}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-3)', padding: '14px var(--space-4)'
        }}
      >
        {FIELDS.map(([key, label, type_]) => (
          <label key={key} style={{ display: 'grid', gap: 5, minWidth: 0 }}>
            <span
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: 'var(--text-muted)'
              }}
            >
              {label}
            </span>
            <input
              type={type_}
              value={draft[key]}
              onChange={(e) => {
                setDraft((d) => ({ ...d, [key]: e.target.value }))
                // Typing in the field that was rejected clears the complaint.
                // Leaving it up while the reader fixes the value makes a
                // corrected field look broken, and the red highlight would
                // stay on a now-valid address.
                if (errorField === key) {
                  setError(null); setErrorField(null); setState('idle')
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveAll() }
                if (e.key === 'Escape') { e.preventDefault(); revert() }
              }}
              placeholder={`Add ${label.toLowerCase()}`}
              // Announced with the header's message, and marked for a screen
              // reader as the field that failed.
              aria-invalid={errorField === key || undefined}
              style={{
                ...inputStyle,
                // THE REJECTED FIELD WINS OVER "DIRTY".
                //
                // Dirty is pine — green — which is right for "this will be
                // sent". It is wrong the moment the save came back rejecting
                // that field: an invalid email sat highlighted GREEN, reading
                // as success, while the only sign of failure was grey text in
                // the far corner of the header.
                borderColor: errorField === key
                  ? 'var(--status-stuck)'
                  : isDirty(key) ? 'var(--brand-primary)' : undefined,
                background: errorField === key
                  ? 'var(--tint-rose)'
                  : isDirty(key) ? 'var(--tint-pine)' : undefined
              }}
            />
          </label>
        ))}

        <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            Contact type
          </span>
          {/* EDITABLE. It was disabled on the belief that contactType is a
              custom field; it is not. GHL calls it `type` on the contact
              object — @HideApiProperty on PUT, so absent from the docs, but
              applied. Same pattern as the opportunity's contactId. */}
          <Select
            title="Lead or Customer, as in your CRM"
            // Lower-cased so a stored "Lead" still matches the 'lead' option
            // and renders as the label rather than as an unknown value.
            value={type ? String(type).toLowerCase() : undefined}
            onChange={(v) => {
              // No immediate commit — it joins the same Save as the text
              // fields, so one edit session is one request.
              //
              // No allowClear: GHL has no "no type" state, and offering a
              // clear that the server then refuses would be a control that
              // fails on use.
              setType(v ?? '')
            }}
            placeholder="Not set"
            style={{ width: '100%' }}
            popupClassName="pp-menu"
            options={[
              // A value GHL sent that is not one of the two stays selectable
              // rather than being silently rewritten — but it cannot be
              // chosen, and saving one is refused by contactPatch.
              ...(type && !CONTACT_TYPES.some((o) => o.value === String(type).toLowerCase())
                ? [{ value: type, label: type }]
                : []),
              ...CONTACT_TYPES
            ]}
          />
        </label>
      </div>

      {(contact.secondaryEmails?.length > 0 || contact.secondaryPhones?.length > 0) && (
        <div
          style={{
            padding: '0 var(--space-4) var(--space-3)',
            display: 'flex', flexWrap: 'wrap', gap: '6px 18px',
            fontSize: 'var(--text-base)', color: 'var(--text-muted)'
          }}
        >
          {contact.secondaryEmails?.map((e) => (
            <span key={e}>Also: {e}</span>
          ))}
          {contact.secondaryPhones?.map((p) => (
            <span key={p}>Also: {p}</span>
          ))}
        </div>
      )}

      <p
        style={{
          margin: 0, padding: '10px var(--space-4)',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--gray-25)',
          fontSize: 'var(--text-base)', color: 'var(--text-muted)'
        }}
      >
        {dirtyKeys.length > 0
          ? `${dirtyKeys.length} unsaved ${dirtyKeys.length === 1 ? 'change' : 'changes'} — press Enter or Save to send them to your CRM.`
          : 'Saved changes are written to your CRM, which sends them back to every view here.'}
      </p>

      {/* An explicit Save. Blur-committing meant a half-typed value could reach
          GHL the moment focus moved, and there was no way to abandon an edit —
          nor any sign that anything was unsaved. */}
      {dirtyKeys.length > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '11px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--tint-pine)'
          }}
        >
          <button
            onClick={saveAll}
            disabled={state === 'saving'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              cursor: state === 'saving' ? 'wait' : 'pointer',
              height: 34, padding: '0 16px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--brand-primary)', color: '#fff',
              boxShadow: '0 2px 6px rgba(13, 91, 64, 0.32)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-md)', fontWeight: 600
            }}
          >
            <span className="ms" style={{ fontSize: 17 }}>check</span>
            {state === 'saving' ? 'Saving…' : `Save ${dirtyKeys.length}`}
          </button>

          <button
            onClick={revert}
            disabled={state === 'saving'}
            style={{
              cursor: 'pointer',
              height: 34, padding: '0 14px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: '#fff',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-md)', color: 'var(--text-body)'
            }}
          >
            Cancel
          </button>

          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Enter saves · Esc cancels
          </span>
        </div>
      )}
    </Panel>
  )
}

const inputStyle = {
  width: '100%', height: 36, boxSizing: 'border-box',
  padding: '0 11px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  background: '#fff',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-heading)'
}

// ── Custom fields ─────────────────────────────────────────────────────
//
// One collapsible section per GHL folder. The server sends them already
// grouped, typed and valued (customFieldGroups in routes/contacts.js), so
// this is a form over that shape rather than a second place that decides what
// a custom field is.
//
// SAVES SEPARATELY from the Details panel. Custom fields go to GHL as
// `customFields: [{ id, field_value }]` — a different part of the body from
// firstName/email, and forty of them behind one Save would make an
// unrelated failure look like a failed name change.
function CustomFields({ contact, onSaved }) {
  const groups = contact.customFieldGroups || []
  const [draft, setDraft] = useState({})
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)

  const dirtyIds = Object.keys(draft)

  const setField = (id, value) => {
    setDraft((d) => ({ ...d, [id]: value }))
    if (state === 'error') { setState('idle'); setError(null) }
  }

  const save = async () => {
    if (!dirtyIds.length) return
    setState('saving')
    setError(null)
    try {
      // Only what changed. field_value (snake case) is what GHL wants — the
      // server accepts either spelling and normalises, but sending the right
      // one keeps the wire format obvious at the call site.
      const customFields = dirtyIds.map((id) => ({
        id,
        field_value: normaliseOut(draft[id])
      }))
      const res = await contactsAPI.update(contact.id, { customFields })
      // Prefer the server's echo: it re-reads the definitions and returns the
      // groups with stored values, so a value GHL normalised shows correctly
      // rather than as we typed it.
      if (res?.customFieldGroups) onSaved(res.customFieldGroups)
      setDraft({})
      setState('saved')
      window.setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      setError(err.message || 'Could not save those fields')
      setState('error')
    }
  }

  const revert = () => { setDraft({}); setState('idle'); setError(null) }

  if (!groups.length) {
    // Not an error, and not worth a panel: a location with no custom fields
    // for contacts is an ordinary setup.
    return null
  }

  return (
    <Panel
      icon="tune"
      title="Custom fields"
      accent="sky"
      meta={
        state === 'saving' ? 'Saving…'
          : state === 'saved' ? 'Saved'
          : state === 'error' ? error
          : dirtyIds.length
            ? `${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? '' : 's'}`
            : `${groups.length} ${groups.length === 1 ? 'folder' : 'folders'}`
      }
      metaTone={state === 'error' ? 'error' : 'muted'}
    >
      <div style={{ padding: '12px var(--space-4)' }}>
        <CustomFieldSections
          groups={groups}
          draft={draft}
          onChange={setField}
          // Uploads go straight to GHL rather than waiting for Save — a file
          // is not a draft value, and batching would risk discarding an
          // upload that already succeeded because a text field was rejected.
          onUpload={async (fieldKey, files) => {
            const res = await contactsAPI.uploadCustomFieldFiles(
              contact.id, fieldKey, files
            )
            return res.files || []
          }}
          disabled={state === 'saving'}
        />
      </div>

      {/* Only once something has changed. A permanent Save bar on a panel
          that is usually just read is noise. */}
      {dirtyIds.length > 0 && (
        <div className="pp-cf-foot">
          <span className="pp-cf-foot-note">
            {dirtyIds.length} field{dirtyIds.length === 1 ? '' : 's'} changed
          </span>
          <button
            type="button"
            onClick={revert}
            disabled={state === 'saving'}
            className="pp-cf-btn"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            disabled={state === 'saving'}
            className="pp-cf-btn pp-cf-btn-go"
          >
            {state === 'saving' ? 'Saving…' : 'Save fields'}
          </button>
        </div>
      )}
    </Panel>
  )
}

// What goes on the wire for one field.
//
// A multi-select holds an array; GHL stores those as a comma-joined string on
// the contact, and sending an array where it wants a scalar is one of the
// shapes it accepts and then ignores. An empty value is '' rather than a
// dropped key — omitting it leaves the old value in place.
function normaliseOut(v) {
  if (v == null) return ''
  if (Array.isArray(v)) return v.join(',')
  return v
}

// ── Do not disturb ────────────────────────────────────────────────────

// Two hints per row: what is true now, not one description that only makes
// sense in the muted state. "No outbound email" beside a switch reading ON
// described a state the contact was not in.
const DND_ROWS = [
  ['all', 'All channels', 'block',
    'Reachable on every channel', 'Muted everywhere — master switch'],
  ['email', 'Email', 'mail',
    'We can email them', 'No outbound email'],
  ['sms', 'Text messages', 'sms',
    'We can text them', 'No SMS, WhatsApp or iMessage'],
  ['call', 'Calls and voicemail', 'call',
    'We can call them', 'No outbound dials or voicemail drops'],
  ['inbound', 'Inbound calls and SMS', 'call_received',
    'Their calls and texts reach us', 'Their inbound calls and texts are silenced']
]

function DoNotDisturb({ contact, onChange }) {
  const [pending, setPending] = useState(null)
  const dnd = contact.dnd || {}

  const isBlocked = (key) => {
    if (key === 'all') return dnd.all === true
    if (key === 'inbound') return dnd.inbound === true
    // Master switch wins: showing a channel as "on" while everything is muted
    // would be a lie.
    return dnd.all === true || dnd.channels?.[key] === true
  }

  const toggle = async (key) => {
    const next = !isBlocked(key)
    setPending(key)
    try {
      const res = await contactsAPI.setDnd(contact.id, key, next)
      onChange(res.dnd)
    } catch (err) {
      // Nothing changed locally, so there's nothing to roll back.
    } finally {
      setPending(null)
    }
  }

  const blockedCount = dnd.blockedCount || 0
  // Says what is BLOCKED, not what is on. Under a heading reading "Do not
  // disturb", "All channels on" was read as "DND is on for everything" —
  // the exact opposite of what it meant.
  const meta = dnd.all
    ? 'Everything muted'
    : blockedCount > 0
    ? `${blockedCount} channel${blockedCount === 1 ? '' : 's'} muted`
    : 'Nothing muted'

  return (
    <Panel
      icon="do_not_disturb_on"
      title="Do not disturb"
      // Rose only when something IS muted. A permanently red panel over a
      // contact who is fully reachable reads as a warning about nothing —
      // and reinforced the misreading that DND was switched on.
      accent={(dnd.all || blockedCount > 0 || dnd.inbound) ? 'rose' : 'gray'}
      meta={meta}
    >
      <p
        style={{
          margin: 0, padding: '10px var(--space-4)',
          borderTop: '1px solid var(--border-default)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--gray-50)',
          fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-body)'
        }}
      >
        {/* Says which direction the switch runs, because the panel's own
            title works the other way round. */}
        {/* Says which way the switch runs, in the same sense as GHL's own
            checkboxes: turn it ON to stop contacting them there. */}
        Turn a channel <strong>on</strong> to stop contacting them there —
        the same as ticking its box in your CRM. A muted channel goes quiet
        everywhere this contact appears: deal cards flag it, and the AI will
        not draft a message on it.
      </p>

      {DND_ROWS.map(([key, label, icon, okHint, mutedHint], i) => {
        const blocked = isBlocked(key)
        // A per-channel row is not independently toggleable while the master
        // switch is on — it's already muted, so offering the control would
        // imply an effect it can't have.
        const forced = key !== 'all' && key !== 'inbound' && dnd.all === true
        return (
          <div
            key={key}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              borderBottom: i === DND_ROWS.length - 1
                ? 'none'
                : '1px solid var(--border-default)',
              opacity: forced ? 0.6 : 1
            }}
          >
            <span
              className="ms"
              style={{ fontSize: 'var(--text-xl)', color: blocked ? 'var(--status-stuck)' : 'var(--text-faint)' }}
            >
              {icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block', fontSize: 'var(--text-lg)', fontWeight: 600,
                  color: 'var(--text-heading)'
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
                {blocked ? mutedHint : okHint}
              </span>
            </span>
            <Switch
              // MATCHES GHL. Their panel has a checkbox per channel that you
              // TICK to turn DND on. Ours was the inverse — on = reachable —
              // which was internally consistent but meant the same channel
              // read ON here and unchecked there. Two systems, opposite
              // states, same word.
              on={blocked}
              disabled={forced || pending === key}
              busy={pending === key}
              onToggle={() => toggle(key)}
              label={label}
            />
          </div>
        )
      })}
    </Panel>
  )
}

// On = reachable, Off = blocked. Worth stating, because the underlying data is
// inverted (GHL's "DND active" means blocked) and a switch that reads "on" for
// "muted" would be a trap.
function Switch({ on, disabled, busy, onToggle, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', flex: 'none' }}>
      <span
        style={{
          fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: 'var(--tracking-label)',
          // Rose when muted, green when reachable. The switch reads ON for
          // muted now, so keying the colour to `on` would paint a blocked
          // channel green.
          color: on ? 'var(--status-stuck)' : 'var(--green-600)'
        }}
      >
        {/* The switch is now DND itself, so ON means muted — the same sense
            as GHL's checkbox. The words still say what is true of the
            CONTACT rather than relying on the reader to know which way the
            control runs. */}
        {busy ? '···' : on ? 'MUTED' : 'OK'}
      </span>
      <button
        role="switch"
        aria-checked={on}
        // "Email — muted", not "Email — on". A screen-reader user gets no
        // colour and no chance to infer which way the control runs.
        aria-label={`${label} — ${on ? 'muted' : 'reachable'}`}
        disabled={disabled}
        onClick={onToggle}
        style={{
          position: 'relative',
          width: 42, height: 24, flex: 'none',
          border: 'none', borderRadius: 'var(--radius-pill)',
          // Rose when muted. Green for a muted channel would be the same
          // inversion in colour that the labels just lost.
          background: on ? 'var(--status-stuck)' : 'var(--gray-300)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s ease-out'
        }}
      >
        <span
          style={{
            position: 'absolute', top: 3, left: on ? 21 : 3,
            width: 18, height: 18, borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(31,36,48,.3)',
            transition: 'left 0.15s ease-out'
          }}
        />
      </button>
    </span>
  )
}

// ── Deals ─────────────────────────────────────────────────────────────

function Deals({ deals = [], onOpenDeal }) {
  return (
    <Panel
      icon="sell"
      title="Deals"
      accent="pine"
      meta={`${deals.length} ${deals.length === 1 ? 'deal' : 'deals'}`}
    >
      <StateMessage
        empty={deals.length === 0}
        emptyText="This contact isn't on any deals yet."
      />
      {deals.map((d, i) => (
        <div
          key={d.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: i === deals.length - 1 ? 'none' : '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 17, color: 'var(--accent-pine)' }}>sell</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block', fontSize: 'var(--text-lg)', fontWeight: 600,
                color: 'var(--text-heading)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              {d.name || '(unnamed deal)'}
            </span>
            <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
              {[d.stage, d.pipeline].filter(Boolean).join(' · ')}
            </span>
          </span>
          {d.value && (
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)',
                color: 'var(--text-heading)', flex: 'none'
              }}
            >
              {d.value}
            </span>
          )}
          <button
            onClick={() => onOpenDeal && onOpenDeal(d.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
              height: 32, padding: '0 13px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: '#fff', color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', cursor: 'pointer'
            }}
          >
            Open deal
            <span className="ms" style={{ fontSize: 15 }}>arrow_forward</span>
          </button>
        </div>
      ))}
    </Panel>
  )
}

// ── All messages ──────────────────────────────────────────────────────

// Every message for this contact, whatever deal it is linked to.
//
// This is the view James asked for on 8 Sep: the deal timeline shows what
// belongs to a deal, and this shows EVERYTHING so a manager can find the
// messages that were never attributed and link them by hand.
//
// Cards match the deal timeline's on purpose. A rep moving between the two
// should not have to re-learn how a message reads.
//
// Fetched here rather than with the contact: the list can be long, and a rep
// who never opens this panel should not pay for it on every contact load.
function AllMessages({ contactId, deals = [], onOpenDeal }) {
  const [messages, setMessages] = React.useState(null)
  const [error, setError] = React.useState(null)
  const [unlinkedOnly, setUnlinkedOnly] = React.useState(false)
  const [picked, setPicked] = React.useState(() => new Set())
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState(null)
  const [target, setTarget] = React.useState('')

  const load = React.useCallback(() => {
    let alive = true
    setError(null)
    contactsAPI.messages(contactId, { unlinkedOnly })
      .then((r) => { if (alive) setMessages(r.messages || []) })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.error || 'Could not load the messages')
      })
    return () => { alive = false }
  }, [contactId, unlinkedOnly])

  React.useEffect(load, [load])

  const rows = messages || []
  const unlinked = rows.filter((m) => !m.deal).length

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  async function assign() {
    if (picked.size === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const r = await contactsAPI.setMessagesMapping(
        contactId, [...picked], target || null
      )
      // `rejected` names ids the server would not move — reported rather than
      // swallowed, or "12 moved" out of 20 looks like a silent failure.
      if (r?.rejected?.length) {
        setSaveError(`${r.rejected.length} could not be moved — they are not on this contact`)
      }
      setPicked(new Set())
      load()
    } catch (e) {
      setSaveError(e?.response?.data?.error || e?.message || 'That did not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel
      icon="forum"
      title="All messages"
      accent="gold"
      meta={
        messages === null ? '—'
          : `${rows.length}${unlinked > 0 ? ` · ${unlinked} unlinked` : ''}`
      }
    >
      <p style={{
        margin: 0, padding: '10px var(--space-4)',
        borderTop: '1px solid var(--border-default)',
        background: 'var(--gray-50)',
        fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-body)'
      }}>
        A message is linked to one deal at most. Messages sent when no deal was
        open stay here until someone links them — tick them and pick a deal
        below.
      </p>

      {/* Filter + bulk bar. Sticky so the action stays reachable on a long
          list rather than scrolling away above the selection it applies to. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        flexWrap: 'wrap',
        padding: '8px var(--space-4)',
        borderTop: '1px solid var(--border-default)',
        borderBottom: '1px solid var(--border-default)',
        background: '#fff'
      }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 'var(--text-sm)', color: 'var(--text-muted)', cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={unlinkedOnly}
            onChange={(e) => { setUnlinkedOnly(e.target.checked); setPicked(new Set()) }}
            style={{ accentColor: 'var(--brand-primary)' }}
          />
          Unlinked only
        </label>

        <span style={{ flex: 1 }} />

        {picked.size > 0 && (
          <>
            <span style={{
              fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-default)'
            }}>
              {picked.size} selected
            </span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={saving}
              style={{
                padding: '5px 8px', fontSize: 'var(--text-sm)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)', background: '#fff'
              }}
            >
              <option value="">Unlink from every deal</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.status && d.status !== 'open' ? ` (${d.status})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={assign}
              disabled={saving}
              style={{
                padding: '5px 12px', fontSize: 'var(--text-sm)', fontWeight: 600,
                border: 'none', borderRadius: 'var(--radius-md)',
                background: 'var(--brand-primary)', color: '#fff',
                cursor: saving ? 'wait' : 'pointer'
              }}
            >
              {saving ? 'Filing…' : 'Apply'}
            </button>
          </>
        )}
      </div>

      {saveError && (
        <p role="alert" style={{
          margin: 0, padding: '8px var(--space-4)',
          fontSize: 'var(--text-sm)', color: 'var(--status-stuck)',
          borderBottom: '1px solid var(--border-default)'
        }}>
          {saveError}
        </p>
      )}

      <StateMessage
        loading={messages === null && !error}
        error={error}
        empty={messages !== null && rows.length === 0}
        emptyText={unlinkedOnly ? 'Nothing unlinked — every message is on a deal.' : 'No messages synced for this contact yet.'}
      />

      {rows.map((m, i) => (
        <ContactMessageCard
          key={m.id}
          m={m}
          last={i === rows.length - 1}
          selected={picked.has(m.messageId)}
          onToggle={() => toggle(m.messageId)}
          deals={deals}
          // One message at a time, through the contact route — there is no
          // deal in scope here, so the deal-scoped endpoint does not apply.
          onFile={(messageId, opportunityId) =>
            contactsAPI.setMessagesMapping(contactId, [messageId], opportunityId)}
          onMoved={load}
        />
      ))}
    </Panel>
  )
}

// One message, styled to match the deal timeline's rows.
//
// The deal timeline is where a rep spends their day; a contact's messages
// looking materially different made the same record read as two things.
function ContactMessageCard({ m, last, selected, onToggle, deals, onFile, onMoved }) {
  const inbound = m.direction === 'inbound'
  // GHL labels the same channel several ways — 'Email', 'TYPE_EMAIL' and
  // 'EMAIL' all appear in one contact's history (visible in the screenshot
  // that prompted this). Matching only 'Email' would give the same thread
  // two different card styles on adjacent rows.
  const isEmail = /email/i.test(m.channel || '')
  const icon = m.isCall ? 'call'
    : m.channel === 'Email' ? 'mail'
      : m.channel === 'SMS' ? 'sms' : 'chat'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: 'var(--space-3) var(--space-4)',
      borderBottom: last ? 'none' : '1px solid var(--border-default)',
      background: selected ? 'var(--tint-pine)' : 'transparent'
    }}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select this ${m.channel || 'message'}`}
        style={{
          marginTop: 3, width: 16, height: 16, flex: 'none',
          accentColor: 'var(--brand-primary)', cursor: 'pointer'
        }}
      />

      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, flex: 'none', marginTop: 1,
        borderRadius: 'var(--radius-md)', background: 'var(--gray-50)'
      }}>
        <span className="ms" style={{ fontSize: 16, color: 'var(--text-muted)' }}>{icon}</span>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
          }}>
            {m.senderName || (inbound ? 'Customer' : 'Us')}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {m.channel}
          </span>
        </div>

        {/* An email gets the SAME collapsed card as the deal timeline —
            subject line, chevron, expand to the full body. The contact view
            used to flatten it to a paragraph of stripped text, so the same
            email looked like two different records depending on the page.
            EmailBody is shared rather than copied, so they cannot drift
            apart again. */}
        {isEmail ? (
          <div style={{ marginTop: 4 }}>
            <EmailBody m={m} />
          </div>
        ) : (
          <p style={{
            margin: '3px 0 0', maxWidth: 640,
            fontSize: 'var(--text-md)', lineHeight: 1.5, color: 'var(--text-body)'
          }}>
            {htmlToText(m.body || '').slice(0, 240)
              || <span style={{ color: 'var(--text-faint)' }}>(no readable text)</span>}
          </p>
        )}
      </div>

      <span style={{
        // ONE line: pill, direction, date — matching the deal timeline.
        //
        // This was a column, so the pill sat on a second row under the date
        // and read as a detached control rather than part of the row's
        // metadata.
        display: 'flex', alignItems: 'center', gap: 6,
        flex: 'none', whiteSpace: 'nowrap', flexWrap: 'nowrap',
        // Level with the first line of the message, not the middle of a
        // tall email card.
        alignSelf: 'start'
      }}>
        {/* The deal, AND the control to change it — the same pill the deal
            timeline uses, so the two pages behave identically. Read-only
            here before, which meant the only way to file one message was to
            tick it and use the bulk bar above.

            First, so the dates stay aligned down the right edge: the pill is
            the variable-width element and putting it outside would leave
            them ragged. */}
        <MessageDealPill
          message={m}
          targets={deals}
          onSave={onFile}
          onMoved={onMoved}
        />
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 600,
          letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
          color: inbound ? 'var(--accent-pine-text)' : 'var(--text-faint)'
        }}>
          {inbound ? 'Inbound' : 'Outbound'}
        </span>
        <span style={{
          fontSize: 'var(--text-sm)', color: 'var(--text-faint)',
          fontVariantNumeric: 'tabular-nums'
        }}>
          {formatDate(m.ts)}
        </span>
      </span>
    </div>
  )
}
