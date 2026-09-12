import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import DealEditPanel from './DealEditPanel'

// A deal's editor as a PAGE, not a row that expands in place.
//
// Expanding inline put a tall form inside a scrolling list: on the board it
// was clipped by the column strip, and on the card list it pushed every other
// deal off screen while the rep worked. A record you edit deserves the whole
// surface, the way a contact does.
//
// Rendered through a portal for the same reason the filter panel is — the
// board's horizontally scrolling strip and the list's own overflow both clip
// anything positioned inside them.
//
// NOT a route. Adding a fifth field to the shell's position (tab, dealId,
// contactId, businessId) means touching history, the localStorage restore and
// labelForPlace — for a surface whose back action is a single Close. The
// escape hatch a rep actually wants from here is "open this on the deal hub",
// which IS a real position, and that button is right in the header.

export default function DealEditPage({
  deal, pipelines, users, refError,
  onClose, onSaved, onDeleted, onOpenInHub
}) {
  // Escape closes. The panel holds unsaved edits, so this is the one dialog
  // where a stray click on the backdrop must NOT discard work — hence no
  // click-outside handler, unlike the filter panel.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // The page behind must not scroll while this is open — two scrollbars, and
  // closing returns the rep to a list scrolled somewhere they never went.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (!deal) return null

  return createPortal(
    // .pp-portal — tokens and the icon font are scoped to [data-dealhub],
    // which a portal escapes.
    <div
      className="pp-portal"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${deal.dealTag || deal.opportunityName || 'deal'}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'var(--surface-card)',
        display: 'flex', flexDirection: 'column'
      }}
    >
      <header style={{
        flex: 'none',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-card)'
      }}>
        <button
          onClick={onClose}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none',
            height: 34, padding: '0 12px 0 9px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-card)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
            fontWeight: 500, color: 'var(--text-body)', cursor: 'pointer'
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          Back to deals
        </button>

        <h1 style={{
          margin: 0, flex: 1, minWidth: 0,
          fontSize: 'var(--text-xl)', fontWeight: 600,
          color: 'var(--text-heading)', letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {deal.dealTag || deal.opportunityName || 'Untitled deal'}
        </h1>

        {/* The way ONWARD. This page edits the record's own fields; the hub is
            where its timeline, tasks, notes and people live. */}
        {onOpenInHub && (
          <button
            onClick={() => onOpenInHub(deal.id)}
            title="See this deal's timeline, tasks and notes"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
              height: 34, padding: '0 14px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--brand-primary)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
              fontWeight: 600, cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>space_dashboard</span>
            Open in deal hub
          </button>
        )}
      </header>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface-sunken)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-4)' }}>
          <DealEditPanel
            deal={deal}
            pipelines={pipelines}
            users={users}
            refError={refError}
            onSaved={onSaved}
            onDeleted={onDeleted}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
