import React, { useState } from 'react'
import SectionCard, { PrimaryButton, TextField, SaveState } from './SectionCard'

// Qualification headings — read from GoHighLevel, not invented here.
//
// The location already has these as opportunity custom fields
// (opportunity.meddic_1 … meddic_10) with its own names: "1. Project Scope",
// "8. Decision Criteria", "9. Deal Lost reason". Asking a user to retype
// textbook MEDDIC into six boxes would have produced a second, conflicting
// set of headings — so this lists the real fields and only collects the one
// thing GHL can't tell us: what each one means in practice.
//
// Descriptions are optional. A heading with a name and no description is
// still given to the model, because it needs to know the heading exists to
// file evidence under it.

export default function MeddicMappingSection({ meddic = {}, fields = [], onSave }) {
  const [draft, setDraft] = useState(() => normalise(meddic, fields))
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)

  const active = fields.filter((f) => f.active !== false)
  const dirty = active.some(
    (f) => (draft[f.fieldKey] || '') !== (meddic[f.fieldKey] || '')
  )
  const described = active.filter((f) => (draft[f.fieldKey] || '').trim()).length

  const save = async () => {
    setState('saving')
    setError(null)
    try {
      await onSave(draft)
      setState('saved')
    } catch (err) {
      setError(err.message || 'Could not save')
      setState('error')
    }
  }

  // No fields synced yet. This is a real state, not an error: the daily
  // customFields cron may not have run for this location, and saying so beats
  // an empty panel that looks broken.
  if (active.length === 0) {
    return (
      <SectionCard
        icon="checklist"
        title="Qualification headings"
        accent="gold"
        help="These come from your opportunity custom fields in GoHighLevel."
      >
        <p
          style={{
            margin: 0, padding: '16px',
            fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)'
          }}
        >
          No qualification fields found for this sub-account yet. They're read
          from your GoHighLevel opportunity custom fields (the ones named
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}> meddic_1</code> onwards),
          and sync once a day — so they'll appear here shortly after they're
          created in GoHighLevel.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      icon="checklist"
      title="Qualification headings"
      accent="gold"
      meta={`${described} of ${active.length} described`}
      help="These are your own opportunity fields from GoHighLevel. Add a line saying what each one means in your business, and the AI files evidence under the right heading."
      footer={
        <>
          <PrimaryButton onClick={save} disabled={!dirty || state === 'saving'}>
            Save descriptions
          </PrimaryButton>
          <SaveState state={state === 'idle' && dirty ? 'dirty' : state} error={error} />
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10, padding: '14px 16px' }}>
        {active.map((f) => (
          <div
            key={f.fieldKey}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(150px, 210px) 1fr',
              gap: 14, alignItems: 'center'
            }}
          >
            <label
              htmlFor={f.fieldKey}
              title={f.fieldKey}
              style={{ minWidth: 0 }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 13, fontWeight: 600, color: 'var(--text-heading)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {f.name}
              </span>
              {/* The GHL key, so a rep can match this row to the field they
                  see in GoHighLevel. */}
              <span
                style={{
                  display: 'block', marginTop: 1,
                  fontFamily: 'var(--font-mono)', fontSize: 10.5,
                  color: 'var(--text-faint)'
                }}
              >
                meddic_{f.index}
              </span>
            </label>
            <TextField
              id={f.fieldKey}
              value={draft[f.fieldKey]}
              onChange={(v) => {
                setDraft((d) => ({ ...d, [f.fieldKey]: v }))
                if (state !== 'idle') setState('idle')
              }}
              placeholder="What this means in your business — optional"
            />
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// Keyed by GHL field_key, so adding an 11th field in GoHighLevel needs no
// change here.
function normalise(meddic, fields) {
  const out = {}
  for (const f of fields) out[f.fieldKey] = meddic?.[f.fieldKey] || ''
  return out
}
