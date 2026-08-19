import React from 'react'

// Deal Hub — Commitments section.
//
// Shell only for now. The full spec groups outstanding promises into two
// buckets ("we said we'd send" vs "they said they'd send"), with overdue
// pills, quote-link chips, and quick "Make task" actions. All that lands
// once the promise-extraction pipeline is wired up; this scaffolding just
// reserves the frame in the layout so the section order is stable.

export default function CommitmentsSection() {
  return (
    <section
      style={{
        border: '2px solid var(--accent-clay)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-clay)' }}>
          handshake
        </span>
        <h3
          style={{
            fontSize: 18, fontWeight: 600, color: 'var(--accent-clay)',
            margin: 0, flex: 1
          }}
        >
          Commitments
        </h3>
      </header>
    </section>
  )
}
