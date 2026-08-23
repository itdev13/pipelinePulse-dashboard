import React, { useEffect, useRef, useState } from 'react'
import { controlAPI } from '../../api/control'
import MeddicMappingSection from '../control/MeddicMappingSection'
import SectionCard, { PrimaryButton, GhostButton } from '../control/SectionCard'
import { Bar, SkeletonStyles, formatDate } from '../shared/ListChrome'

// Control panel — v5.
//
// One markdown file of business context per sub-account, plus the read-only
// Qualification headings from GHL's own custom fields.
//
// v5 retired the four-section Control centre (tone samples, products table,
// MEDDIC descriptions, business info textarea). The file replaces all of it:
// no schema, the business writes whatever it wants the agent to know.
//
// The file lives in Postgres, not on the VM's filesystem — it has to survive a
// restart or a redeploy, or the agent silently loses its grounding and nobody
// notices until an answer goes generic.

export default function ControlCentreTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    controlAPI.get()
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err.message || 'Failed to load the control panel'))
    return () => { alive = false }
  }, [])

  if (error) {
    return (
      <Shell>
        <p
          style={{
            margin: 0, padding: 16,
            borderLeft: '3px solid var(--status-stuck)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--tint-rose)', color: 'var(--status-stuck)',
            fontSize: 13
          }}
        >
          {error}
        </p>
      </Shell>
    )
  }

  if (!data) {
    return (
      <Shell>
        <SkeletonStyles />
        {[300, 200].map((h, i) => (
          <div
            key={i}
            style={{
              border: '2px solid var(--gray-200)',
              borderRadius: 'var(--radius-md)',
              background: '#fff', overflow: 'hidden'
            }}
          >
            <div
              style={{
                display: 'flex', gap: 9, padding: '12px 16px', alignItems: 'center'
              }}
            >
              <Bar w={20} h={20} style={{ flex: 'none' }} />
              <Bar w={160} h={15} />
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 10 }}>
              <Bar w="100%" h={h / 4} r="var(--radius-md)" />
              <Bar w="80%" h={13} />
            </div>
          </div>
        ))}
      </Shell>
    )
  }

  return (
    <Shell>
      <BusinessContextSection
        file={data.businessContext}
        onSaved={(businessContext) => setData((d) => ({ ...d, businessContext }))}
      />
      <MeddicMappingSection fields={data.meddicFields || []} />
      <Footnote />
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '4px 20px 48px' }}>
      <div
        style={{
          display: 'flex', alignItems: 'baseline', gap: 14,
          flexWrap: 'wrap', marginBottom: 18
        }}
      >
        <h1 style={{ fontSize: 25, fontWeight: 600, margin: 0 }}>Control panel</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          One markdown file of business context — this is the entire control
          panel in v1
        </p>
      </div>
      <div style={{ display: 'grid', gap: 18 }}>{children}</div>
    </div>
  )
}

// ── Business context ──────────────────────────────────────────────────

// Text formats only. A PDF read as text is mojibake, and the agent would be
// grounded in noise rather than failing visibly.
const ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain'

function isReadableAsText(file) {
  if (file.type.startsWith('text/')) return true
  return /\.(md|markdown|txt)$/i.test(file.name)
}

function BusinessContextSection({ file, onSaved }) {
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const upload = async (fileList) => {
    const picked = Array.from(fileList || [])[0]
    if (!picked) return
    if (!isReadableAsText(picked)) {
      setError('Markdown or plain text only — a PDF cannot be read as text')
      setState('error')
      return
    }

    setState('saving')
    setError(null)
    try {
      const content = await picked.text()
      if (!content.trim()) {
        setError('That file is empty')
        setState('error')
        return
      }
      const res = await controlAPI.saveBusinessContext(content, picked.name)
      onSaved(res.businessContext)
      setState('saved')
      window.setTimeout(() => setState('idle'), 2500)
    } catch (err) {
      setError(err.message || 'Could not save the file')
      setState('error')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <SectionCard
      icon="description"
      title="Business context"
      accent="sky"
      meta="One file per sub-account"
      help="Whatever the business wants the agent to know — products, lead times, how it operates, tone, objection answers — written however you like. No schema. The agent reads this file at the start of every conversation."
    >
      {file ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, flex: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--tint-sky)', color: 'var(--accent-sky)',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600
            }}
          >
            md
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)', fontSize: 13.5,
                color: 'var(--text-heading)'
              }}
            >
              {file.filename}
            </span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
              {[
                formatSize(file.sizeBytes),
                file.uploadedAt ? `Uploaded ${formatDate(file.uploadedAt)}` : null,
                replacedLabel(file.replaceCount)
              ].filter(Boolean).join(' · ')}
            </span>
          </span>

          <PrimaryButton
            icon="upload"
            onClick={() => inputRef.current?.click()}
            disabled={state === 'saving'}
          >
            {state === 'saving' ? 'Uploading…' : 'Replace file'}
          </PrimaryButton>
          <GhostButton
            icon="download"
            onClick={() => controlAPI.downloadBusinessContext()}
          >
            Download
          </GhostButton>
        </div>
      ) : (
        <div style={{ padding: 16, display: 'grid', gap: 12, justifyItems: 'start' }}>
          <p
            style={{
              margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text-muted)'
            }}
          >
            No file yet. Until one is uploaded the agent answers from the deal's
            messages alone — it knows nothing about your products, lead times or
            how you work.
          </p>
          <PrimaryButton
            icon="upload"
            onClick={() => inputRef.current?.click()}
            disabled={state === 'saving'}
          >
            {state === 'saving' ? 'Uploading…' : 'Upload file'}
          </PrimaryButton>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={(e) => upload(e.target.files)}
        style={{ display: 'none' }}
      />

      {(state === 'error' || state === 'saved') && (
        <p
          style={{
            margin: 0, padding: '10px 16px',
            borderBottom: '1px solid var(--border-default)',
            background: state === 'error' ? 'var(--tint-rose)' : 'var(--tint-pine)',
            fontSize: 12.5,
            color: state === 'error' ? 'var(--status-stuck)' : 'var(--green-600)'
          }}
        >
          {state === 'error'
            ? error
            : 'Saved — the agent uses this from its next answer.'}
        </p>
      )}

      {file?.preview && (
        <div style={{ padding: '12px 16px' }}>
          <span
            style={{
              display: 'block', marginBottom: 7,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            Preview
          </span>
          <pre
            style={{
              margin: 0, maxHeight: 300, overflow: 'auto',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--gray-50)',
              fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
              color: 'var(--text-body)',
              whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'
            }}
          >
            {file.preview}
          </pre>
          {/* Say the preview is partial — otherwise it reads as the whole file. */}
          {file.truncated && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>
              First 2,000 characters — download the file to read all of it.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

// The design's closing note. Worth keeping: it sets the expectation that the
// agent doesn't learn, so what it knows is exactly what's in this file.
function Footnote() {
  return (
    <p
      style={{
        margin: 0, padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--gray-50)',
        fontSize: 13, lineHeight: 1.55, color: 'var(--text-body)'
      }}
    >
      The agent runs with fixed guardrails and is not self-learning. This file —
      with the messages on each deal and the deal's own fields — is everything an
      answer is grounded in.
    </p>
  )
}

function formatSize(bytes) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function replacedLabel(n) {
  if (!n) return null
  if (n === 1) return 'replaced once'
  if (n === 2) return 'replaced twice'
  return `replaced ${n} times`
}
