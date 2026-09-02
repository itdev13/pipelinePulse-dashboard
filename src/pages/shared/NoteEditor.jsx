import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Input, Select } from 'antd'
import { notesAPI } from '../../api/notes'
import ContactPicker from './ContactPicker'

// Create or edit one note. Shared by the Notes page and the Deal Hub's note
// rail so the two can't drift apart in what they accept.
//
// Notes live on the CONTACT, not the deal — every GHL note endpoint is
// /contacts/{contactId}/notes/... — so creating one needs a person chosen. On a
// deal with several people that's the rep's call, not a guess we can make.
//
// Two GHL rules this UI has to respect:
//
//   • AT MOST TWO PINNED NOTES per contact. The third is rejected. The server
//     checks first and returns a readable message, but the count is shown here
//     too so the rep isn't surprised at save time.
//
//   • COLOUR IS A HEX STRING (#FFF or #FFAA00). A named colour or rgb() is
//     rejected, so this offers a fixed palette rather than a free text box.

// GHL's own note palette.
//
// These were previously the app's saturated accent hues, which meant the same
// note showed one colour in GHL and a different one here — and a rep picking
// "yellow" in GHL saw our amber, or nothing at all if the hex didn't match one
// of ours. Note colours are pastel FILLS behind text, not accents, so the
// values are theirs rather than ours.
//
// If GHL adds a colour, add it here: an unrecognised hex still renders (see
// the swatch row below), it just isn't offered as a choice.
const COLOURS = [
  ['#FFF2B2', 'Yellow'],
  ['#FFD9B2', 'Orange'],
  ['#FFC2C2', 'Red'],
  ['#E5C2FF', 'Purple'],
  ['#C2D9FF', 'Blue'],
  ['#C2F0E0', 'Green'],
  ['#E0E4EA', 'Grey']
]

export default function NoteEditor({
  note = null,
  contacts = [],
  defaultContactId = null,
  // Seed text for a CREATE — used by Co-Pilot's "Save as note", where the
  // agent's answer is a draft the rep can edit before it's stored. Deliberately
  // separate from `note`: passing a fake note would put this in edit mode and
  // PATCH a record that doesn't exist.
  initialBody = '',
  // How many notes are already pinned on the target contact, so the pin toggle
  // can say when there's no room. Optional — omitted means don't claim.
  pinnedCount = null,
  // The deal and company this note is about — GHL associations, not note
  // fields. `deals` and `businesses` are the pickable lists; omitting a list
  // hides its picker rather than showing an empty dropdown.
  deals = [],
  businesses = [],
  // Preselected when the editor is opened from a deal, which already knows.
  defaultOpportunityId = null,
  onClose,
  onSaved
}) {
  const editing = !!note

  const [title, setTitle] = useState(note?.title || '')
  const [body, setBody] = useState(() => stripHtml(note?.body || initialBody || ''))
  const [colour, setColour] = useState(note?.color || null)
  const [pinned, setPinned] = useState(note?.pinned === true)
  // A note links to ONE deal — GHL's note→opportunity cap is 1, so attaching a
  // second replaces the first. Modelled as a single value for that reason, not
  // as a simplification.
  const [opportunityId, setOpportunityId] = useState(
    note?.opportunityId || defaultOpportunityId || null
  )
  const [businessId, setBusinessId] = useState(note?.businessId || null)

  const [contactId, setContactId] = useState(
    note?.contact?.id || defaultContactId || (contacts.length === 1 ? contacts[0].id : null)
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)

  const bodyRef = useRef(null)
  useEffect(() => {
    // Focus the body — it's the only field a note actually needs.
    const t = window.setTimeout(() => bodyRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])


  // GHL's limit. Only blocks turning pinning ON, and never for a note that's
  // already pinned — it already holds one of the two slots.
  const alreadyPinned = note?.pinned === true
  const pinRoom = pinnedCount == null
    || alreadyPinned
    || pinnedCount < 2

  const changes = useMemo(() => {
    if (!editing) return null
    const out = {}
    if (body.trim() !== stripHtml(note.body || '')) out.body = body.trim()
    if (title.trim() !== (note.title || '')) out.title = title.trim()
    if ((colour || null) !== (note.color || null)) out.color = colour || null
    if (pinned !== (note.pinned === true)) out.pinned = pinned
    return out
  }, [editing, note, body, title, colour, pinned])

  const dirty = editing ? Object.keys(changes).length > 0 : body.trim().length > 0
  const canSave = !saving && dirty
    && body.trim().length > 0
    && (editing || !!contactId)

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    setErrorField(null)
    try {
      let res
      if (editing) {
        res = await notesAPI.update(note.id, changes)
        // Relations go separately — a different GHL endpoint, and the note
        // patch rejects unknown fields. Only when they actually changed, so
        // editing the text alone stays one request.
        const oppChanged = (opportunityId || null) !== (note.opportunityId || null)
        const bizChanged = (businessId || null) !== (note.businessId || null)
        if (oppChanged || bizChanged) {
          // Detach first, then attach. Skipping the detach would leave the old
          // company attached (its cap is 1000, so it appends) — only the deal
          // link replaces itself.
          const gone = {}
          if (oppChanged && note.opportunityId) gone.opportunityId = note.opportunityId
          if (bizChanged && note.businessId) gone.businessId = note.businessId
          if (Object.keys(gone).length) await notesAPI.removeRelations(note.id, gone)

          const added = {}
          if (oppChanged && opportunityId) added.opportunityId = opportunityId
          if (bizChanged && businessId) added.businessId = businessId
          if (Object.keys(added).length) await notesAPI.setRelations(note.id, added)
        }
      } else {
        res = await notesAPI.create({
          contactId,
          body: body.trim(),
          title: title.trim() || undefined,
          color: colour || undefined,
          pinned: pinned || undefined,
          opportunityId: opportunityId || undefined,
          businessId: businessId || undefined
        })
        // The note saved but its link did not. Report it without discarding
        // the note — the server deliberately returns 201 here.
        if (res?.relationError) {
          setError(`Note saved, but couldn't link it: ${res.relationError}`)
          setSaving(false)
          return
        }
      }
      onSaved(res.note || null)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save that — try again')
      setErrorField(err.data?.field || null)
      setSaving(false)
    }
  }

  const onFormKeyDown = (e) => {
    // Cmd/Ctrl+Enter only — the body is a textarea and newlines matter in it.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        background: 'rgba(23, 33, 46, 0.45)'
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit note' : 'New note'}
        onKeyDown={onFormKeyDown}
        style={{
          width: 'min(580px, 100%)',
          borderRadius: 'var(--radius-md)',
          background: '#fff', boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '13px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--tint-gold)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-gold)' }}>
            sticky_note_2
          </span>
          <h2
            style={{
              flex: 1, margin: 0,
              fontSize: 'var(--text-xl)', fontWeight: 600,
              color: 'var(--accent-gold-text)'
            }}
          >
            {editing ? 'Edit note' : 'New note'}
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            title="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.7)',
              cursor: saving ? 'default' : 'pointer',
              color: 'var(--text-muted)'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>close</span>
          </button>
        </header>

        <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
          <Field label="Note" required error={errorField === 'body' ? error : null}>
            <Input.TextArea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What's worth recording?"
              rows={6}
              maxLength={65000}
              status={errorField === 'body' ? 'error' : undefined}
            />
          </Field>

          {/* Optional, and worth saying so: before this existed the UI derived
              a heading from the body's first line, so reps had no way to give a
              note a real title. */}
          <Field
            label="Title"
            hint="Optional — without one, the first line is used as the heading"
            error={errorField === 'title' ? error : null}
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short heading"
              maxLength={255}
              status={errorField === 'title' ? 'error' : undefined}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Field label="Colour" error={errorField === 'color' ? error : null}>
              {/* A fixed palette, not a text box: GHL only accepts #FFF or
                  #FFAA00 form, so free text would invite a rejected save. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Swatch
                  colour={null}
                  label="None"
                  active={!colour}
                  onClick={() => setColour(null)}
                />
                {COLOURS.map(([hex, name]) => (
                  <Swatch
                    key={hex}
                    colour={hex}
                    label={name}
                    active={colour === hex}
                    onClick={() => setColour(hex)}
                  />
                ))}
                {/* A colour set in GHL that isn't in the list above — one they
                    added, or an older note. Shown as a selected swatch rather
                    than silently reading as "None", which would make the next
                    save clear a colour the rep never touched. */}
                {colour && !COLOURS.some(([hex]) => hex === colour) && (
                  <Swatch colour={colour} label={`${colour} (from your CRM)`} active onClick={() => {}} />
                )}
              </div>
            </Field>

            {!editing && (
              <Field label="Contact" required error={errorField === 'contactId' ? error : null}>
                {/* Searches every contact in the sub-account, not just the ones
                    the caller happened to pass. On this page there is no deal in
                    scope, so the old Select was handed an empty list and
                    rendered DISABLED — a task could not be created here at all.
                    `seed` keeps the deal case a single click. */}
                <ContactPicker
                  value={contactId}
                  onChange={setContactId}
                  seed={contacts}
                  invalid={errorField === 'contactId'}
                />
              </Field>
            )}

            {/* Shown in BOTH create and edit mode, unlike Contact above: a
                note's contact is fixed by GHL once written, but which deal and
                company it is filed against is exactly the thing a rep corrects
                later.

                Rendered only when there is something to pick — an empty
                dropdown is worse than no dropdown. */}
            {deals.length > 0 && (
              <Field
                label="Deal"
                error={errorField === 'opportunityId' ? error : null}
                hint="One deal per note — picking another replaces it"
              >
                <Select
                  value={opportunityId || undefined}
                  onChange={(v) => setOpportunityId(v || null)}
                  disabled={saving}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Not linked to a deal"
                  options={deals.map((d) => ({
                    value: d.id,
                    label: d.dealTag || d.opportunityName || d.name || d.id
                  }))}
                  notFoundContent="No matching deal"
                  popupClassName="pp-menu"
                  style={{ width: '100%' }}
                />
              </Field>
            )}

            {businesses.length > 0 && (
              <Field label="Company" error={errorField === 'businessId' ? error : null}>
                <Select
                  value={businessId || undefined}
                  onChange={(v) => setBusinessId(v || null)}
                  disabled={saving}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Not linked to a company"
                  options={businesses.map((b) => ({
                    value: b.id,
                    label: b.name || b.id
                  }))}
                  notFoundContent="No matching company"
                  popupClassName="pp-menu"
                  style={{ width: '100%' }}
                />
              </Field>
            )}
          </div>

          {/* GHL caps pinned notes at two per contact, so the control has to
              say when there's no room rather than failing at save time. */}
          <label
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              cursor: pinRoom ? 'pointer' : 'not-allowed',
              opacity: pinRoom ? 1 : 0.6
            }}
          >
            <input
              type="checkbox"
              checked={pinned}
              disabled={!pinRoom && !pinned}
              onChange={(e) => setPinned(e.target.checked)}
              style={{
                marginTop: 2, width: 16, height: 16, flex: 'none',
                accentColor: 'var(--brand-primary)'
              }}
            />
            <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
              Pin to the top of this contact
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
                }}
              >
                {!pinRoom && !pinned
                  ? 'Two notes are already pinned — unpin one first'
                  : 'At most two notes can be pinned per contact'}
              </span>
            </span>
          </label>

          {!editing && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Notes are stored against the contact, so it appears on their record
              and on any deal they're linked to.
            </p>
          )}

          {error && !errorField && (
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                padding: '9px 11px',
                border: '1px solid var(--status-stuck)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--tint-rose)',
                fontSize: 'var(--text-md)', color: 'var(--status-stuck-text)'
              }}
            >
              <span className="ms" style={{ fontSize: 16, flex: 'none', marginTop: 1 }}>error</span>
              {error}
            </div>
          )}
        </div>

        <footer
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '11px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--gray-25)'
          }}
        >
          <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {saving ? 'Saving to your CRM…' : editing && !dirty ? 'No changes yet' : '⌘↵ to save'}
          </span>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              height: 32, padding: '0 14px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
              color: 'var(--text-body)',
              cursor: saving ? 'default' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 32, padding: '0 16px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: canSave ? 'var(--brand-primary)' : 'var(--gray-200)',
              color: canSave ? '#fff' : 'var(--text-faint)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
              cursor: canSave ? 'pointer' : 'default'
            }}
          >
            {saving && (
              <span className="ms pp-spin" style={{ fontSize: 15 }}>progress_activity</span>
            )}
            {saving ? 'Saving' : editing ? 'Save changes' : 'Add note'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Swatch({ colour, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, padding: 0,
        border: active
          ? '2px solid var(--text-heading)'
          : '1px solid var(--border-strong)',
        borderRadius: '50%',
        background: colour || '#fff',
        cursor: 'pointer'
      }}
    >
      {/* "None" needs a mark of its own — an empty white circle beside six
          coloured ones reads as a missing swatch rather than a choice. */}
      {!colour && (
        <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>
          block
        </span>
      )}
      {colour && active && (
        <span className="ms" style={{ fontSize: 15, color: '#fff' }}>check</span>
      )}
    </button>
  )
}

function Field({ label, required, hint, error, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span
        style={{
          display: 'block', marginBottom: 5,
          fontSize: 'var(--text-xs)', fontWeight: 600,
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--status-stuck)' }}> *</span>}
      </span>
      {children}
      {hint && !error && (
        <span
          style={{
            display: 'block', marginTop: 4,
            fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
          }}
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          style={{
            display: 'block', marginTop: 4,
            fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)'
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}

// Note bodies come back as markup (GHL's editor is rich text) but this form
// edits plain text — sending HTML the rep didn't write would compound on every
// save.
function stripHtml(html) {
  const raw = String(html || '')
  if (!raw) return ''
  if (!/<[a-z][^>]*>/i.test(raw)) return raw
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'))
  doc.querySelectorAll('p, div, li').forEach((el) => el.append('\n'))
  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
