import React, { useState } from 'react'

// Qualification — the deal's own custom field values, against the headings
// configured in GoHighLevel.
//
// Not AI output. These are the opportunity's meddic_1..10 columns, so a filled
// heading is something a rep actually wrote and a missing one is a real gap in
// the record. That distinction matters: once the AI extraction layer lands it
// will PROPOSE values here, but a proposal won't count as filled until a human
// confirms it (spec rule 2).
//
// The missing count is the point of the panel. A heading with no value is a
// question nobody has answered on this deal, which is exactly what a manager
// reviewing it wants to see first.

export default function QualificationSection({ qualification = [] }) {
  // Collapsed by default. Ten rows of "Not filled yet" is the longest panel in
  // the rail and the least actionable — the counts in the header already say
  // everything a reviewer needs, so the detail is opt-in.
  const [open, setOpen] = useState(false)

  if (qualification.length === 0) return null

  const missing = qualification.filter((q) => !q.filled)
  const filled = qualification.length - missing.length

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-gold-text)',
        ['--panel-tint']: 'var(--tint-gold)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? 'Hide the headings' : 'Show all ten headings'}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          width: '100%', cursor: 'pointer', textAlign: 'left',
          padding: 'var(--space-3) var(--space-4)',
          border: 'none',
          // The divider belongs to the open state — closed, the header IS the
          // whole panel and a bottom rule would read as an empty body.
          borderBottom: open ? '1px solid var(--border-default)' : 'none',
          background: '#fff',
          fontFamily: 'var(--font-sans)'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-gold)' }}>
          checklist
        </span>
        <h3
          style={{
            fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--accent-gold)',
            margin: 0, flex: 1
          }}
        >
          Qualification
        </h3>
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
          {filled} of {qualification.length}
        </span>
        {missing.length > 0 && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center',
              height: 22, padding: '0 9px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--tint-rose)', color: 'var(--status-stuck)',
              fontSize: 'var(--text-sm)', fontWeight: 600
            }}
          >
            {missing.length} missing
          </span>
        )}
        <span
          className="ms"
          style={{ fontSize: 'var(--text-xl)', color: 'var(--text-faint)', flex: 'none' }}
        >
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div>
          {qualification.map((q, i) => (
            <div
              key={q.fieldKey}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(150px, 210px) 1fr',
                gap: 'var(--space-4)', alignItems: 'baseline',
                padding: '11px var(--space-4)',
                borderBottom: i === qualification.length - 1
                  ? 'none'
                  : '1px solid var(--border-default)',
                // Faint rose wash on the rows that need attention, so the gaps
                // read at a glance without hunting for empty cells.
                background: q.filled ? 'transparent' : 'var(--tint-rose)'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
                  }}
                >
                  {q.name}
                </span>
                {/* The heading's own question, from GHL's placeholder — so a rep
                    filling a gap knows what's being asked. */}
                {q.description && (
                  <span
                    style={{
                      display: 'block', marginTop: 2,
                      fontSize: 'var(--text-sm)', lineHeight: 1.4, color: 'var(--text-faint)'
                    }}
                  >
                    {q.description}
                  </span>
                )}
              </div>

              {q.filled ? (
                <p
                  style={{
                    margin: 0, maxWidth: 620,
                    fontSize: 'var(--text-md)', lineHeight: 1.5, color: 'var(--text-body)',
                    whiteSpace: 'pre-line'
                  }}
                >
                  {q.value}
                </p>
              ) : (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 'var(--text-base)', color: 'var(--status-stuck)'
                  }}
                >
                  <span className="ms" style={{ fontSize: 15 }}>help</span>
                  Not filled yet
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* The footnote explains the rows, so it belongs with them — showing it
          under a collapsed header would describe a list nobody can see. */}
      {open && (
        <p
          style={{
            margin: 0, padding: '10px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--gray-25)',
            fontSize: 'var(--text-base)', color: 'var(--text-muted)'
          }}
        >
          {missing.length === 0
            ? 'Every heading filled on this deal.'
            : `${missing.length} of ${qualification.length} headings are not filled on this deal — edit the opportunity in GoHighLevel to fill them in.`}
        </p>
      )}
    </section>
  )
}
