import React, { useEffect, useState } from 'react'
import { notesAPI } from '../../api/notes'
import {
  Shell, PageHeader, Panel, Row, ContactChip, DealChip, Chip, RowAction,
  PrimaryAction, SearchInput, StateMessage, relativeTime
} from '../shared/ListChrome'

// Notes tab — every note in the location, newest first.
//
// GHL notes are body-only: there is no title column (migration 017). The
// design shows a bold heading per note, so we derive it from the first line
// and render the remainder as the body — which is how people actually write
// notes ("Budget ceiling agreed\nKeep the whole package under £30k"). A
// single-line note becomes the heading with no body, rather than a heading
// duplicated as its own body text.
export default function NotesTab({ onOpenDeal }) {
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

  return (
    <Shell>
      <PageHeader
        title="Notes"
        subtitle="Agreed information, saved by you or the AI agent — every note also lands on its deal timeline"
        action={
          <PrimaryAction onClick={undefined} icon="add">
            Add note
          </PrimaryAction>
        }
      />

      <Panel
        icon="sticky_note_2"
        title="All notes"
        accent="gold"
        meta={notes ? `${filtered.length} ${filtered.length === 1 ? 'note' : 'notes'}` : null}
        toolbar={
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search note text, contact or deal"
            width={340}
          />
        }
      >
        <StateMessage
          loading={!notes && !error}
          error={error}
          empty={notes && filtered.length === 0}
          emptyText={
            q.trim()
              ? 'No notes match — clear the search to see everything.'
              : 'No notes yet. Notes saved in GoHighLevel appear here.'
          }
          loadingText="Loading notes…"
        />

        {filtered.map((n, i) => {
          const { heading, rest } = splitNote(n.body)
          const byAI = isAIAuthored(n)
          return (
            <Row key={n.id} last={i === filtered.length - 1}>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, flex: 'none', marginTop: 1,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--tint-gold)'
                }}
              >
                <span className="ms" style={{ fontSize: 16, color: 'var(--accent-gold)' }}>
                  sticky_note_2
                </span>
              </span>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    flexWrap: 'wrap'
                  }}
                >
                  <span
                    style={{
                      fontSize: 14, fontWeight: 600, color: 'var(--text-heading)',
                      lineHeight: 1.35
                    }}
                  >
                    {heading}
                  </span>
                  {byAI && <AIBadge />}
                </div>

                {rest && (
                  <p
                    style={{
                      margin: '4px 0 0', maxWidth: 640,
                      fontSize: 13, lineHeight: 1.55, color: 'var(--text-body)',
                      whiteSpace: 'pre-line'
                    }}
                  >
                    {rest}
                  </p>
                )}

                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>
                  {[n.author, relativeTime(n.createdAt)].filter(Boolean).join(' · ')}
                </div>
              </div>

              <div
                style={{
                  display: 'flex', gap: 6, flexWrap: 'wrap',
                  justifyContent: 'flex-end', alignItems: 'center'
                }}
              >
                {n.contact && <ContactChip name={n.contact.name} />}
                {n.deal && (
                  <DealChip
                    name={n.deal.name}
                    onClick={onOpenDeal ? () => onOpenDeal(n.deal.id) : undefined}
                  />
                )}
                <Chip icon="add_task" title="Turn this note into a task — coming next">
                  Make task
                </Chip>
                <RowAction icon="edit" title="Edit note — coming next" />
              </div>
            </Row>
          )
        })}
      </Panel>
    </Shell>
  )
}

function AIBadge() {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        height: 22, padding: '0 9px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--tint-sky)', color: 'var(--accent-sky)',
        fontSize: 11, fontWeight: 600
      }}
    >
      <span className="ms" style={{ fontSize: 14 }}>auto_awesome</span>
      AI agent
    </span>
  )
}

// First line becomes the heading; the rest is the body. Notes with one line
// get a heading only — no duplicated text.
function splitNote(body) {
  const text = (body || '').trim()
  if (!text) return { heading: '(empty note)', rest: null }
  const lines = text.split('\n')
  const heading = lines[0].trim()
  const rest = lines.slice(1).join('\n').trim()
  // A long single paragraph has no natural heading — a 300-char "title"
  // would wreck the row, so fall back to a generic label and keep the whole
  // thing as the body.
  if (!rest && heading.length > 120) {
    return { heading: 'Note', rest: heading }
  }
  return { heading, rest: rest || null }
}

// Notes written by the nightly AI pass. GHL has no "authored by AI" flag, so
// this reads the author name the writer stored. Once the extraction pipeline
// (CONTEXT.md §5.3) stamps its own attribution, point this at that field.
function isAIAuthored(note) {
  const author = (note.author || '').toLowerCase()
  return author.includes('ai') || author.includes('deal hub')
}
