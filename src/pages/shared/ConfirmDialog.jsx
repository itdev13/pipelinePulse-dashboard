import React, { useEffect, useRef } from 'react'

// A confirmation the app draws itself.
//
// Replaces window.confirm, which renders as an OS dialog: wrong typeface, wrong
// colours, the browser's own wording round the edges, and it can't show what is
// actually about to be deleted. It also blocks the JS thread, so nothing can
// indicate progress while the delete is in flight.
//
// Shape follows the note and task editors — same overlay, same header band,
// same footer — so a destructive action doesn't arrive looking like a different
// application.
//
// Deliberate details:
//   • CANCEL IS FOCUSED, not the destructive button. Enter is the reflex after
//     a dialog appears; landing it on Delete would make the safe habit
//     dangerous.
//   • Esc cancels, and so does the backdrop — but never mid-delete.
//   • `preview` shows what is about to go. "Delete this note?" asks the reader
//     to trust they clicked the right row; showing the text lets them check.

export default function ConfirmDialog({
  title = 'Are you sure?',
  // What is about to happen, in a sentence.
  message,
  // Optional: the record's own text, so the reader can verify the target.
  preview = null,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  // 'danger' (default) or 'neutral' — a destructive action is red, a merely
  // significant one is not, and the difference should be visible.
  tone = 'danger',
  // Shown while the action runs. The dialog stays open so the click has
  // somewhere to report back to.
  busy = false,
  // A failure from the action, rendered in place rather than replacing the
  // dialog — the reader can read the reason and try again.
  error = null,
  onConfirm,
  onCancel
}) {
  const cancelRef = useRef(null)
  const danger = tone === 'danger'

  useEffect(() => {
    const t = window.setTimeout(() => cancelRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  const accent = danger ? 'var(--status-stuck)' : 'var(--brand-primary)'
  const accentText = danger ? 'var(--status-stuck-text)' : 'var(--accent-pine-text)'
  const tint = danger ? 'var(--tint-rose)' : 'var(--tint-pine)'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        background: 'rgba(23, 33, 46, 0.5)'
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: 'min(460px, 100%)',
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
            background: tint
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: accent }}>
            {danger ? 'warning' : 'help'}
          </span>
          <h2
            style={{
              flex: 1, margin: 0,
              fontSize: 'var(--text-xl)', fontWeight: 600,
              color: accentText
            }}
          >
            {title}
          </h2>
        </header>

        <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-normal)',
              color: 'var(--text-body)'
            }}
          >
            {message}
          </p>

          {/* The record's own text. Clamped: a long note shouldn't push the
              buttons off the screen, and three lines is enough to recognise it
              by. */}
          {preview && (
            <div
              style={{
                padding: '10px 12px',
                borderLeft: `3px solid ${accent}`,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--gray-25)',
                fontSize: 'var(--text-md)', lineHeight: 'var(--leading-normal)',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflowWrap: 'anywhere'
              }}
            >
              {preview}
            </div>
          )}

          {error && (
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
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            padding: '11px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--gray-25)'
          }}
        >
          {/* Focused on open: Enter is the reflex when a dialog appears, and it
              should land on the safe option. */}
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 34, padding: '0 16px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
              color: 'var(--text-body)',
              cursor: busy ? 'default' : 'pointer'
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 34, padding: '0 18px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: accent, color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.75 : 1
            }}
          >
            {busy && (
              <span className="ms pp-spin" style={{ fontSize: 15 }}>progress_activity</span>
            )}
            {busy ? 'Deleting' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
