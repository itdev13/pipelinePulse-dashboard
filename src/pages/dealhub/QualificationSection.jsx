import React from 'react'

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
  if (qualification.length === 0) return null

  const missing = qualification.filter((q) => !q.filled)
  const filled = qualification.length - missing.length

  return (
    <section
      style={{
        border: '2px solid var(--accent-gold)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-gold)' }}>
          checklist
        </span>
        <h3
          style={{
            fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)',
            margin: 0, flex: 1
          }}
        >
          Qualification
        </h3>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {filled} of {qualification.length}
        </span>
        {missing.length > 0 && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center',
              height: 22, padding: '0 9px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--tint-rose)', color: 'var(--status-stuck)',
              fontSize: 11.5, fontWeight: 600
            }}
          >
            {missing.length} missing
          </span>
        )}
      </header>

      <div>
        {qualification.map((q, i) => (
          <div
            key={q.fieldKey}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(150px, 210px) 1fr',
              gap: 16, alignItems: 'baseline',
              padding: '11px 16px',
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
                  fontSize: 13, fontWeight: 600, color: 'var(--text-heading)'
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
                    fontSize: 11, lineHeight: 1.4, color: 'var(--text-faint)'
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
                  fontSize: 13, lineHeight: 1.5, color: 'var(--text-body)',
                  whiteSpace: 'pre-line'
                }}
              >
                {q.value}
              </p>
            ) : (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 12.5, color: 'var(--status-stuck)'
                }}
              >
                <span className="ms" style={{ fontSize: 15 }}>help</span>
                Not answered yet
              </span>
            )}
          </div>
        ))}
      </div>

      <p
        style={{
          margin: 0, padding: '10px 16px',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--gray-25)',
          fontSize: 12, color: 'var(--text-muted)'
        }}
      >
        {missing.length === 0
          ? 'Every heading answered on this deal.'
          : `${missing.length} of ${qualification.length} headings have no answer on this deal — edit the opportunity in GoHighLevel to fill them in.`}
      </p>
    </section>
  )
}
