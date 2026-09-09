import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dealsAPI } from '../../api/deals'

// Which deal a message is filed against, and the control to change it.
//
// A message belongs to ONE deal (agreed with James, 8 Sep — see
// docs/MESSAGE-DEAL-LINKING-RULE.md). The engine files it automatically
// against the contact's earliest open deal; this is how a sales manager
// overrides that.
//
// LOCAL ONLY. The CRM has no concept of a message belonging to a deal, so
// nothing is written upstream — the attribution is ours. The change is
// recorded as a manual decision, which the engine never overwrites on a
// later sync or backfill.
//
// Portalled to the body: the timeline sits inside panels with
// `overflow: hidden`, which clip an absolutely-positioned dropdown. Same
// reason as TaskDealsPopover.
export default function MessageDealPill({
  message, dealId, targets = [], onMoved
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pos, setPos] = useState(null)
  const anchorRef = useRef(null)
  const boxRef = useRef(null)

  // Only the OTHER deals are worth offering, plus an explicit unlink.
  const options = targets.filter((t) => t.id !== dealId)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const W = 260
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
      const below = window.innerHeight - r.bottom
      const flip = below < 220 && r.top > below
      setPos({
        left,
        top: flip ? undefined : r.bottom + 4,
        bottom: flip ? window.innerHeight - r.top + 4 : undefined
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return
      if (anchorRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function move(targetId) {
    setBusy(true)
    setError(null)
    try {
      await dealsAPI.setMessageMapping(dealId, message.messageId, targetId)
      setOpen(false)
      if (onMoved) onMoved(message, targetId)
    } catch (e) {
      // The server's words. "Could not move" tells the rep nothing they can
      // act on; "that deal is not on this contact" tells them exactly why.
      setError(e?.response?.data?.error || e?.message || 'That did not save')
    } finally {
      setBusy(false)
    }
  }

  const manual = message.mappedManually === true
  // Who moved it, when we can resolve the name. 'system' is the engine's own
  // marker and is never shown — "moved by system" would imply a person.
  const by = manual && message.mappedByName && message.mappedByName !== 'system'
    ? message.mappedByName
    : null

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title={
          manual
            ? `Moved here by hand${by ? ` by ${by}` : ''} — click to change`
            : 'Filed here automatically by the linking rule — click to move it'
        }
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 7px', flex: 'none',
          fontSize: 11, fontWeight: 600,
          letterSpacing: 'var(--tracking-label)',
          border: '1px solid var(--border-default)',
          borderRadius: 999,
          // A manual decision is tinted so it reads as deliberate rather than
          // as something the engine did.
          background: manual ? 'var(--tint-pine)' : 'transparent',
          color: manual ? 'var(--accent-pine-text)' : 'var(--text-faint)',
          cursor: 'pointer', whiteSpace: 'nowrap'
        }}
      >
        {/* The icon carries the distinction too, not only the words: a
            person for a human decision, the automation mark for the rule.
            Colour alone would not survive a greyscale print or a
            colour-blind reader. */}
        <span className="ms" style={{ fontSize: 13 }}>
          {manual ? 'person' : 'bolt'}
        </span>
        {manual ? 'Moved here' : 'Auto-filed'}
        <span className="ms" style={{ fontSize: 13 }}>expand_more</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={boxRef}
          style={{
            position: 'fixed',
            left: pos.left, top: pos.top, bottom: pos.bottom,
            zIndex: 50, width: 260, padding: 'var(--space-2)',
            background: '#fff',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 12px 32px rgba(15, 34, 26, 0.16)',
            textAlign: 'left'
          }}
        >
          {/* How it got here, before offering to change it. A manager
              opening this is usually asking "why is this on this deal?" —
              answering that first is worth four lines. */}
          <div style={{
            padding: '2px 6px 8px',
            borderBottom: '1px solid var(--border-default)',
            marginBottom: 6
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.04em', color: 'var(--text-muted)'
            }}>
              {manual ? 'Moved here by hand' : 'Filed automatically'}
            </div>
            <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--text-faint)' }}>
              {manual
                ? (by ? `by ${by}` : 'by a sales manager')
                : 'the contact\'s earliest open deal'}
            </div>
          </div>

          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.04em', color: 'var(--text-muted)',
            padding: '0 6px 6px'
          }}>
            Move this message to
          </div>

          {options.length === 0 && (
            <p style={{ margin: '0 6px 6px', fontSize: 12, color: 'var(--text-faint)' }}>
              This contact has no other deals.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {options.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => move(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', width: '100%',
                  border: 'none', borderRadius: 'var(--radius-md)',
                  background: 'transparent', textAlign: 'left',
                  fontSize: 12.5, color: 'var(--text-default)',
                  cursor: busy ? 'wait' : 'pointer'
                }}
              >
                {/* min-width: 0 so a long deal name truncates instead of
                    pushing the status chip out of the popover. */}
                <span style={{
                  flex: 1, minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {t.name}
                </span>
                {/* A manager may deliberately file against a won or lost deal
                    (James, 8 Sep), so those are offered — labelled, so the
                    choice is informed rather than accidental. */}
                {t.status && t.status !== 'open' && (
                  <span style={{
                    fontSize: 10, textTransform: 'uppercase',
                    color: 'var(--text-faint)', flex: 'none'
                  }}>
                    {t.status}
                  </span>
                )}
              </button>
            ))}

            <button
              type="button"
              disabled={busy}
              onClick={() => move(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 8px', marginTop: 2,
                border: 'none', borderTop: '1px solid var(--border-default)',
                borderRadius: 0, background: 'transparent', textAlign: 'left',
                fontSize: 12.5, color: 'var(--text-muted)',
                cursor: busy ? 'wait' : 'pointer'
              }}
            >
              <span className="ms" style={{ fontSize: 14 }}>link_off</span>
              Unlink from every deal
            </button>
          </div>

          {error && (
            <p role="alert" style={{
              margin: '6px 6px 0', fontSize: 11.5, color: 'var(--status-stuck)'
            }}>
              {error}
            </p>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
