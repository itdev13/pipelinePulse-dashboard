import React, { useEffect, useState } from 'react'
import { notesAPI } from '../../api/notes'

// Notes tab — every note in this location, newest first.
// Client-side search filters over what the backend already fetched.
export default function NotesTab() {
  const [notes, setNotes] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    notesAPI.list({ limit: 500 })
      .then((r) => alive && setNotes(r.notes || []))
      .catch((err) => alive && setError(err.message || 'Failed to load notes'))
    return () => { alive = false }
  }, [])

  const filtered = (notes || []).filter((n) => {
    if (!q.trim()) return true
    const needle = q.toLowerCase()
    return [n.body, n.author, n.contact?.name, n.deal?.name]
      .filter(Boolean).join(' ').toLowerCase().includes(needle)
  })

  const formatWhen = (iso) => {
    if (!iso) return null
    const d = new Date(iso)
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`
  }

  return (
    <div
      style={{
        maxWidth: 1080, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: '16px 20px 28px', display: 'grid', gap: 14
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24 }}>Notes</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {notes ? `${notes.length} in this location` : 'Loading…'}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search note body, contact or deal"
          style={{
            marginLeft: 'auto',
            width: 320, height: 36, boxSizing: 'border-box',
            padding: '0 12px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', fontSize: 13, color: 'var(--text-body)'
          }}
        />
      </div>

      <section
        style={{
          border: '2px solid var(--accent-gold)',
          borderRadius: 'var(--radius-md)',
          background: '#fff', overflow: 'hidden'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-gold)' }}>sticky_note_2</span>
          <h3
            style={{
              fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)',
              margin: 0, flex: 1
            }}
          >
            All notes
          </h3>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {filtered.length}
          </span>
        </header>

        {error && (
          <div style={{ padding: 16, background: 'var(--tint-rose)', color: 'var(--status-stuck)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {notes && filtered.length === 0 && !error && (
          <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            No notes match — clear the search to see everything.
          </div>
        )}

        {!notes && !error && (
          <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            Loading notes…
          </div>
        )}

        {filtered.map((n) => (
          <div
            key={n.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr auto',
              gap: 12, alignItems: 'start',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-default)'
            }}
          >
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, flex: 'none',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--tint-gold)'
              }}
            >
              <span className="ms" style={{ fontSize: 15, color: 'var(--accent-gold)' }}>sticky_note_2</span>
            </span>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13, lineHeight: 1.55, color: 'var(--text-body)',
                  whiteSpace: 'pre-line'
                }}
              >
                {n.body || '(empty note)'}
              </div>
              <div
                style={{
                  fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4
                }}
              >
                {[n.author, formatWhen(n.createdAt)].filter(Boolean).join(' · ')}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {n.contact && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-pill)',
                    background: '#fff',
                    fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                    color: 'var(--text-body)'
                  }}
                >
                  <span className="ms" style={{ fontSize: 13, color: 'var(--text-muted)' }}>person</span>
                  {n.contact.name || 'Contact'}
                </span>
              )}
              {n.deal && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px',
                    border: '1px solid var(--green-300)',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--green-50)',
                    fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                    color: 'var(--green-600)'
                  }}
                >
                  <span className="ms" style={{ fontSize: 13 }}>sell</span>
                  {n.deal.name}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
