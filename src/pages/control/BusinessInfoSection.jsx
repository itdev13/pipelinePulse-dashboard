import React, { useRef, useState } from 'react'
import SectionCard, {
  PrimaryButton, GhostButton, TextArea, SaveState
} from './SectionCard'

// Business information — the catch-all context field. Deposits, survey
// process, service area, guarantees: anything the AI should know that isn't
// tone, MEDDIC, or a product.
//
// "Upload documents" reads text files client-side and appends them to the
// field rather than storing binaries (no storage bucket in this project).
// Appending, not replacing — a user uploading a second doc means "add this
// too", and silently overwriting their typed context would lose work.

const ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown'

function isReadableAsText(file) {
  if (file.type.startsWith('text/')) return true
  return /\.(txt|md|markdown)$/i.test(file.name)
}

export default function BusinessInfoSection({ businessInfo = '', onSave }) {
  const [draft, setDraft] = useState(businessInfo || '')
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const dirty = draft !== (businessInfo || '')

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

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    const readable = files.filter(isReadableAsText)
    const skipped = files.length - readable.length
    const chunks = []

    for (const file of readable) {
      try {
        const text = (await file.text()).trim()
        if (text) chunks.push(`${file.name}\n${text}`)
      } catch (err) {
        // Counted as skipped below — one unreadable file shouldn't abort
        // the rest of the batch.
      }
    }

    if (fileRef.current) fileRef.current.value = ''

    if (chunks.length) {
      setDraft((d) => [d.trim(), ...chunks].filter(Boolean).join('\n\n'))
      setState('idle')
    }
    if (skipped || (readable.length && !chunks.length)) {
      setError('Text files only — PDFs and documents cannot be read yet')
      setState('error')
    }
  }

  return (
    <SectionCard
      icon="apartment"
      title="Business information"
      accent="plum"
      help="Anything else the AI should know — deposits, survey process, service area, guarantees."
      footer={
        <>
          <PrimaryButton onClick={save} disabled={!dirty || state === 'saving'}>
            Save
          </PrimaryButton>
          <GhostButton icon="upload" onClick={() => fileRef.current?.click()}>
            Upload documents
          </GhostButton>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
          <SaveState state={state === 'idle' && dirty ? 'dirty' : state} error={error} />
        </>
      }
    >
      <div style={{ padding: '14px 16px' }}>
        <TextArea
          value={draft}
          onChange={(v) => {
            setDraft(v)
            if (state !== 'idle') setState('idle')
          }}
          placeholder="How you work — deposits, surveys, lead times, service area, guarantees"
          rows={6}
        />
      </div>
    </SectionCard>
  )
}
