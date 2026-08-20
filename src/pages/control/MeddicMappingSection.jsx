import React, { useState } from 'react'
import SectionCard, { PrimaryButton, TextField, SaveState } from './SectionCard'

// MEDDIC mapping — what each of the six headings means in this business.
//
// The AI reads these definitions to decide which heading a piece of
// qualification evidence belongs under. Server whitelists exactly these six
// keys (routes/control.js MEDDIC_KEYS), so the field list is the contract —
// keep the keys in sync if a seventh heading is ever added.

const FIELDS = [
  { key: 'metrics',           label: 'Metrics',           placeholder: 'What numbers matter — budget, target price, volume' },
  { key: 'economic_buyer',    label: 'Economic buyer',    placeholder: 'Who actually signs off the spend' },
  { key: 'decision_criteria', label: 'Decision criteria', placeholder: 'What they compare you on' },
  { key: 'decision_process',  label: 'Decision process',  placeholder: 'The steps from enquiry to order' },
  { key: 'identify_pain',     label: 'Identify pain',     placeholder: 'What is blocking them' },
  { key: 'champion',          label: 'Champion',          placeholder: 'Who pushes for you internally' }
]

export default function MeddicMappingSection({ meddic = {}, onSave }) {
  const [draft, setDraft] = useState(() => normalise(meddic))
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)

  const dirty = FIELDS.some((f) => (draft[f.key] || '') !== (meddic[f.key] || ''))

  const save = async () => {
    setState('saving')
    setError(null)
    try {
      await onSave(draft)
      setState('saved')
    } catch (err) {
      setError(err.message || 'Could not save mapping')
      setState('error')
    }
  }

  return (
    <SectionCard
      icon="checklist"
      title="MEDDIC mapping"
      accent="gold"
      help="Tell the AI what each MEDDIC field means in your business, so it files qualification evidence under the right heading."
      footer={
        <>
          <PrimaryButton onClick={save} disabled={!dirty || state === 'saving'}>
            Save mapping
          </PrimaryButton>
          <SaveState state={state === 'idle' && dirty ? 'dirty' : state} error={error} />
        </>
      }
    >
      <div style={{ display: 'grid', gap: 10, padding: '14px 16px' }}>
        {FIELDS.map((f) => (
          <div
            key={f.key}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 160px) 1fr',
              gap: 14, alignItems: 'center'
            }}
          >
            <label
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)' }}
            >
              {f.label}
            </label>
            <TextField
              value={draft[f.key]}
              onChange={(v) => {
                setDraft((d) => ({ ...d, [f.key]: v }))
                if (state !== 'idle') setState('idle')
              }}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function normalise(meddic) {
  const out = {}
  for (const f of FIELDS) out[f.key] = meddic?.[f.key] || ''
  return out
}
