import React, { useMemo, useState } from 'react'
import { RichBody, StateMessage, AttachmentCount } from '../shared/ListChrome'
import { htmlToText } from '../../utils/sanitiseHtml'
import AttachmentChip, { accentVar } from './AttachmentChip'
import EmailThreadModal from './EmailThreadModal'
import { noteColourStyle } from '../../utils/noteColour'

// One deal's merged message timeline.
//
// Row framing:
//   • the LEFT gutter square = the channel (email / sms / whatsapp / …)
//   • the CARD's top + bottom stripes = the channel accent (frames the row)
//   • the SENDER accent shows as a coloured dot beside the name
//   • the DEAL TAG lives on the bottom stripe as a pill footer
//
// The person filter narrows the merged thread (rule 7) but never splits it —
// group messages stay visible under every recipient, so filtering here is a
// simple boolean check per row, not a de-duplication.

const CH_LABEL = {
  EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp', IMESSAGE: 'iMessage',
  CALL: 'Call', NOTE: 'Note', ANALYSIS: 'Analysis', TASK: 'Task', SYSTEM: 'System',
}

// An email in the timeline: subject, one preview line, expand for the rest.
//
// WHY IT NEEDS ITS OWN COMPONENT. Everything else here is a short message — an
// SMS, a WhatsApp line, a call summary — and a chat bubble suits all of them.
// An email is a document: GHL's payload for a three-paragraph update is 2KB of
// nested markup. Rendered as a bubble it pushed every surrounding row off
// screen, and the subject — the one thing a reader scans a mail list for — was
// not shown at all, because `subject` has been stored since migration 031 and
// the timeline query never selected it.
//
// DISPLAY ONLY, per the request. No reply, no forward: sending mail writes to
// GHL through a conversation-provider path this app does not have, and a
// button opening a composer we cannot send from is worse than no button.
// Group the timeline's emails by thread.
//
// Built once per message list and handed down, rather than each row scanning
// its siblings: a 200-row timeline would otherwise do 200 passes over 200
// rows on every render.
//
// Only threads with MORE THAN ONE message are returned. A thread of one is
// just an email — offering "1 in thread" on it would be a control that opens
// a dialog showing what the row already shows.
//
// Keyed by thread_id, which messageWriter reads from event.threadId. Emails
// without one (older syncs, or a channel that does not thread) simply never
// appear here and render as plain rows.
function buildThreads(list) {
  const byThread = new Map()
  for (const m of list) {
    if (m.channel !== 'EMAIL' || !m.threadId) continue
    const arr = byThread.get(m.threadId)
    if (arr) arr.push(m); else byThread.set(m.threadId, [m])
  }
  for (const [id, arr] of byThread) {
    if (arr.length < 2) byThread.delete(id)
  }
  return byThread
}

function EmailBody({ m, thread, onOpenThread, onJumpAttachment }) {
  const [open, setOpen] = useState(false)

  // THE BODY IS HTML, not text.
  //
  // cleanMessageBody on the server runs cleanEmail for this channel, which
  // strips the <head>, the <style> block and the inline font stacks — but it
  // KEEPS the tags: a three-paragraph email arrives as
  // `<div><p>…</p><p>…</p></div>`. Verified against the real webhook payload.
  // So it renders through RichBody (which sanitises, the single audited
  // innerHTML site) — as text it would show literal <p> tags to the rep.
  //
  // And the preview needs htmlToText, not textContent: textContent fuses
  // block boundaries, turning `<p>Hi</p><p>Thanks</p>` into "HiThanks". That
  // exact bug has bitten this codebase twice.
  const preview = useMemo(() => htmlToText(m.body || ''), [m.body])

  // Worth showing once expanded: on a deal with three contacts, "which of
  // these people did we actually email" is the question, and the row's sender
  // name does not answer it. Absent on older rows — the addresses come from
  // raw_message, which early syncs did not always store.
  const hasAddresses = m.emailFrom || m.emailTo

  const threaded = thread && thread.length > 1

  // Email attachments. Empty for every email synced before the server started
  // fetching them, so every use below has to tolerate none.
  const atts = Array.isArray(m.attachments) ? m.attachments : []
  const attTitle = atts.length
    ? `${atts.length} ${atts.length === 1 ? 'file' : 'files'}: ${atts.map((a) => a.name).join(', ')}`
    : undefined

  return (
    <div className="pp-email" style={{ marginTop: 4 }}>
      {/* A 3-COLUMN, 2-ROW GRID over the whole card head.
          Row 1: icon | subject | chip + chevron
          Row 2: (icon gutter) | preview spanning to the card's right edge
          Why not simply nest the chip next to the subject: it has to stay
          outside the expander <button> (a button inside a button is invalid
          HTML, and the inner click would also fire the expander). And why the
          preview is a grid child rather than living inside the expander with
          the subject: as a sibling of the subject inside one column, it was
          confined to that column's width, so the card read as a narrow text
          column with a chip beside it. On its own row it runs the full width
          and the chip belongs to the subject line alone.
          The expander is a transparent overlay across rows 1-2 of the text
          columns, so clicking anywhere on the text still toggles the email
          while the chip stays independently clickable. */}
      <div className="pp-email-bar">
        <span className="ms pp-email-icon">mail</span>

        <span className="pp-email-subject">
          {m.subject || '(no subject)'}
        </span>

        {/* ATTACHMENT COUNT, collapsed view.
            An email's files are the reason a rep opens it — "did the quote
            actually go out" — so the count belongs on the closed row. It is
            only a count here: names and sizes need the width of the expanded
            body, and three filenames on the subject line would push the
            subject itself out of view.
            These arrive because the server FETCHES them: an outbound email
            webhook always sends attachments: null, so messageWriter calls
            GET /conversations/messages/:id at ingest. */}
        {atts.length > 0 && (
          <span className="pp-email-clip" title={attTitle}>
            <span className="ms" style={{ fontSize: 13 }}>attach_file</span>
            {atts.length}
          </span>
        )}

        {threaded && (
          <button
            type="button"
            className="pp-email-thread"
            onClick={() => onOpenThread(m)}
            title={`Show all ${thread.length} messages in this thread`}
          >
            <span className="ms" style={{ fontSize: 14 }}>forum</span>
            {thread.length} in thread
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse this email' : 'Show the full email'}
          title={open ? 'Collapse this email' : 'Show the full email'}
          className="pp-email-chevbtn"
        >
          <span className="ms pp-email-chev">
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {/* One preview line while collapsed, so the row says what the mail is
            about without opening it. Hidden when open — repeating the first
            line directly above the full body reads as a bug. */}
        {!open && preview && (
          <span className="pp-email-preview">{preview}</span>
        )}

        {/* The click target for expanding: covers the text, sits UNDER the
            chip in z-order so the chip wins its own clicks. Empty and
            transparent — it is a hit area, not a visual element. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse this email' : 'Show the full email'}
          title={open ? 'Collapse this email' : 'Show the full email'}
          className="pp-email-hit"
        />
      </div>

      {open && (
        <div className="pp-email-full">
          {hasAddresses && (
            <div className="pp-email-addr">
              {m.emailFrom && (
                <span><span className="pp-email-addr-k">From</span>{m.emailFrom}</span>
              )}
              {m.emailTo && (
                <span><span className="pp-email-addr-k">To</span>{m.emailTo}</span>
              )}
            </div>
          )}
          <RichBody
            html={m.body}
            color="var(--text-body)"
            size="var(--text-md)"
            leading="var(--leading-normal)"
            maxWidth={680}
          />

          {/* THE FILES THEMSELVES, once expanded.
              Named and sized here rather than counted: at this width a rep can
              see that "quote-v3.pdf" went out and not "quote-v2.pdf", which is
              the actual question. Below the body because that is the reading
              order of an email, and separated by a rule so a long body does
              not run straight into them. */}
          {atts.length > 0 && (
            <div className="pp-email-atts">
              <span className="pp-email-atts-h">
                <span className="ms" style={{ fontSize: 14 }}>attach_file</span>
                {atts.length} {atts.length === 1 ? 'attachment' : 'attachments'}
              </span>
              <div className="pp-email-atts-list">
                {atts.map((att, i) => (
                  <AttachmentChip
                    key={`${att.name}-${i}`}
                    att={att}
                    channelAccent={m.channelAccent}
                    onClick={() => onJumpAttachment && onJumpAttachment(att)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compact one-line renderer for system events and TYPE_ACTIVITY_* rows
// (opp created, task completed, invoice paid, etc). No card, no checkbox,
// just a thin line with icon + label + date on the spine.
// One header per day, sticky so the date stays visible while you scroll that
// day's messages. Replaces the per-row date gutter, which printed "19 Aug"
// three times for messages minutes apart.
// "16:59". The day header carries the date, so each row only needs its time.
function formatClock(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function DayHeader({ iso }) {
  const d = new Date(iso)
  const label = (() => {
    if (Number.isNaN(d.getTime())) return 'Unknown date'
    const now = new Date()
    const startOf = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
    const days = Math.round((startOf(now) - startOf(d)) / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const yr = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`
    return `${d.getDate()} ${M[d.getMonth()]}${yr}`
  })()

  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 1,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--gray-50)',
        fontSize: 'var(--text-sm)', fontWeight: 600,
        color: 'var(--text-muted)'
      }}
    >
      {label}
    </div>
  )
}

function sameDay(a, b) {
  if (!a || !b) return false
  const x = new Date(a), y = new Date(b)
  if (Number.isNaN(x.getTime()) || Number.isNaN(y.getTime())) return false
  return x.getFullYear() === y.getFullYear()
    && x.getMonth() === y.getMonth()
    && x.getDate() === y.getDate()
}

// ── Rows ──────────────────────────────────────────────────────────────
//
// Every row — message, note, task, event — sits on ONE grid:
//
//   [ select ] [ icon ] [ content ......................... ] [ time ]
//
// so the left edges line up all the way down and the eye can scan a single
// column. Separated by hairlines rather than boxed as cards: at card weight a
// twenty-message thread was six rows per screen and a wall of coloured
// stripes, when what a rep needs is to read the thread quickly.

const ROW_GRID = '26px 30px minmax(0, 1fr) auto'

// Shared row frame. `tone` shifts the background for the non-message kinds so
// a note doesn't read as something the customer said.
function Row({ id, children, highlighted, tone, dim }) {
  return (
    <div
      id={id}
      style={{
        display: 'grid',
        gridTemplateColumns: ROW_GRID,
        gap: 'var(--space-2)',
        alignItems: 'start',
        padding: '9px 12px',
        borderBottom: '1px solid var(--border-default)',
        background: highlighted
          ? 'var(--tint-gold)'
          : tone === 'internal' ? 'var(--gray-25)' : 'transparent',
        opacity: dim ? 0.6 : 1,
        transition: 'background 0.4s ease-out'
      }}
    >
      {children}
    </div>
  )
}

// The channel/kind icon. Colour carries the channel; there is no stripe, box or
// tint behind it, so six SMS rows no longer read as a wall of orange.
function RowIcon({ icon, colour, title, tint = null }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, marginTop: 1,
        borderRadius: 'var(--radius-sm)',
        // `tint` is ONLY passed for a note whose author actually set a colour
        // — see the note on EntryRow. The neutral gray-50 default is what
        // keeps six SMS rows from reading as a wall of orange, so this stays
        // an exception rather than becoming the rule.
        background: tint || 'var(--gray-50)',
        // On a pastel tint the channel accent loses contrast, so the glyph
        // goes dark. Only a normalised hex ever reaches here.
        color: tint ? 'var(--text-heading)' : colour
      }}
    >
      <span className="ms" style={{ fontSize: 16 }}>{icon}</span>
    </span>
  )
}

function SelectBox({ selected, onToggle, title }) {
  if (!onToggle) return <span />
  return (
    <input
      type="checkbox"
      checked={!!selected}
      onChange={onToggle}
      title={title}
      style={{
        width: 16, height: 16, marginTop: 6,
        accentColor: 'var(--brand-primary)', cursor: 'pointer'
      }}
    />
  )
}

function RowTime({ ts }) {
  return (
    <span
      style={{
        marginTop: 3, flex: 'none',
        fontSize: 'var(--text-sm)', color: 'var(--text-faint)',
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {formatClock(ts)}
    </span>
  )
}

// A system event. Same grid, but muted and single-line — it's background, not
// something anyone said.
function EventRow({ m }) {
  const label = m.eventLabel || m.channel || 'Event'
  const body = m.body || ''
  const text = body
    ? (body.toLowerCase().startsWith(label.toLowerCase()) ? body : `${label} · ${body}`)
    : label

  return (
    <Row id={`tl-${m.id}`} dim>
      <span />
      <RowIcon icon={m.channelIcon || 'info'} colour="var(--text-faint)" title="Event" />
      <span
        style={{
          marginTop: 4,
          fontSize: 'var(--text-md)', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}
      >
        {text}
      </span>
      <RowTime ts={m.ts} />
    </Row>
  )
}
// What to call this message's channel.
//
// A message routed through a CUSTOM conversation provider (goghl.ai's WhatsApp,
// say) arrives with channel 'CUSTOM' — which told a rep nothing about what they
// were looking at. Name the provider when there is one.
function channelLabelOf(m) {
  if (m.channel === 'CUSTOM' && m.providerName) return m.providerName
  return CH_LABEL[m.channel] || m.channel
}

function MessageRow({ m, highlighted, onJumpAttachment, selected, onToggleSelect, thread, onOpenThread }) {
  const channelCol = accentVar(m.channelAccent)
  const senderCol = accentVar(m.senderAccent)
  const inbound = m.direction === 'inbound'
  const outbound = m.direction === 'outbound'
  const many = m.toIds && m.toIds.length > 1

  return (
    <Row id={`tl-${m.id}`} highlighted={highlighted} dim={m.imported}>
      <SelectBox
        selected={selected}
        onToggle={() => onToggleSelect && onToggleSelect(m)}
        title={
          selected
            ? 'Selected — the agent reads this message'
            : 'Not selected — the agent skips this message'
        }
      />
      <RowIcon
        icon={m.channelIcon}
        colour={channelCol}
        title={channelLabelOf(m)}
      />

      <div style={{ minWidth: 0 }}>
        {/* One header line: who, which way, on what. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            flexWrap: 'wrap', marginBottom: 1
          }}
        >
          <span
            aria-hidden
            style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: senderCol }}
          />
          <span
            style={{
              fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
          >
            {m.senderName}
          </span>
          <span
            style={{
              fontSize: 'var(--text-sm)', fontWeight: 600,
              color: inbound ? 'var(--accent-pine-text)' : 'var(--text-faint)'
            }}
          >
            {inbound ? 'In' : outbound ? 'Out' : ''}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {channelLabelOf(m)}
          </span>

          {m.ambiguous && (
            <span
              title="This contact has more than one open deal, so this message's filing is a guess"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--text-sm)', fontWeight: 600,
                color: 'var(--accent-gold-text)'
              }}
            >
              <span className="ms" style={{ fontSize: 13 }}>help</span>
              Which opportunity?
            </span>
          )}
          {many && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
              to {m.toIds.length} people
            </span>
          )}
        </div>

        {m.isCall && !m.body && (
          <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
            Call · {m.callDurationMin ? `${m.callDurationMin} min` : 'unknown length'}
            {' · '}no transcript, so the agent cannot read it
          </span>
        )}

        {/* EMAIL gets its own treatment. An email is not a chat message:
            it has a subject, addressed recipients, and a body that runs to
            paragraphs. Rendered as a plain message it swamped the SMS and
            call rows around it — a 400-word project update pushed everything
            else off screen.
            Collapsed to subject + one preview line, expanding on click. */}
        {m.channel === 'EMAIL' && m.body ? (
          <EmailBody
            m={m}
            thread={thread}
            onOpenThread={onOpenThread}
            onJumpAttachment={onJumpAttachment}
          />
        ) : m.body ? (
          <div
            style={{
              fontSize: 'var(--text-md)', lineHeight: 'var(--leading-snug)',
              color: 'var(--text-body)',
              whiteSpace: 'pre-line', overflowWrap: 'anywhere'
            }}
          >
            {m.body}
          </div>
        ) : null}

        {/* NOT for email: EmailBody renders those inside the card, as a count
            when collapsed and as chips when expanded. Rendering them here too
            would show every file twice, and outside the card they would read
            as belonging to the row rather than to the email. */}
        {m.channel !== 'EMAIL' && m.attachments?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
            {m.attachments.map((att, i) => (
              <AttachmentChip
                key={`${att.name}-${i}`}
                att={att}
                channelAccent={m.channelAccent}
                onClick={() => onJumpAttachment && onJumpAttachment(att)}
              />
            ))}
          </div>
        )}
      </div>

      <RowTime ts={m.ts} />
    </Row>
  )
}

// Notes and tasks: the same row, on a tinted ground so an internal record is
// distinguishable from something the customer said.
function EntryRow({ m, highlighted, selected, onToggleSelect }) {
  const col = accentVar(m.channelAccent)
  const isNote = m.kind === 'note'
  // A note's own colour, when its author set one.
  //
  // ON THE ICON SQUARE ONLY, deliberately. The rail gives a coloured note a
  // left edge stripe, but the rail is a short list of notes; this timeline
  // interleaves them with messages, tasks and events on one grid, and its
  // rows carry no stripes precisely so a long thread does not read as a wall
  // of colour (see the comment above ROW_GRID). Tinting the 26px square that
  // is already there says the same thing without breaking that.
  const noteCol = isNote ? noteColourStyle(m.color) : { tint: null, name: null }

  return (
    <Row id={`tl-${m.id}`} highlighted={highlighted} tone="internal" dim={m.imported}>
      {/* Notes and tasks are evidence the agent reads (rule 7), so they get the
          same selection control as a message. Before this a rep could deselect
          a message but not the note beside it. */}
      <SelectBox
        selected={selected}
        onToggle={() => onToggleSelect && onToggleSelect(m)}
        title={
          selected
            ? `Selected — the agent reads this ${isNote ? 'note' : 'task'}`
            : `Not selected — the agent skips this ${isNote ? 'note' : 'task'}`
        }
      />
      <RowIcon
        icon={m.channelIcon}
        colour={col}
        tint={noteCol.tint}
        title={
          noteCol.name
            ? `${noteCol.name} note`
            : (isNote ? 'Note' : 'Task')
        }
      />

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            flexWrap: 'wrap', marginBottom: 1
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-sm)', fontWeight: 600,
              letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase', color: col
            }}
          >
            {isNote ? 'Note' : 'Task'}
          </span>
          {isNote && m.isAi && <Badge tone="sky" icon="auto_awesome">AI note</Badge>}
          {/* GHL omits attachments from note webhooks, so noteWriter fetches
              GET /notes/:id and the server counts them out of raw_note. */}
          {isNote && <AttachmentCount count={m.attachmentCount} />}
          {!isNote && m.status === 'completed' && <Badge tone="pine" icon="check">Done</Badge>}
          {!isNote && m.overdue && m.status !== 'completed' && (
            <Badge tone="rose" icon="schedule">Overdue</Badge>
          )}
        </div>

        <div
          style={{
            fontSize: 'var(--text-md)', fontWeight: 600,
            lineHeight: 'var(--leading-snug)', color: 'var(--text-heading)'
          }}
        >
          {m.title || (isNote ? 'Note' : 'Task')}
        </div>

        {/* The most read-heavy text on the page — a customer's note runs to a
            paragraph or more. 14px on the body against 13px on the title's row
            of metadata, and text-body rather than muted: at 13px muted it was
            the smallest, faintest thing on screen while being the thing you
            actually came to read. */}
        {m.body && (
          <div style={{ marginTop: 3 }}>
            <RichBody
              html={m.body}
              color="var(--text-body)"
              size="var(--text-lg)"
              leading="var(--leading-normal)"
              maxWidth={720}
            />
          </div>
        )}

        <div style={{ marginTop: 3, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          {[
            isNote
              ? (m.senderName ? `by ${m.senderName}` : null)
              : (m.assignee ? `assigned to ${m.assignee}` : 'unassigned'),
            !isNote && m.duePhrase ? `due ${m.duePhrase}` : null,
            m.manual ? 'added manually' : null
          ].filter(Boolean).join(' · ')}
        </div>
      </div>

      <RowTime ts={m.ts} />
    </Row>
  )
}

function Badge({ children, tone, icon }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px',
        borderRadius: 'var(--radius-pill)',
        background: `var(--tint-${tone})`,
        color: `var(--accent-${tone})`,
        fontSize: 'var(--text-sm)', fontWeight: 600, whiteSpace: 'nowrap'
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 13 }}>{icon}</span>}
      {children}
    </span>
  )
}


export default function Timeline({
  messages,
  highlightedId = null,
  onJumpAttachment,
  onToggleSelect,
  onSelectAll,
  // Empty-state wording depends on WHY the list is empty, and only the caller
  // knows: it holds the unfiltered set and the active filters. `totalCount` is
  // every row before filtering; `filtersActive` says chips are narrowing it.
  totalCount = null,
  filtersActive = false,
  onClearFilters = null,
}) {
  // The header counts each kind separately — tasks and notes now share the
  // stream, and folding them into "23 messages" would overstate the thread.
  const msgCount = messages.filter((m) => !m.kind && !m.event).length
  const taskCount = messages.filter((m) => m.kind === 'task').length
  const noteCount = messages.filter((m) => m.kind === 'note').length
  const unreadable = messages.filter((m) => !m.kind && !m.event && !m.readable).length
  const peopleCount = new Set(
    messages.map((m) => m.senderId).filter(Boolean)
  ).size

  // Email threads, indexed once for the whole list — see buildThreads.
  const threads = useMemo(() => buildThreads(messages), [messages])

  // The email whose thread is open in the dialog, or null. Holding the MESSAGE
  // rather than the thread id keeps track of which row was clicked, so the
  // dialog can open that message expanded as well as the newest.
  const [threadOf, setThreadOf] = useState(null)

  // The dialog reads from `threads`, so a re-sync that drops the clicked
  // message would otherwise leave a dialog with nothing in it.
  const openThread = threadOf ? threads.get(threadOf.threadId) : null

  // Everything the agent can read: messages, notes and tasks. Events are
  // excluded — a "stage changed" row has no content to cite.
  const selectable = messages.filter((m) => !m.event)
  const selectedCount = selectable.filter((m) => m.included !== false).length
  const allSelected = selectable.length > 0 && selectedCount === selectable.length
  const someSelected = selectedCount > 0

  const summary = [
    // "18 of 20 selected" when some are excluded — the number that decides what
    // the agent reads, so it belongs in the header rather than being something
    // you count by eye.
    selectedCount === selectable.length
      ? `${msgCount} ${msgCount === 1 ? 'message' : 'messages'}`
      // Counts every readable item, not just messages — a deselected note is
      // as much a gap in the answer as a deselected message.
      : `${selectedCount} of ${selectable.length} selected`,
    taskCount ? `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}` : null,
    noteCount ? `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` : null,
    unreadable ? `${unreadable} ${unreadable === 1 ? 'call' : 'calls'} unreadable` : null,
    `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`
  ].filter(Boolean).join(' · ')

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-teal-text)',
        ['--panel-tint']: 'var(--tint-teal)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: '13px var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--panel-tint, var(--gray-25))',
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)' }}>forum</span>
        <h3
          style={{
            fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--accent-teal)',
            margin: 0, flex: 1,
          }}
        >
          Timeline
        </h3>
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{summary}</span>
      </header>

      {/* A bar that says what the checkboxes are for. They were unlabelled, so
          nothing on screen explained that ticking one changes what the agent
          reads.

          Hidden when there is nothing to tick: a "select every message"
          checkbox above an empty list is a control that cannot do anything,
          and it was the only thing rendered on an empty timeline. */}
      {selectable.length > 0 && (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--gray-25)'
        }}
      >
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
          onChange={() => onSelectAll && onSelectAll(!allSelected)}
          disabled={!onSelectAll}
          title={allSelected ? 'Deselect every message' : 'Select every message'}
          style={{
            width: 16, height: 16,
            accentColor: 'var(--brand-primary)',
            cursor: onSelectAll ? 'pointer' : 'default'
          }}
        />
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Ticked messages are the ones Co-Pilot reads
        </span>
      </div>
      )}

      {/* Empty states. messages.map over [] rendered NOTHING, so an empty
          timeline was a header above a large blank panel — the one place in the
          app that looked broken rather than empty.

          Three cases, because they need different words and only one is
          actionable:
            filters hide everything → offer to clear them
            nothing on the deal yet → explain what will appear here
            (a deal with rows) → the list
          `totalCount` is null when the caller doesn't pass it, in which case
          we can't tell the two apart and give the neutral wording. */}
      {messages.length === 0 ? (
        <StateMessage
          empty
          inline
          emptyIcon={filtersActive ? 'filter_alt_off' : 'forum'}
          emptyTitle={filtersActive ? 'Nothing matches those filters' : 'No conversation yet'}
          emptyText={
            filtersActive
              ? totalCount
                ? `This deal has ${totalCount} ${totalCount === 1 ? 'row' : 'rows'}, but none match what you've selected above.`
                : 'Try selecting fewer chips above.'
              : 'Messages, notes, tasks and stage changes will appear here as the deal progresses.'
          }
          action={filtersActive && onClearFilters ? (
            <button
              onClick={onClearFilters}
              style={{
                height: 34, padding: '0 14px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                fontWeight: 600, color: 'var(--text-heading)',
                cursor: 'pointer'
              }}
            >
              Clear filters
            </button>
          ) : null}
        />
      ) : (
      <div
        style={{
          position: 'relative',
          // Sticky day headers need a scroll container to stick within.
          maxHeight: 620, overflowY: 'auto'
        }}
      >
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null
          const newDay = !prev || !sameDay(prev.ts, m.ts)
          return (
            <React.Fragment key={m.id}>
              {newDay && m.ts && <DayHeader iso={m.ts} />}
              {m.kind === 'task' || m.kind === 'note' ? (
                <EntryRow
                  m={m}
                  highlighted={highlightedId === m.id}
                  selected={m.included !== false}
                  onToggleSelect={onToggleSelect}
                />
              ) : m.event ? (
                <EventRow m={m} />
              ) : (
                <MessageRow
                  m={m}
                  highlighted={highlightedId === m.id}
                  onJumpAttachment={onJumpAttachment}
                  // undefined for anything that isn't a multi-message email
                  // thread, which is what suppresses the affordance.
                  thread={m.threadId ? threads.get(m.threadId) : undefined}
                  onOpenThread={setThreadOf}
                  // Absence of a flag means selected: a newly-synced message
                  // defaults IN, matching message_ai_exclusions (migration 051),
                  // which stores exclusions rather than inclusions.
                  selected={m.included !== false}
                  onToggleSelect={onToggleSelect}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
      )}

      {openThread && openThread.length > 1 && (
        <EmailThreadModal
          messages={openThread}
          initialId={threadOf.id}
          subject={threadOf.subject}
          onClose={() => setThreadOf(null)}
        />
      )}
    </section>
  )
}
