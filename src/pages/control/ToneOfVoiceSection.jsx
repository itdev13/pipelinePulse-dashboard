import React, { useRef, useState } from 'react'
import SectionCard, {
  PrimaryButton, GhostButton, IconButton, TextArea, SaveState
} from './SectionCard'

// Tone of voice — writing samples the AI imitates when drafting.
//
// Two ways in:
//   • Paste into the textarea, click Add sample
//   • Upload .txt/.md files — read client-side with FileReader and posted as
//     text. No storage bucket involved: the AI only ever consumes the text,
//     so keeping binaries would be dead weight.
//
// The sample title is the first line of the pasted text (which for an email
// is the subject — hence the placeholder), or the filename on upload. The
// server applies the same fallback, so a title is never required.

// Only formats we can read as text. A PDF would arrive as mojibake, so it's
// rejected with a clear message rather than silently stored as garbage.
const ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown'

function isReadableAsText(file) {
  if (file.type.startsWith('text/')) return true
  return /\.(txt|md|markdown)$/i.test(file.name)
}

export default function ToneOfVoiceSection({ samples = [], onAdd, onDelete }) {
  const [draft, setDraft] = useState('')
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const add = async (payload) => {
    setState('saving')
    setError(null)
    try {
      await onAdd(payload)
      setState('saved')
      return true
    } catch (err) {
      setError(err.message || 'Could not add sample')
      setState('error')
      return false
    }
  }

  const addPasted = async () => {
    const body = draft.trim()
    if (!body) return
    const ok = await add({ body, source: 'paste' })
    if (ok) setDraft('')
  }

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    const readable = files.filter(isReadableAsText)
    const skipped = files.length - readable.length

    setState('saving')
    setError(null)
    let failed = 0
    for (const file of readable) {
      try {
        const body = (await file.text()).trim()
        if (!body) { failed++; continue }
        // Filename minus extension is a better label than the first line
        // for uploads — the user named the file deliberately.
        await onAdd({
          body,
          title: file.name.replace(/\.[^.]+$/, ''),
          source: 'upload'
        })
      } catch (err) {
        failed++
      }
    }

    if (fileRef.current) fileRef.current.value = ''

    if (failed || skipped) {
      const parts = []
      if (skipped) parts.push(`${skipped} skipped — text files only`)
      if (failed) parts.push(`${failed} could not be read`)
      setError(parts.join(' · '))
      setState('error')
    } else {
      setState('saved')
    }
  }

  return (
    <SectionCard
      icon="record_voice_over"
      title="Tone of voice"
      accent="sky"
      meta={`${samples.length} ${samples.length === 1 ? 'sample' : 'samples'}`}
      help="Upload plain text files or paste emails your reps are proud of — the AI copies their tone when it drafts messages."
    >
      {samples.map((s) => (
        <div
          key={s.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 11,
            padding: '11px 16px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, flex: 'none',
              borderRadius: 'var(--radius-md)',
              background: 'var(--tint-sky)', color: 'var(--accent-sky)'
            }}
          >
            <span className="ms" style={{ fontSize: 17 }}>
              {s.channel === 'sms' ? 'sms' : s.channel === 'note' ? 'sticky_note_2' : 'mail'}
            </span>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              title={s.body}
              style={{
                fontSize: 13.5, fontWeight: 600, color: 'var(--text-heading)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {labelFor(s.channel)}
              {s.createdAt ? ` · added ${formatDate(s.createdAt)}` : ''}
              {s.source === 'upload' ? ' · uploaded' : ''}
            </div>
          </div>
          <IconButton
            onClick={() => onDelete(s.id)}
            title="Remove this sample"
          />
        </div>
      ))}

      <div style={{ padding: '12px 16px' }}>
        <TextArea
          value={draft}
          onChange={setDraft}
          placeholder="Paste an email here — subject line first"
          rows={5}
        />
      </div>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '0 16px 14px'
        }}
      >
        <PrimaryButton
          onClick={addPasted}
          disabled={!draft.trim() || state === 'saving'}
        >
          Add sample
        </PrimaryButton>
        <GhostButton icon="upload" onClick={() => fileRef.current?.click()}>
          Upload text files
        </GhostButton>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <SaveState state={state} error={error} />
      </div>
    </SectionCard>
  )
}

function labelFor(channel) {
  if (channel === 'sms') return 'SMS'
  if (channel === 'note') return 'Note'
  return 'Email'
}

function formatDate(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
