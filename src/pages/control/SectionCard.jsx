import React from 'react'

// Shared chrome for the four Control centre sections: accent-bordered card,
// icon + coloured title, a right-side meta slot ("2 samples"), and a tinted
// help strip under the header explaining what the section feeds.
//
// Same construction as PeopleSection / DealSection in the Deal Hub — 2px
// accent border, white body — so the app reads as one system.

export default function SectionCard({
  icon,
  title,
  accent,
  meta,
  help,
  children,
  footer
}) {
  const color = `var(--accent-${accent})`

  return (
    <section
      style={{
        border: `2px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '12px 16px'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color }}>{icon}</span>
        <h2 style={{ fontSize: 18, fontWeight: 600, color, margin: 0, flex: 1 }}>
          {title}
        </h2>
        {meta && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{meta}</span>
        )}
      </header>

      {help && (
        <p
          style={{
            margin: 0, padding: '10px 16px',
            borderTop: '1px solid var(--border-default)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--gray-50)',
            fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-body)'
          }}
        >
          {help}
        </p>
      )}

      {children}

      {footer && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '12px 16px',
            borderTop: '1px solid var(--border-default)'
          }}
        >
          {footer}
        </div>
      )}
    </section>
  )
}

// ── Shared controls ───────────────────────────────────────────────────

export function PrimaryButton({ children, onClick, disabled, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 34, padding: '0 16px',
        border: 'none', borderRadius: 'var(--radius-md)',
        background: disabled ? 'var(--gray-300)' : 'var(--green-600)',
        color: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease-out'
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 17 }}>{icon}</span>}
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick, disabled, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 34, padding: '0 14px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff', color: 'var(--text-body)',
        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 17 }}>{icon}</span>}
      {children}
    </button>
  )
}

export function IconButton({ icon = 'close', onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, flex: 'none',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: '#fff', color: 'var(--text-muted)',
        cursor: 'pointer'
      }}
    >
      <span className="ms" style={{ fontSize: 17 }}>{icon}</span>
    </button>
  )
}

export function TextField({ value, onChange, placeholder, mono }) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', height: 36, boxSizing: 'border-box',
        padding: '0 11px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: 13, color: 'var(--text-heading)'
      }}
    />
  )
}

export function TextArea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '10px 11px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.55,
        color: 'var(--text-heading)',
        resize: 'vertical'
      }}
    />
  )
}

// Save state shown next to a section's save button. Sections are saved
// independently, so each needs to say for itself whether it has unsaved
// edits, is mid-flight, or failed.
export function SaveState({ state, error }) {
  if (state === 'saving') {
    return <Note>Saving…</Note>
  }
  if (state === 'saved') {
    return (
      <Note color="var(--status-done)" icon="check_circle">Saved</Note>
    )
  }
  if (state === 'error') {
    return (
      <Note color="var(--status-stuck)" icon="error">
        {error || 'Save failed'}
      </Note>
    )
  }
  if (state === 'dirty') {
    return <Note icon="edit">Unsaved changes</Note>
  }
  return null
}

function Note({ children, color = 'var(--text-muted)', icon }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, color
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 15 }}>{icon}</span>}
      {children}
    </span>
  )
}
