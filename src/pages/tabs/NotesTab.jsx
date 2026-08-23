import React, { useCallback, useState } from 'react'
import { notesAPI } from '../../api/notes'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import {
  Shell, PageHeader, Panel, ContactChip, DealChip, Chip, RowAction,
  PrimaryAction, NoteChip, StateMessage, LoadMore, RichBody, relativeTime
} from '../shared/ListChrome'

// Notes — v5.
//
// Changes from v4: "Add note" moves to the page header, the deal chip always
// renders (showing "No deal" when unattached), "Make task" and Delete join the
// row actions, and notes linked to this note appear as gold chips beneath.
//
// No search or sort control here — the v5 design has neither on this page. The
// spec's "sort controls on list pages" applies elsewhere.
//
// GHL notes have no title column (migration 017), so the heading is derived
// from the body's first block — see splitNote.

export default function NotesTab({ onOpenDeal, onOpenContact }) {
  const fetchPage = useCallback(
    ({ cursor }) => notesAPI.list({ limit: 20, cursor }),
    []
  )
  const { items, error, hasMore, loadingMore, loading, loadMore } =
    usePagedList({ fetchPage, key: 'notes', deps: [] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const notes = items || []

  return (
    <Shell>
      <PageHeader
        title="Notes"
        subtitle="Agreed information, saved by you or the AI agent — every note also lands on its deal timeline"
        action={<PrimaryAction onClick={undefined} icon="add">Add note</PrimaryAction>}
      />

      <Panel
        icon="sticky_note_2"
        title="All notes"
        accent="gold"
        meta={
          loading
            ? null
            : `${notes.length}${hasMore ? '+' : ''} ${notes.length === 1 ? 'note' : 'notes'}`
        }
      >
        <StateMessage
          loading={loading}
          error={error}
          empty={!loading && notes.length === 0}
          emptyText="No notes yet. Notes are information worth keeping — saved by you, or by the agent when you agree in chat that something should be stored."
          loadingText="Loading notes…"
        />

        {notes.map((n) => {
          const { heading, rest } = splitNote(n.body)
          const byAI = isAIAuthored(n)
          const hasChips = n.noteChips?.length > 0
          return (
            <div key={n.id}>
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 16px',
                  borderBottom: hasChips ? 'none' : '1px solid var(--border-default)'
                }}
              >
                <span
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, flex: 'none', marginTop: 1,
                    borderRadius: 'var(--radius-sm)',
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
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--text-heading)',
                        lineHeight: 1.35
                      }}
                    >
                      {heading}
                    </span>
                    {byAI && <AIBadge />}
                  </div>

                  {rest && (
                    <div style={{ marginTop: 3 }}>
                      <RichBody html={rest} size={12.5} />
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {[n.author, relativeTime(n.createdAt)].filter(Boolean).join(' · ')}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex', gap: 6, flexWrap: 'wrap',
                    justifyContent: 'flex-end', alignItems: 'center'
                  }}
                >
                  {/* The design loops contacts — a note can involve several
                      people (Sarah and Mark on the same note). */}
                  {(n.contacts?.length ? n.contacts : n.contact ? [n.contact] : []).map((c) => (
                    <ContactChip
                      key={c.id}
                      name={c.name}
                      onClick={onOpenContact ? () => onOpenContact(c.id) : undefined}
                    />
                  ))}
                  {/* Always rendered — "No deal" is a real state in v5, not an
                      absence to hide. */}
                  <DealChip
                    name={n.deal?.name || 'No deal'}
                    onClick={
                      n.deal && onOpenDeal ? () => onOpenDeal(n.deal.id) : undefined
                    }
                  />
                  <Chip
                    icon="task_alt"
                    title="Create a task from this note — coming next"
                  >
                    Make task
                  </Chip>
                  <RowAction
                    icon="edit"
                    title="Edit note — contacts, deal and linked notes (coming next)"
                  />
                  <RowAction
                    icon="close"
                    danger
                    title="Delete note — coming next"
                  />
                </div>
              </div>

              {hasChips && (
                <div
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 5,
                    padding: '0 16px 12px 48px',
                    borderBottom: '1px solid var(--border-default)'
                  }}
                >
                  {n.noteChips.map((c) => (
                    <NoteChip key={c.id} label={c.label} />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {!loading && notes.length > 0 && (
          <LoadMore
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            count={notes.length}
            noun="note"
          />
        )}
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

// Notes have no title column, so the first block becomes the heading and the
// rest is the body. Bodies are markup, so "first block" means the first
// paragraph/line element — splitting on "\n" finds nothing in
// "<p>a</p><p>b</p>" and would make the whole markup string the heading.
function splitNote(body) {
  const raw = (body || '').trim()
  if (!raw) return { heading: '(empty note)', rest: null }

  // Plain text: first line is the heading, as before.
  if (!/<[a-z][^>]*>/i.test(raw)) {
    const lines = raw.split('\n')
    const heading = lines[0].trim()
    const rest = lines.slice(1).join('\n').trim()
    if (!rest && heading.length > 120) return { heading: 'Note', rest: heading }
    return { heading, rest: rest || null }
  }

  // Markup: first block element's text is the heading; the remaining markup is
  // handed back intact so its formatting survives.
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  const blocks = [...doc.body.children]
  if (blocks.length > 1) {
    const heading = (blocks[0].textContent || '').trim()
    const rest = blocks.slice(1).map((el) => el.outerHTML).join('')
    if (heading) return { heading, rest: rest || null }
  }

  // One block, or nothing usable: the whole thing is the body. No invented
  // heading — a truncated first sentence in bold reads worse than none.
  const text = (doc.body.textContent || '').trim()
  if (text.length <= 120) return { heading: text, rest: null }
  return { heading: 'Note', rest: raw }
}

// Notes written by the AI agent. GHL has no "authored by AI" flag, so this
// reads the stored author name. Once the agent stamps its own attribution,
// point this at that field.
function isAIAuthored(note) {
  const author = (note.author || '').toLowerCase()
  return author.includes('ai') || author.includes('deal hub') || author.includes('agent')
}
