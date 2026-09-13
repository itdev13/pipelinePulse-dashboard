import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { htmlToText } from '../../utils/sanitiseHtml'
import ViewSwitch from '../shared/ViewSwitch'
import WorkFilters from '../shared/WorkFilters'
import { useTabState } from '../../hooks/useTabState'
import { notesAPI } from '../../api/notes'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import NoteEditor from '../shared/NoteEditor'
import { useLinkTargets } from '../../hooks/useLinkTargets'
import ConfirmDialog from '../shared/ConfirmDialog'
import { noteColourStyle } from '../../utils/noteColour'
import {
  Shell, PageHeader, ContactChip, DealChip, Chip, RowAction,
  PrimaryAction, NoteChip, StateMessage, LoadMore, RichBody, relativeTime,
  AttachmentCount
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
  // Contact / deal filters. useTabState, not plain state: stepping out to a
  // deal or a contact and back should not discard them.
  const [filters, setFilters] = useTabState('notes', 'filters', {})

  // The note open in the reader. Null = none.
  const [reading, setReading] = useState(null)

  const fetchPage = useCallback(
    ({ cursor }) => notesAPI.list({
      limit: 20, cursor,
      contactId: filters.contactId || undefined,
      dealId: filters.dealId || undefined
    }),
    [filters]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem, reload } =
    usePagedList({ fetchPage, key: 'notes', deps: [filters] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const notes = items || []

  // null = closed. { note } = editing that one; { note: null } = creating.
  const [editor, setEditor] = useState(null)
  // Deals and companies for the editor's link pickers. Lazy: fetched when
  // an editor first opens, so reading the list costs nothing extra.
  const linkTargets = useLinkTargets(!!editor)
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState(null)

  // Rows or a grid — see TasksTab. Persisted per tab, so the two can differ.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('pp.notes.view') || 'rows' } catch { return 'rows' }
  })
  useEffect(() => {
    try { localStorage.setItem('pp.notes.view', view) } catch { /* private mode */ }
  }, [view])


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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <WorkFilters
              filters={filters}
              onChange={setFilters}
              noun="notes"
            />
            <ViewSwitch
              value={view}
              onChange={setView}
              options={[
                { id: 'rows', icon: 'view_agenda', label: 'Rows' },
                { id: 'grid', icon: 'grid_view', label: 'Grid' }
              ]}
            />
            <PrimaryAction onClick={() => setEditor({ note: null })} icon="add">
            Add note
          </PrimaryAction>
          </span>
        }
      />

      {/* A plain surface, not a Panel.
          The Panel added a second header — "All notes" and a count — directly
          under the page's own title and count, and the tab read as a page
          inside a page. The controls live in the page header, like Contacts. */}
      {/* The page IS the surface — no border, no radius, no inner box.
          A bordered container inside a page that is already a container read
          as a panel floating on a page; the notes should simply be the page.
          In ROWS the separation comes from each row's own divider; in the GRID
          from the cards themselves. */}
      <div style={{
        background: view === 'grid' ? 'transparent' : 'var(--surface-card)',
        borderRadius: view === 'grid' ? 0 : 'var(--radius-lg)'
      }}>
        <StateMessage
          loading={loading}
          error={error}
          empty={!loading && notes.length === 0}
          emptyText="No notes yet. Notes are information worth keeping — saved by you, or by the agent when you agree in chat that something should be stored."
          loadingText="Loading notes…"
        />

        {/* GRID wraps the same rows — see TasksTab for why the markup is
            shared rather than duplicated. */}
        <div style={view === 'grid' ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 'var(--space-3)',
          padding: 'var(--space-3)'
        } : undefined}>
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
          // The author's own colour, via the shared normaliser.
          //
          // This list already showed the colour, but read `n.color` straight
          // into a style attribute. A note's colour is attacker-influenceable
          // — anyone with sub-account access can set one, and integrations
          // write notes too — so a value like
          // `red; background-image: url(//evil/x)` escaped the declaration.
          // normaliseNoteColour is an allow-list of the two forms GHL itself
          // accepts on write.
          const col = noteColourStyle(n.color)
          return (
            <div key={n.id}>
              <div
                style={{
                  // Stacked in a card — see TasksTab. At a 340px column the
                  // horizontal layout left the title a few pixels and it
                  // wrapped one letter per line.
                  display: 'flex',
                  flexDirection: view === 'grid' ? 'column' : 'row',
                  alignItems: view === 'grid' ? 'stretch' : 'flex-start',
                  gap: 10,
                  // The stripe eats the left padding rather than adding to it,
                  // so coloured and uncoloured rows keep their text on one
                  // vertical line.
                  padding: col.stripe
                    ? 'var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) - 3px)'
                    : 'var(--space-3) var(--space-4)',
                  // Matches the deal rail's treatment, so the same note looks
                  // the same in both places.
                  borderLeft: col.stripe ? `3px solid ${col.stripe}` : 'none',
                  // A card in the grid, a list item in rows — see TasksTab.
                  // The colour stripe on the left survives either way.
                  ...(view === 'grid'
                    ? {
                      border: '1px solid var(--border-default)',
                      // A FIXED height, so a grid row's cards all end on the
                      // same line. Without it a card with a description was
                      // taller than one without, and the row below started at
                      // a different depth for every column — the zig-zag.
                      // MINIMUM height, not fixed.
                      //
                      // A hard 210px with overflow:hidden lined the cards up
                      // and then CUT THE CONTROLS OFF — a card whose body
                      // pushed the chips past 210px simply lost its edit and
                      // delete buttons. RichBody also adds its own "Show plain
                      // text" toggle on formatted notes, which I had not
                      // counted.
                      //
                      // min-height keeps the row aligned for ordinary cards
                      // and lets a taller one grow rather than swallow what a
                      // rep needs to click. The body's 3-line clamp already
                      // bounds the only part that can grow without limit.
                      minHeight: 210,
                      borderLeft: col.stripe
                        ? `3px solid ${col.stripe}`
                        : '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-card)'
                    }
                    : { borderBottom: hasChips ? 'none' : '1px solid var(--border-default)' })
                }}
              >
                <span
                  title={col.name ? `${col.name} note` : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, flex: 'none', marginTop: 1,
                    borderRadius: 'var(--radius-sm)',
                    background: col.tint || 'var(--tint-gold)'
                  }}
                >
                  <span
                    className="ms"
                    style={{
                      fontSize: 16,
                      // WAS '#fff' ON A PASTEL, which is close to unreadable:
                      // white on #FFF2B2 is about 1.2:1. These are pale fills,
                      // so the glyph has to go dark.
                      color: col.hex ? 'var(--text-heading)' : 'var(--accent-gold)'
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
                    <AttachmentCount count={n.attachmentCount} />
                  </div>

                  {rest && (
                    <div style={{
                      marginTop: 3,
                      // CLAMPED in a card. The card has a fixed height so its
                      // row lines up, and without a clamp a long note simply
                      // overflowed past the border — visible as text running
                      // out of the bottom of the third card.
                      //
                      // Three lines, then an ellipsis, then "Read note" to see
                      // the whole thing. line-clamp needs display:-webkit-box
                      // with an orientation; every browser we target honours
                      // the prefixed form.
                      ...(view === 'grid' ? {
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      } : {})
                    }}>
                      {/* 14px body against the 17px heading. At 12px the note
                          text was smaller than the metadata line beneath it. */}
                      <RichBody
                        html={rest}
                        color="var(--text-body)"
                        size="var(--text-lg)"
                        leading="var(--leading-normal)"
                        // In a card the body is clamped and "Read note" opens
                        // the full text, so a second toggle is redundant — and
                        // it took the line that pushed edit and delete out of
                        // the card.
                        showPlainToggle={view !== 'grid'}
                      />
                    </div>
                  )}

                  {/* Only when there IS more to read — a two-line note needs
                      no "read more", and offering one would be a control that
                      shows what is already on screen. */}
                  {/* Measured on the TEXT, not the HTML. rest.length counts
                      markup, so a short note wrapped in tags could cross the
                      threshold while a long plain one fell under it — the
                      opposite of what the reader needs. ~3 lines at this width
                      is roughly 120 characters. */}
                  {/* ~90 characters is about three lines at this width, which
                      is exactly where the clamp bites. At 120 the "asdf" note
                      — 55 characters of text that still wraps to three lines
                      once formatted — was clamped with no way to read the
                      rest. Better to offer the link a little early than to
                      hide text behind an ellipsis with no way out. */}
                  {view === 'grid' && htmlToText(rest || '').length > 90 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setReading(n) }}
                      style={{
                        alignSelf: 'flex-start', marginTop: 2,
                        border: 'none', background: 'none', padding: 0,
                        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
                        fontWeight: 600, color: 'var(--text-link)',
                        cursor: 'pointer'
                      }}
                    >
                      Read note
                    </button>
                  )}

                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', marginTop: 4 }}>
                    {[n.author, relativeTime(n.createdAt)].filter(Boolean).join(' · ')}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex', gap: 6, flexWrap: 'wrap',
                    justifyContent: view === 'grid' ? 'flex-start' : 'flex-end',
                    alignItems: 'center'
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
                    empty={!n.deal}
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
        </div>

        {!loading && notes.length > 0 && (
          <LoadMore
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            count={notes.length}
            noun="note"
          />
        )}
      </div>

      {editor && (
        <NoteEditor
          note={editor.note}
          contacts={editor.note?.contact ? [editor.note.contact] : []}
          // There is no deal in scope on this page, so the rep picks one. The
          // lists load on the first editor open, not on page load.
          deals={linkTargets.deals}
          businesses={linkTargets.businesses}
          onClose={() => setEditor(null)}
          onSaved={(saved, applied) => {
            if (editor.note && saved) {
              // Apply what the CRM echoed, not what we sent.
              patchItem((x) => x.id === editor.note.id, {
                body: saved.body ?? editor.note.body,
                title: saved.title ?? null,
                color: saved.color ?? null,
                pinned: saved.pinned === true,
                // The company, which the CRM echoes back on the note.
                //
                // Missing here, reopening the editor showed the OLD company
                // however well the save went: our row only catches up when
                // the NoteUpdate webhook lands a second or two later, and the
                // list still held the pre-save copy until then.
                //
                // `applied` is what the editor actually sent, used in
                // preference to the echo: GHL's note PUT is not confirmed to
                // return businessId, and trusting an absent field would blank
                // a company the rep just chose. Falls back to the echo, then
                // to the row's existing value.
                businessId: applied && 'businessId' in applied
                  ? applied.businessId
                  : (saved.businessId ?? editor.note.businessId ?? null)
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

      {/* READER — the whole note, rendered as it was written.
          A clamped card shows three lines; this is where the rest lives.
          Read-only: editing is the pencil, and a modal that both shows
          and edits invites a rep to type into what they meant to read. */}
      {reading && (
        <NoteReader note={reading} onClose={() => setReading(null)} />
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


// A note, full text, in a modal.
//
// Portalled for the same reason every other overlay here is: the list sits
// inside a bordered surface with its own overflow, which would clip this.
function NoteReader({ note, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const derived = splitNote(note.body)
  const heading = note.title || derived.title
  const rest = note.title ? note.body : derived.rest

  return createPortal(
    // .pp-portal — tokens and the icon font are scoped to [data-dealhub].
    <div
      className="pp-portal"
      role="dialog"
      aria-modal="true"
      aria-label={heading || 'Note'}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)'
      }}
    >
      <div style={{
        width: 'min(720px, 100%)', maxHeight: '80vh',
        background: 'var(--surface-card)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.18)'
      }}>
        <header style={{
          flex: 'none',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 'var(--space-3)', padding: 'var(--space-4)',
          borderBottom: '1px solid var(--border-default)'
        }}>
          <h2 style={{
            margin: 0, fontSize: 'var(--text-xl)', fontWeight: 600,
            color: 'var(--text-heading)', letterSpacing: '-0.01em',
            overflowWrap: 'anywhere'
          }}>
            {heading || 'Note'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, flex: 'none',
              border: '1px solid var(--border-default)', borderRadius: '50%',
              background: 'transparent', color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>close</span>
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
          {rest
            ? (
              <RichBody
                html={rest}
                color="var(--text-body)"
                size="var(--text-lg)"
                leading="var(--leading-normal)"
              />
            )
            : (
              <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: 'var(--text-lg)' }}>
                This note has no body.
              </p>
            )}
        </div>

        <footer style={{
          flex: 'none', padding: 'var(--space-3) var(--space-4)',
          borderTop: '1px solid var(--border-default)',
          fontSize: 'var(--text-base)', color: 'var(--text-muted)'
        }}>
          {[note.author, relativeTime(note.createdAt)].filter(Boolean).join(' · ')}
        </footer>
      </div>
    </div>,
    document.body
  )
}
