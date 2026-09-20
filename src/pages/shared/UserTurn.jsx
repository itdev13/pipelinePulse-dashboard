import React from 'react'

// A rep's own question in the transcript — a filled brand-color bubble with
// an asymmetric tail corner, sized to its own text (not a fixed-width box).
// Shared by the portfolio Co-Pilot tab and Deal Hub's per-deal Co-Pilot so
// both read as the same product.
export default function UserTurn({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <p style={{
        margin: 0, maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: '16px 16px 4px 16px',
        background: 'var(--brand-primary)', color: '#fff',
        fontSize: 'var(--text-md)', lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word'
      }}>
        {text}
      </p>
    </div>
  )
}
