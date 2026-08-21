import React, { useCallback, useState } from 'react'
import { notesAPI } from '../../api/notes'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import {
  Shell, PageHeader, Panel, Row, ContactChip, DealChip, Chip, RowAction,
  PrimaryAction, SearchInput, StateMessage, LoadMore, RichBody, relativeTime
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
  const [q, setQ] = useState('')
  // Search runs server-side now: with pagination, filtering only the loaded
  // page would hide matches sitting further down the list.
  const [search, setSearch] = useState('')

  const fetchPage = useCallback(
    ({ cursor }) => notesAPI.list({ limit: 20, cursor, q: search || undefined }),
    [search]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore } =
    usePagedList({ fetchPage, key: 'notes', deps: [search] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const notes = items || []

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
        meta={loading ? null : `${notes.length}${hasMore ? '+' : ''} ${notes.length === 1 ? 'note' : 'notes'}`}
        toolbar={
          <SearchInput
            value={q}
            onChange={(v) => setQ(v)}
            onKeyDown={(e) => { if (e.key === 'Enter') setSearch(q.trim()) }}
            onBlur={() => setSearch(q.trim())}
            placeholder="Search note text — press Enter"
            width={340}
          />
        }
      >
        <StateMessage
          loading={loading}
          error={error}
          empty={!loading && notes.length === 0}
          emptyText={
            search
              ? 'No notes match — clear the search to see everything.'
              : 'No notes yet. Notes saved in GoHighLevel appear here.'
          }
          loadingText="Loading notes…"
        />

        {notes.map((n, i) => {
          const { heading, rest } = splitNote(n.body)
          const byAI = isAIAuthored(n)
          return (
            <Row key={n.id} last={i === notes.length - 1}>
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
                  <div style={{ marginTop: 4 }}>
                    <RichBody html={rest} />
                  </div>
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

  // Plain text (no markup): first line is the heading, as before.
  if (!/<[a-z][^>]*>/i.test(raw)) {
    const lines = raw.split('\n')
    const heading = lines[0].trim()
    const rest = lines.slice(1).join('\n').trim()
    if (!rest && heading.length > 120) return { heading: 'Note', rest: heading }
    return { heading, rest: rest || null }
  }

  // Markup: take the first block element's text as the heading and hand the
  // remaining markup back intact, so its formatting survives.
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

// Notes written by the nightly AI pass. GHL has no "authored by AI" flag, so
// this reads the author name the writer stored. Once the extraction pipeline
// (CONTEXT.md §5.3) stamps its own attribution, point this at that field.
function isAIAuthored(note) {
  const author = (note.author || '').toLowerCase()
  return author.includes('ai') || author.includes('deal hub')
}
