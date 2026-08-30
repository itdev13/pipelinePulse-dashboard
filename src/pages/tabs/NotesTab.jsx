import React, { useCallback, useEffect, useRef, useState } from 'react'
import { notesAPI } from '../../api/notes'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import NoteEditor from '../shared/NoteEditor'
import ConfirmDialog from '../shared/ConfirmDialog'
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
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem, reload } =
    usePagedList({ fetchPage, key: 'notes', deps: [] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const notes = items || []

  // null = closed. { note } = editing that one; { note: null } = creating.
  const [editor, setEditor] = useState(null)
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState(null)

  const say = (message, tone = 'done') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), tone === 'done' ? 2200 : 4200)
  }

  // The note queued for deletion, plus any failure from trying. The CRM has no
  // restore over OAuth, so this genuinely can't be undone — the dialog says so
  // and shows the note's own text, rather than asking the reader to trust they
  // clicked the right row.
  const [confirming, setConfirming] = useState(null)
  const [confirmError, setConfirmError] = useState(null)

  // Wait for a newly-created note to arrive via the webhook.
  //
  // Backs off rather than hammering: most notes land on the second or third
  // try. Gives up after ~8s and says so — a spinner that never resolves is
  // worse than an honest "refresh in a moment".
  const pollTimers = useRef([])
  useEffect(() => () => pollTimers.current.forEach(window.clearTimeout), [])

  const pollForNote = (noteId) => {
    const delays = [600, 1000, 1500, 2000, 3000]
    let attempt = 0

    const tick = async () => {
      try {
        const res = await notesAPI.list({ limit: 20 })
        const arrived = !noteId || (res.notes || []).some((n) => n.id === noteId)
        if (arrived) {
          reload()
          say('Note added')
          return
        }
      } catch {
        // Ignore and retry — a failed poll is not a failed save.
      }
      attempt++
      if (attempt >= delays.length) {
        reload()
        say('Note saved — it will appear here shortly', 'done')
        return
      }
      pollTimers.current.push(window.setTimeout(tick, delays[attempt]))
    }

    pollTimers.current.push(window.setTimeout(tick, delays[0]))
  }

  const remove = async () => {
    const n = confirming
    if (!n || busy) return
    setBusy(n.id)
    setConfirmError(null)
    try {
      await notesAPI.remove(n.id)
      setConfirming(null)
      reload()
      say('Note deleted')
    } catch (err) {
      // Reported inside the dialog, which stays open — the reader can read why
      // and retry without hunting for the row again.
      setConfirmError(err.message || 'Could not delete that note')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Shell>
      <PageHeader
        title="Notes"
        subtitle="Agreed information, saved by you or the AI agent — every note also lands on its deal timeline"
        action={
          <PrimaryAction onClick={() => setEditor({ note: null })} icon="add">
            Add note
          </PrimaryAction>
        }
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
          // A real title wins over one derived from the body. Before migration
          // 058 there was no title column, so an author who DID title their
          // note saw it rendered as body text with a heading invented from the
          // first sentence.
          const derived = splitNote(n.body)
          const heading = n.title || derived.heading
          const rest = n.title ? n.body : derived.rest
          const byAI = isAIAuthored(n)
          const hasChips = n.noteChips?.length > 0
          return (
            <div key={n.id}>
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: 'var(--space-3) var(--space-4)',
                  borderBottom: hasChips ? 'none' : '1px solid var(--border-default)'
                }}
              >
                <span
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, flex: 'none', marginTop: 1,
                    borderRadius: 'var(--radius-sm)',
                    // The author's own colour when they picked one. It's a
                    // label they chose, so it should show.
                    background: n.color || 'var(--tint-gold)'
                  }}
                >
                  <span
                    className="ms"
                    style={{
                      fontSize: 16,
                      color: n.color ? '#fff' : 'var(--accent-gold)'
                    }}
                  >
                    sticky_note_2
                  </span>
                </span>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap'
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--text-xl)', fontWeight: 600,
                        lineHeight: 1.3, letterSpacing: '-0.01em',
                        color: 'var(--text-heading)'
                      }}
                    >
                      {heading}
                    </span>
                    {byAI && <AIBadge />}
                    {n.pinned && (
                      <span
                        title="Pinned to the top of this contact"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--tint-gold)', color: 'var(--accent-gold-text)',
                          fontSize: 'var(--text-sm)', fontWeight: 600
                        }}
                      >
                        <span className="ms" style={{ fontSize: 13 }}>push_pin</span>
                        Pinned
                      </span>
                    )}
                  </div>

                  {rest && (
                    <div style={{ marginTop: 3 }}>
                      {/* 14px body against the 17px heading. At 12px the note
                          text was smaller than the metadata line beneath it. */}
                      <RichBody
                        html={rest}
                        color="var(--text-body)"
                        size="var(--text-lg)"
                        leading="var(--leading-normal)"
                      />
                    </div>
                  )}

                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', marginTop: 4 }}>
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
                  {/* Skip a contact whose name IS the deal name — GHL default-
                      names an opportunity after its contact, so the two chips
                      printed the same person twice. */}
                  {(n.contacts?.length ? n.contacts : n.contact ? [n.contact] : [])
                    .filter((c) => !sameName(c.name, n.deal?.name))
                    .map((c) => (
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
                    title="Edit this note"
                    onClick={() => setEditor({ note: n })}
                  />
                  <RowAction
                    icon="close"
                    danger
                    title="Delete this note"
                    onClick={() => { setConfirmError(null); setConfirming(n) }}
                  />
                </div>
              </div>

              {hasChips && (
                <div
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 5,
                    padding: '0 var(--space-4) var(--space-3) var(--space-7)',
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

      {editor && (
        <NoteEditor
          note={editor.note}
          contacts={editor.note?.contact ? [editor.note.contact] : []}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            if (editor.note && saved) {
              // Apply what the CRM echoed, not what we sent.
              patchItem((x) => x.id === editor.note.id, {
                body: saved.body ?? editor.note.body,
                title: saved.title ?? null,
                color: saved.color ?? null,
                pinned: saved.pinned === true
              })
              say('Note saved')
            } else {
              // A new note reaches our database via the CRM's webhook, and that
              // round trip (our POST → CRM → webhook → the CRM fetch the webhook
              // makes → our DB) takes a second or two. A single immediate
              // reload() therefore lost the race almost every time, and the note
              // only appeared on a manual refresh.
              //
              // Poll instead, until it shows up or we give up. `saved.id` is the
              // CRM's own note id, which is what our rows are keyed on.
              say('Note added — syncing…')
              pollForNote(saved?.id)
            }
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete this note?"
          message="This cannot be undone — your CRM has no restore for notes."
          preview={previewOf(confirming)}
          confirmLabel="Delete note"
          busy={busy === confirming.id}
          error={confirmError}
          onConfirm={remove}
          onCancel={() => { setConfirming(null); setConfirmError(null) }}
        />
      )}

      {toast && (
        <Toast tone={toast.tone}>{toast.message}</Toast>
      )}
    </Shell>
  )
}

const TOAST_TONES = {
  done:  { icon: 'check_circle', colour: 'var(--status-done)' },
  error: { icon: 'error',        colour: 'var(--status-stuck)' }
}

// A failed save and a successful one must not look identical.
function Toast({ children, tone = 'done' }) {
  const { icon, colour } = TOAST_TONES[tone] || TOAST_TONES.done
  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 7,
        maxWidth: 420,
        padding: '10px 14px',
        border: `1px solid ${colour}`,
        borderRadius: 'var(--radius-md)',
        background: '#fff', boxShadow: 'var(--shadow-overlay)',
        fontSize: 'var(--text-md)', color: 'var(--text-heading)'
      }}
    >
      <span className="ms" style={{ fontSize: 17, color: colour, flex: 'none' }}>{icon}</span>
      {children}
    </div>
  )
}

// A note as plain text, for the confirm dialog's preview. Bodies are markup, so
// the tags have to come off or the reader sees "<p>Hi Ollie</p>" and can't tell
// whether it's the right note.
function previewOf(note) {
  const title = (note.title || '').trim()
  const raw = String(note.body || '')
  let text = raw
  if (/<[a-z][^>]*>/i.test(raw)) {
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    // Block boundaries are NOT whitespace in textContent, so
    // "<p>Hi Ollie</p><p>Thanks</p>" reads as "Hi OllieThanks" without this —
    // two sentences fused into a non-word, in the one place the reader is
    // checking they picked the right note.
    doc.querySelectorAll('br').forEach((el) => el.replaceWith(' '))
    doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6')
      .forEach((el) => el.append(' '))
    text = doc.body.textContent || ''
  }
  const body = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  // Both when they differ — the title alone may not be enough to recognise it,
  // and the body alone loses the heading the reader was looking at.
  if (title && body) return `${title} — ${body}`
  return title || body || '(empty note)'
}

// Case- and space-insensitive name match. GHL stores whatever was typed, so
// "james stevens" and "James Stevens" are the same person.
function sameName(a, b) {
  if (!a || !b) return false
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
}

function AIBadge() {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
        height: 22, padding: '0 9px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--tint-sky)', color: 'var(--accent-sky-text)',
        fontSize: 'var(--text-sm)', fontWeight: 600
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
