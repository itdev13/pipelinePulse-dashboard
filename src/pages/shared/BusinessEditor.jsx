import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Input, Select } from 'antd'
import { businessesAPI } from '../../api/businesses'
import { countryOptions } from '../../constants/countries'

// Create or edit a business.
//
// Writes go to the CRM — see the server's ghlBusinessWrite.js. Three of their
// rules shape this form:
//
//   • NO WEBHOOKS EXIST for businesses. The server applies the echoed response
//     to our row itself, so a save shows up here immediately rather than at the
//     next nightly sync.
//
//   • DOMAIN IS UNIQUE PER LOCATION. Two businesses cannot share one, so the
//     current value is always shown and the server names the clashing business
//     rather than returning a bare rejection.
//
//   • A BUSINESS OVER 2000 CONTACTS CAN BE RENAMED ONCE A DAY. We cannot see
//     their contact count, so that surfaces as a save error, not a pre-check —
//     which is why the name field warns before it's touched on a large one.

// Ordered as the detail panel lays them out, so editing feels like the same
// screen rather than a different form.
const FIELDS = [
  { name: 'name',        label: 'Company name', type: 'text',      required: true },
  { name: 'description', label: 'Description',  type: 'multiline' },
  { name: 'website',     label: 'Website',      type: 'text',      placeholder: 'www.example.com' },
  { name: 'domainname',  label: 'Domain',       type: 'text',      placeholder: 'example.com',
    hint: 'The bare domain — no https://. Only one business per domain.' },
  { name: 'email',       label: 'Email',        type: 'text' },
  { name: 'phone',       label: 'Phone',        type: 'text',      placeholder: '+44…' },
  { name: 'address',     label: 'Address',      type: 'text' },
  { name: 'city',        label: 'City',         type: 'text' },
  { name: 'state',       label: 'County / State', type: 'text' },
  { name: 'postalCode',  label: 'Postcode',     type: 'text' },
  { name: 'country',     label: 'Country',      type: 'country' }
]

// The shared list — GHL's own 247 countries, common ones grouped first. This
// file used to carry its own eleven, so the create form and the edit panel
// offered different countries for the same field.
//
// Built once at module scope: rebuilding 247 options per render made the
// dropdown stutter while typing.
const COUNTRY_OPTIONS = countryOptions()

// Contact count above which GHL rate-limits renames. Their number, not ours.
const RENAME_LIMIT_CONTACTS = 2000

export default function BusinessEditor({
  business = null,      // null = creating
  onClose,
  onSaved
}) {
  const editing = !!business

  const [values, setValues] = useState(() => {
    const seed = {}
    for (const f of FIELDS) seed[f.name] = business?.[f.name] || ''
    return seed
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)

  const firstRef = useRef(null)
  useEffect(() => {
    const t = window.setTimeout(() => firstRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const set = (name, v) => setValues((prev) => ({ ...prev, [name]: v }))

  // Only what changed. Sending the whole record would overwrite a field someone
  // else edited in the CRM meanwhile — and on this endpoint it would also carry
  // locationId, which GHL rejects on an update.
  const changes = useMemo(() => {
    if (!editing) return null
    const out = {}
    for (const f of FIELDS) {
      const now = (values[f.name] || '').trim()
      const was = (business[f.name] || '').trim()
      if (now !== was) out[f.name] = now
    }
    return out
  }, [editing, business, values])

  // Renaming a big business is rate-limited by GHL to once a day. Warn while
  // it's still a keystroke away rather than after a failed save.
  const renameWarning = editing
    && changes?.name !== undefined
    && (business.contactCount || 0) > RENAME_LIMIT_CONTACTS

  const dirty = editing
    ? Object.keys(changes).length > 0
    : (values.name || '').trim().length > 0
  const canSave = !saving && dirty && (values.name || '').trim().length > 0

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    setErrorField(null)
    try {
      let res
      if (editing) {
        res = await businessesAPI.update(business.id, changes)
      } else {
        // Drop empties on create — sending "" for every untouched field would
        // store a record full of blank strings rather than nulls.
        const body = {}
        for (const f of FIELDS) {
          const v = (values[f.name] || '').trim()
          if (v) body[f.name] = v
        }
        res = await businessesAPI.create(body)
      }
      onSaved(res.business || null)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save that — try again')
      setErrorField(err.data?.field || null)
      setSaving(false)
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
        aria-label={editing ? 'Edit business' : 'New business'}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() }
        }}
        style={{
          width: 'min(680px, 100%)', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          borderRadius: 'var(--radius-md)',
          background: '#fff', boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            flex: 'none',
            padding: '13px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--tint-sky)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-sky)' }}>domain</span>
          <h2
            style={{
              flex: 1, margin: 0,
              fontSize: 'var(--text-xl)', fontWeight: 600,
              color: 'var(--accent-sky-text)'
            }}
          >
            {editing ? 'Edit business' : 'New business'}
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

        <div
          style={{
            flex: 1, overflowY: 'auto',
            display: 'grid', gap: 'var(--space-3)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            padding: 'var(--space-4)'
          }}
        >
          {FIELDS.map((f, i) => {
            const wide = f.type === 'multiline'
            return (
              <div key={f.name} style={{ minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
                <span
                  style={{
                    display: 'block', marginBottom: 5,
                    fontSize: 'var(--text-xs)', fontWeight: 600,
                    letterSpacing: 'var(--tracking-label)',
                    textTransform: 'uppercase', color: 'var(--text-muted)'
                  }}
                >
                  {f.label}
                  {f.required && <span style={{ color: 'var(--status-stuck)' }}> *</span>}
                </span>

                {f.type === 'multiline' ? (
                  <Input.TextArea
                    value={values[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                    rows={2}
                    status={errorField === f.name ? 'error' : undefined}
                  />
                ) : f.type === 'country' ? (
                  <Select
                    value={values[f.name] || undefined}
                    onChange={(v) => set(f.name, v || '')}
                    options={COUNTRY_OPTIONS}
                    placeholder="Not set"
                    allowClear
                    showSearch
                    // "United Kingdom (GB)" is the label, so this one prop
                    // searches the name AND the code.
                    optionFilterProp="label"
                    popupClassName="pp-menu"
                    listHeight={280}
                    notFoundContent="No country matches that"
                    style={{ width: '100%' }}
                    status={errorField === f.name ? 'error' : undefined}
                  />
                ) : (
                  <Input
                    ref={i === 0 ? firstRef : undefined}
                    value={values[f.name]}
                    onChange={(e) => set(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    status={errorField === f.name ? 'error' : undefined}
                  />
                )}

                {f.hint && errorField !== f.name && (
                  <span
                    style={{
                      display: 'block', marginTop: 4,
                      fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
                    }}
                  >
                    {f.hint}
                  </span>
                )}
                {errorField === f.name && (
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
          })}

          {renameWarning && (
            <div
              style={{
                gridColumn: '1 / -1',
                display: 'flex', alignItems: 'flex-start', gap: 7,
                padding: '9px 11px',
                border: '1px solid var(--status-working)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--tint-gold)',
                fontSize: 'var(--text-md)', color: 'var(--accent-gold-text)'
              }}
            >
              <span className="ms" style={{ fontSize: 16, flex: 'none', marginTop: 1 }}>schedule</span>
              This business has over {RENAME_LIMIT_CONTACTS.toLocaleString()} contacts,
              so its name can only be changed once a day.
            </div>
          )}

          {error && !errorField && (
            <div
              style={{
                gridColumn: '1 / -1',
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
            flex: 'none',
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
            {saving ? 'Saving' : editing ? 'Save changes' : 'Create business'}
          </button>
        </footer>
      </div>
    </div>
  )
}
