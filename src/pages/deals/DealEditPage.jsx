import React, { useEffect } from 'react'
import DealEditPanel from './DealEditPanel'

// A deal's editor as a PAGE — the tab's whole content, not a row that expands.
//
// Expanding inline put a tall form inside a scrolling list: on the board it
// was clipped by the column strip, and on the card list it pushed every other
// deal off screen while the rep worked.
//
// NOT a portal, and not fixed-position. It was both, and that covered the
// shell's own navigation — the tab strip, the Back button, the location name —
// so a rep on this page had no way anywhere except the button in its header.
// ContactDetail solves the same problem by simply REPLACING its tab's content
// (an early return in ContactsTab), which leaves the shell's chrome in place.
// This matches that.
//
// NOT a route either. Adding a fifth field to the shell's position (tab,
// dealId, contactId, businessId) means touching history, the localStorage
// restore and labelForPlace — for a surface whose back action is one button.
// The position a rep actually wants from here is the deal hub, which IS a
// real position, and that button is in the header.

export default function DealEditPage({
  deal, pipelines, users, refError,
  onClose, onSaved, onDeleted, onOpenInHub
}) {
  // Escape returns to the list — the keyboard equivalent of Back.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!deal) return null

  return (
    <div style={{ display: 'grid', gap: 0, minHeight: 0 }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--surface-card)',
        borderTopLeftRadius: 'var(--radius-lg)',
        borderTopRightRadius: 'var(--radius-lg)'
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

      <div style={{
        background: 'var(--surface-sunken)',
        padding: 'var(--space-4)',
        borderBottomLeftRadius: 'var(--radius-lg)',
        borderBottomRightRadius: 'var(--radius-lg)'
      }}>
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
  )
}
