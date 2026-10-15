import React, { useEffect, useMemo, useState } from 'react'
import PanelHead from './PanelHead'
import { RichBody, StateMessage, AttachmentCount, Truncate, formatDue } from '../shared/ListChrome'
import AttachmentChip, { accentVar } from './AttachmentChip'
import AttachmentViewer from './AttachmentViewer'
import EmailThreadModal from './EmailThreadModal'
import EmailBody from './EmailBody'
import MessageDealPill from './MessageDealPill'
import { noteColourStyle } from '../../utils/noteColour'
import { htmlToText } from '../../utils/sanitiseHtml'

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

// The soft fill behind a row's icon square and the darker accent that reads
// on it. accentVar gives the bare accent, which is fine for a glyph on
// gray-50 and NOT fine on its own tint — sky on tint-sky is 4.13:1, below AA.
// The -text variants exist for exactly this.
function tintVar(accent) {
  return !accent || accent === 'gray' ? 'var(--gray-50)' : `var(--tint-${accent})`
}
function accentTextVar(accent) {
  return !accent || accent === 'gray' ? 'var(--text-muted)' : `var(--accent-${accent}-text)`
}

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
        // A heading, not a caption: the design sets the day in the heading
        // colour at body size, on a grey band with room around it.
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--gray-50)',
        fontSize: 'var(--text-md)', fontWeight: 600,
        color: 'var(--text-heading)'
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

// 20px tick · 36px icon square · content · time
const ROW_GRID = '20px 36px minmax(0, 1fr) auto'

// Shared row frame. `tone` shifts the background for the non-message kinds so
// a note doesn't read as something the customer said.
// `dim` is now used ONLY by the event row (stage changes, assignments), which
// sits behind real conversation on purpose.
//
// Messages and notes used to dim on `m.imported` — true for anything a sync
// sweep pulled in rather than a live webhook. That is a distinction the app
// cares about and a rep does not: a backfilled email is just an email, and
// fading it made whole days of history look disabled. The field is still
// returned; it is simply not a visual state any more.
function Row({ id, children, highlighted, tone, dim }) {
  return (
    <div
      id={id}
      style={{
        display: 'grid',
        gridTemplateColumns: ROW_GRID,
        gap: 'var(--space-3)',
        alignItems: 'start',
        padding: '16px',
        borderBottom: '1px solid var(--border-default)',
        // Every row on white. `tone="internal"` used to put notes and tasks
        // on gray-25 so an internal record read apart from the customer's
        // words; the design keeps one ground and lets the kind label and the
        // tinted icon square carry that distinction instead.
        background: highlighted ? 'var(--tint-gold)' : 'transparent',
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
// `soft` is the kind's own tint (tintVar) — the design fills every square
// with its channel's pastel. `tint` is still the note author's chosen colour
// and wins when present.
function RowIcon({ icon, colour, title, tint = null, soft = null }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36,
        borderRadius: 'var(--radius-md)',
        // `tint` is ONLY passed for a note whose author actually set a colour
        // — see the note on EntryRow. The neutral gray-50 default is what
        // keeps six SMS rows from reading as a wall of orange, so this stays
        // an exception rather than becoming the rule.
        background: tint || soft || 'var(--gray-50)',
        // On an author's pastel the channel accent loses contrast, so the
        // glyph goes dark. Only a normalised hex ever reaches here.
        color: tint ? 'var(--text-heading)' : colour
      }}
    >
      <span className="ms" style={{ fontSize: 18 }}>{icon}</span>
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
        width: 20, height: 20, marginTop: 8,
        accentColor: 'var(--brand-primary)', cursor: 'pointer'
      }}
    />
  )
}

// `inline` — when the time sits BESIDE something in a baseline-aligned flex
// row, rather than as a direct child of the top-aligned Row.
//
// The 3px nudge drops the time to the first text line of a row whose body box
// starts above its text. In a baseline-aligned row the browser already does
// that, so the nudge is 3px of double-counting.
function RowTime({ ts, inline = false }) {
  return (
    <span
      style={{
        marginTop: inline ? 0 : 3, flex: 'none',
        fontSize: 'var(--text-base)', color: 'var(--text-muted)',
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
    // Not dimmed. It is set in the muted colour, which is quiet enough;
    // fading the whole row on top made system events look disabled.
    <Row id={`tl-${m.id}`}>
      <span />
      <RowIcon icon={m.channelIcon || 'info'} colour="var(--text-body)" title="Event" />
      <Truncate style={{ marginTop: 7,
          fontSize: 'var(--text-lg)', color: 'var(--text-muted)' }}>
        {text}
      </Truncate>
      <RowTime ts={m.ts} />
    </Row>
  )
}
// What to call this message's channel.
//
// A message routed through a CUSTOM conversation provider arrives with channel
// 'CUSTOM' — which told a rep nothing about what they were looking at. Name the
// provider when there is one.
//
// The CUSTOM check alone was not enough. A location can run a custom provider
// named for the channel it serves ("WhatsApp QR" on WhatsApp, "SMS Android" on
// SMS): those normalise to WHATSAPP/SMS, not CUSTOM, so they fell through to
// the generic channel label and read exactly like a native send. Two different
// senders, one word on screen. Whenever a provider name is present and differs
// from the channel's own label, it is the more specific truth — show it.
function channelLabelOf(m) {
  const base = CH_LABEL[m.channel] || m.channel
  if (!m.providerName) return base
  // GHL's own senders (twilio_provider, mailgun_provider, smtp_provider_*) are
  // rows in the catalogue too, but they ARE the native path — labelling an SMS
  // "Twilio" would be noise, not disambiguation.
  if (m.providerIsNative) return base
  if (m.channel === 'CUSTOM') return m.providerName
  // A provider whose name merely restates the channel ("WhatsApp" on WhatsApp)
  // adds no information as a label — but it IS the ambiguous case, so mark it
  // rather than silently showing the same word a native send would show.
  const same = String(m.providerName).trim().toLowerCase() === String(base).trim().toLowerCase()
  return same ? `${base} (provider)` : m.providerName
}

function MessageRow({
  m, highlighted, onOpenAttachment, selected, onToggleSelect, thread, onOpenThread,
  // Attribution: which deal we are on, the other deals this contact has, and
  // what to do once a message has been moved.
  dealId, dealTargets, onMessageMoved
}) {
  const senderCol = accentVar(m.senderAccent)
  const inbound = m.direction === 'inbound'
  const outbound = m.direction === 'outbound'
  const many = m.toIds && m.toIds.length > 1

  return (
    <Row id={`tl-${m.id}`} highlighted={highlighted}>
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
        colour={accentTextVar(m.channelAccent)}
        soft={tintVar(m.channelAccent)}
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
          {/* DIRECTION AS AN ARROW, on the left.
              It was a coloured dot for the sender plus the word "In"/"Out"
              wedged between the name and the channel — a two-letter
              abbreviation in the middle of a sentence, easy to miss and easy
              to misread ("Out" beside "Email" scans as a compound noun).
              An arrow reads instantly at a glance and is the universal
              convention for message direction; the sender's colour moves
              onto it, so nothing is lost. */}
          <span
            className="ms"
            title={inbound ? 'Received from the customer' : 'Sent by us'}
            style={{
              flex: 'none', fontSize: 18,
              // INBOUND keeps the sender's own accent — that colour is how a
              // rep tells three customers apart down a long thread, and
              // dropping it to a generic green would lose that. Outbound is
              // always us, so it needs no per-person hue.
              color: inbound ? senderCol : 'var(--text-faint)'
            }}
          >
            {inbound ? 'south_west' : 'north_east'}
          </span>
          <Truncate style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-heading)' }}>
            {m.senderName}
          </Truncate>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
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
        {/* AN EMAIL ALWAYS GETS THE CARD, body or not.
            This was `m.channel === 'EMAIL' && m.body`, so an email with an
            empty body — GHL sends `<div></div>` when someone sends only an
            attachment — fell through to the plain branch, which also requires
            a body, and rendered NOTHING. The row showed a bare
            "Us · Out · Email" header with no subject, no attachment and no
            thread chip, while GHL displayed the image fine.
            The subject, the addresses, the attachments and the thread link
            are all worth showing on their own; the body is just one of them. */}
        {m.channel === 'EMAIL' ? (
          <EmailBody
            m={m}
            thread={thread}
            onOpenThread={onOpenThread}
            onOpenAttachment={onOpenAttachment}
          />
        ) : m.body ? (
          <div
            style={{
              fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-normal)',
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
                onClick={() => onOpenAttachment(m.attachments, i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Direction spelled out, then the time — ONE line, not two.
          Stacked, the label sat under the time and gave every row a second
          line of chrome, which on a dense timeline read as more prominent
          than the message itself. Inline it stays scannable down the column
          while costing the row no extra height.

          The label comes FIRST so the times still align on the right edge:
          "Outbound" and "Inbound" are different widths, and putting the
          variable-width element on the outside would leave the timestamps
          ragged. */}
      <span
        style={{
          // CENTER, not baseline.
          //
          // The deal pill is a bordered box; the label and time are bare
          // text. Baseline alignment lines up the TEXT INSIDE the pill with
          // its neighbours, which pushes the pill's box a couple of pixels
          // proud — and beside a tall email card that reads as the pill
          // having dropped onto its own line.
          //
          // nowrap as well: the pill plus "OUTBOUND 12:32" is wider than the
          // auto column wants to be, and this group must stay one line.
          display: 'flex', alignItems: 'center', gap: 6,
          flex: 'none', whiteSpace: 'nowrap', flexWrap: 'nowrap',
          // Aligned to the TOP of the row so it sits level with the first
          // line of the message, not floating beside the middle of a tall
          // email card.
          alignSelf: 'start'
        }}
      >
        {/* Attribution first, then direction, then the time.
            Reading right to left the time is the fixed anchor, direction is
            the fast scan, and the deal pill is the detail — so the pill goes
            on the OUTSIDE where it has room to be a control, and the times
            still align down the column. */}
        {dealId && m.messageId && (
          <MessageDealPill
            message={m}
            dealId={dealId}
            targets={dealTargets}
            onMoved={onMessageMoved}
          />
        )}
        {(inbound || outbound) && (
          <span
            style={{
              // A word, not a label: "Outbound" in sentence case at the
              // metadata size, as the design sets it — the tiny uppercase
              // version read as a tag rather than as a fact about the row.
              fontSize: 'var(--text-base)', fontWeight: 500,
              color: inbound ? 'var(--accent-pine-text)' : 'var(--text-muted)'
            }}
          >
            {inbound ? 'Inbound' : 'Outbound'}
          </span>
        )}
        <RowTime ts={m.ts} inline />
      </span>
    </Row>
  )
}

// Notes and tasks: the same row, on a tinted ground so an internal record is
// distinguishable from something the customer said.
function EntryRow({ m, highlighted, selected, onToggleSelect }) {
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
    <Row id={`tl-${m.id}`} highlighted={highlighted} tone="internal">
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
        colour={accentTextVar(m.channelAccent)}
        soft={tintVar(m.channelAccent)}
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
              // The -text accent, not the bare one: the design's NOTE is a
              // readable dark gold, and bare gold on white is 3.4:1.
              textTransform: 'uppercase', color: accentTextVar(m.channelAccent)
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
            fontSize: 'var(--text-lg)', fontWeight: 600,
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
          <div style={{ marginTop: 2 }}>
            {/* Snug leading: at 1.55 on 15px the kind label, title, body and
                meta line sat far enough apart to read as four items. */}
            <RichBody
              html={m.body}
              color="var(--text-body)"
              size="var(--text-lg)"
              leading="var(--leading-snug)"
              maxWidth={720}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            marginTop: 6, fontSize: 'var(--text-base)', color: 'var(--text-muted)'
          }}
        >
          <span>
            {[
              isNote
                ? (m.senderName ? `by ${m.senderName}` : null)
                : (m.assignee ? `assigned to ${m.assignee}` : 'unassigned'),
              // formatDue, not the server's duePhrase. That field came
              // through as the raw ISO date, so the row read "due
              // 2026-10-28" beside a design that says "due 29 Sep". The ISO
              // is on the row already; the house formatter also handles
              // today / tomorrow / N days ago the same way the Tasks tab does.
              !isNote && m.dueAt ? formatDue(m.dueAt) : null,
              m.manual ? 'added manually' : null
            ].filter(Boolean).join(' · ')}
          </span>
          {/* WHO IT IS FILED AGAINST. Both notes and tasks are stored against
              a contact in GHL, and this line named only the author or the
              assignee — neither of which answers "who is this about" on a
              deal with several people. */}
          {m.contact?.name && (
            <span
              title={`Filed against ${m.contact.name}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                maxWidth: '100%',
                height: 26, padding: '0 11px',
                borderRadius: 'var(--radius-pill)',
                // A BLUE OUTLINED CHIP, per the client's design — and the
                // same sky accent a contact already wears everywhere else in
                // the app (ContactChip, the People panel's band).
                //
                // It was a grey fill with muted text, which made the person
                // the row is filed against read as quieter than the row's own
                // metadata — the opposite of what it is. -text, not the bare
                // accent: sky on its own tint is 4.13:1, below AA.
                border: '1px solid var(--accent-sky)',
                background: 'var(--tint-sky)',
                fontWeight: 500, color: 'var(--accent-sky-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              <span className="ms" style={{ fontSize: 15, flex: 'none' }}>person</span>
              {m.contact.name}
            </span>
          )}
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


// AN EMAIL THREAD AS ONE CARD — the way GHL's conversation view shows it
// (client request, Oct 2026). A thread of three replies was three rows, each
// repeating the subject; now it is one card at the time of its LATEST reply:
//
//   ┌ how are you ─────────────────── 3 messages  ⤢  ▾ ┐
//   │            ⊕ 2 messages earlier                   │
//   │ ↗ J srini                                   11:15 │
//   │   sample third message in this thread…        ▾  │
//   └──────────────────────────────────────────────────┘
//
// Earlier replies fold behind "+ N messages earlier" and open INSIDE the card.
// ⤢ opens the thread dialog; ▾ collapses the card to its header. The timeline
// stays newest-first — only the grouping changed.
//
// Co-Pilot ticks: the card's own box ticks the whole thread; each reply keeps
// its own box once the earlier ones are shown.
function EmailThreadCard({
  thread, highlightedId, onToggleSelect, onOpenThread, onOpenAttachment
}) {
  // `thread` is oldest → newest; the newest is the card's anchor.
  const latest = thread[thread.length - 1]
  const earlier = thread.slice(0, -1)
  const [showEarlier, setShowEarlier] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  // Opened from a highlight (a Co-Pilot citation, a media jump) the cited
  // reply must be visible, not folded away.
  const highlightedEarlier = earlier.some((m) => m.id === highlightedId)
  useEffect(() => { if (highlightedEarlier) { setShowEarlier(true); setCollapsed(false) } }, [highlightedEarlier])

  const allSelected = thread.every((m) => m.included !== false)
  const toggleAll = () => {
    // Flip only the ones not already in the target state.
    for (const m of thread) {
      const sel = m.included !== false
      if (sel === allSelected) onToggleSelect && onToggleSelect(m)
    }
  }
  const subject = latest.subject || thread.find((m) => m.subject)?.subject || '(no subject)'

  const iconBtn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26, padding: 0, flex: 'none',
    border: 'none', borderRadius: 'var(--radius-sm)', background: 'none',
    color: 'var(--text-muted)', cursor: 'pointer'
  }

  // "+ N messages earlier", straddling a rule as GHL draws it. Shown on an
  // OPEN card above the latest reply, and on a COLLAPSED one under the
  // header — so a folded five-message thread still says it is five, not one.
  const earlierPill = (onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute', top: 0, left: '50%', zIndex: 1,
        transform: 'translate(-50%, -50%)',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 26, padding: '0 12px',
        border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-pill)',
        background: '#fff', fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-body)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
        whiteSpace: 'nowrap', cursor: 'pointer'
      }}
    >
      <span className="ms" style={{ fontSize: 15 }}>add</span>
      {earlier.length} {earlier.length === 1 ? 'message' : 'messages'} earlier
    </button>
  )

  return (
    <Row id={`tl-${latest.id}`} highlighted={thread.some((m) => m.id === highlightedId)}>
      <SelectBox
        selected={allSelected}
        onToggle={onToggleSelect ? toggleAll : null}
        title={allSelected ? 'Whole thread selected — the agent reads it' : 'Select the whole thread'}
      />
      <RowIcon
        icon={latest.channelIcon}
        colour={accentTextVar(latest.channelAccent)}
        soft={tintVar(latest.channelAccent)}
        title="Email thread"
      />
      <div style={{ minWidth: 0 }}>
        <div style={{
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden', background: '#fff'
        }}>
          <header style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px 8px 14px',
            background: 'var(--gray-50)',
            borderBottom: collapsed && !earlier.length ? 'none' : '1px solid var(--border-default)'
          }}>
            <span title={subject} style={{
              flex: 1, minWidth: 0,
              fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {subject}
            </span>
            <span style={{ flex: 'none', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              {thread.length} messages
            </span>
            <button type="button" onClick={() => onOpenThread(latest)} title="Open the whole thread" style={iconBtn}>
              <span className="ms" style={{ fontSize: 17 }}>open_in_full</span>
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              title={collapsed ? 'Show this thread' : 'Collapse this thread'}
              style={iconBtn}
            >
              <span className="ms" style={{ fontSize: 19 }}>{collapsed ? 'expand_more' : 'expand_less'}</span>
            </button>
          </header>

          {collapsed && earlier.length > 0 && (
            // Room for the pill's lower half under the header's rule.
            <div style={{ position: 'relative', height: 16 }}>
              {earlierPill(() => { setCollapsed(false); setShowEarlier(true) })}
            </div>
          )}

          {!collapsed && (
            <>
              {showEarlier && earlier.map((m) => (
                <ThreadReply
                  key={m.id}
                  m={m}
                  showBox
                  highlighted={m.id === highlightedId}
                  onToggleSelect={onToggleSelect}
                  onOpenAttachment={onOpenAttachment}
                />
              ))}
              {/* The latest reply carries the "+ N messages earlier" pill ON
                  ITS TOP EDGE — straddling the line between the header and
                  the reply, as GHL draws it — rather than in a row of its own,
                  which spent a whole line on one button. */}
              <div style={{ position: 'relative' }}>
                {earlier.length > 0 && !showEarlier && earlierPill(() => setShowEarlier(true))}
                <ThreadReply
                  m={latest}
                  showBox={showEarlier}
                  last
                  defaultOpen
                  // Room for the pill's lower half, so it never sits on the name.
                  roomForPill={earlier.length > 0 && !showEarlier}
                  highlighted={latest.id === highlightedId}
                  onToggleSelect={onToggleSelect}
                  onOpenAttachment={onOpenAttachment}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Row>
  )
}

// "12:06 PM" — GHL's thread rows use the 12-hour clock. The rest of the
// timeline keeps formatClock's 24-hour form.
function formatClock12(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// Who sent a reply. When the server could only say "Team member" (GHL left
// the sending user off the event), the email's own From display name —
// "EverGreen Junction <hello@…>" — is what GHL itself shows, so use it. A
// bare address carries no name, and the server's label stands.
function senderLabel(m) {
  const fallback = !m.senderName || m.senderName === 'Team member'
  if (fallback && typeof m.emailFrom === 'string') {
    const match = m.emailFrom.match(/^\s*"?([^"<]+?)"?\s*</)
    if (match && match[1].trim()) return match[1].trim()
  }
  return m.senderName || 'Team member'
}

// One reply inside a thread card — GHL's conversation row:
//
//   (JS) J srini                                    11:26 PM
//        fourth message test…
//
// Click the row to open it IN PLACE: "To: …", then the full message and its
// attachments, in the row itself rather than a bordered card inside the
// card. Click the header line again to fold it.
function ThreadReply({ m, showBox, last, roomForPill, highlighted, defaultOpen = false, onToggleSelect, onOpenAttachment }) {
  // The LATEST reply opens by default, as GHL shows a thread: the message you
  // are most likely to need is readable without a click; earlier ones fold.
  const [open, setOpen] = useState(defaultOpen)
  // A cited reply opens, so the quote is on screen.
  useEffect(() => { if (highlighted) setOpen(true) }, [highlighted])
  const inbound = m.direction === 'inbound'
  const preview = useMemo(() => htmlToText(m.body || ''), [m.body])
  const atts = Array.isArray(m.attachments) ? m.attachments : []
  const name = senderLabel(m)
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  const initials = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : (words[0] || '?').slice(0, 2).toUpperCase()
  const accent = m.senderAccent || 'gray'

  return (
    <div
      id={'tl-' + m.id}
      style={{
        padding: (roomForPill ? '18px' : '10px') + ' 14px 10px',
        borderBottom: last ? 'none' : '1px solid var(--border-default)',
        background: highlighted ? 'var(--tint-gold)' : '#fff'
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } }}
        title={open ? 'Fold this message' : 'Open this message'}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
      >
        {showBox && onToggleSelect && (
          <input
            type="checkbox"
            checked={m.included !== false}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(m)}
            title={m.included !== false ? 'Selected — the agent reads this reply' : 'Not selected — the agent skips this reply'}
            style={{ width: 15, height: 15, marginTop: 9, flex: 'none', accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
          />
        )}
        {/* The sender's initials, in their colour, with the direction on a
            small badge — GHL's avatar-with-channel-badge. */}
        <span style={{
          position: 'relative', flex: 'none',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: '50%',
          background: tintVar(accent), color: accentTextVar(accent),
          fontSize: 'var(--text-xs)', fontWeight: 700
        }}>
          {initials}
          <span
            className="ms"
            title={inbound ? 'Received from the customer' : 'Sent by us'}
            style={{
              position: 'absolute', right: -3, bottom: -3,
              fontSize: 12, padding: 1, borderRadius: '50%',
              background: '#fff', color: inbound ? accentVar(accent) : 'var(--text-faint)'
            }}
          >
            {inbound ? 'south_west' : 'north_east'}
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)' }}>
            {name}
          </span>
          {open ? (
            m.emailTo ? (
              <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                To: {m.emailTo}
              </span>
            ) : null
          ) : (
            <span style={{
              display: 'block', fontSize: 'var(--text-md)', color: 'var(--text-body)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {preview || (atts.length ? 'Attachment only' : '(no text)')}
            </span>
          )}
        </span>
        {atts.length > 0 && !open && (
          <span className="ms" title={atts.length + ' attachment' + (atts.length === 1 ? '' : 's')}
            style={{ flex: 'none', fontSize: 15, marginTop: 3, color: 'var(--text-muted)' }}>
            attach_file
          </span>
        )}
        <span style={{ flex: 'none', marginTop: 2, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {formatClock12(m.ts)}
        </span>
      </div>

      {open && (
        <div style={{ margin: '10px 0 2px', paddingLeft: showBox && onToggleSelect ? 67 : 42 }}>
          {preview ? (
            <RichBody
              html={m.body}
              color="var(--text-body)"
              size="var(--text-md)"
              leading="var(--leading-normal)"
              maxWidth={680}
            />
          ) : atts.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)' }}>
              This email has no message text.
            </p>
          ) : null}
          {atts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {atts.map((att, i) => (
                <AttachmentChip
                  key={(att.name || 'file') + '-' + i}
                  att={att}
                  channelAccent={m.channelAccent}
                  onClick={() => onOpenAttachment(atts, i)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Timeline({
  messages,
  highlightedId = null,
  // OPTIONAL. Nothing ever passed this — DealHubTab renders <Timeline> without
  // it — so every attachment chip in the timeline was a dead click. The
  // built-in viewer below is now the default, and a caller can still override
  // to do something else.
  onJumpAttachment = null,
  onToggleSelect,
  onSelectAll,
  // Empty-state wording depends on WHY the list is empty, and only the caller
  // knows: it holds the unfiltered set and the active filters. `totalCount` is
  // every row before filtering; `filtersActive` says chips are narrowing it.
  totalCount = null,
  filtersActive = false,
  onClearFilters = null,
  // Attribution controls. Absent (e.g. on a contact record) the pill is not
  // rendered — there is no deal in scope to move a message off.
  dealId = null,
  dealTargets = [],
  onMessageMoved = null,
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

  // The rows actually drawn: each multi-message email thread collapses to ONE
  // entry — its newest reply, which carries the card — and its other replies
  // are dropped from the stream (the card shows them). Everything else passes
  // through, so the list stays newest-first with day headers intact.
  const rows = useMemo(() => {
    const newest = new Map()
    for (const [id, arr] of threads) {
      newest.set(id, arr.reduce((a, b) => (new Date(b.ts) > new Date(a.ts) ? b : a)))
    }
    return messages.filter((m) => !(m.threadId && newest.has(m.threadId)) || newest.get(m.threadId) === m)
  }, [messages, threads])
  // Each thread oldest → newest, for the card.
  const threadOrdered = (id) => [...threads.get(id)].sort((a, b) => new Date(a.ts) - new Date(b.ts))

  // The attachment being previewed: { attachments, index } or null.
  //
  // Held here rather than per-row so only one viewer exists, and so an
  // attachment opened from the thread dialog and one opened from a row use
  // the same component and the same stacking.
  const [viewing, setViewing] = useState(null)

  // One place that decides what a chip click does. `onJumpAttachment` wins if
  // a caller supplied it; otherwise the built-in viewer opens.
  const openAttachment = (list, idx) => {
    const arr = Array.isArray(list) ? list.filter((a) => a && a.url) : []
    if (arr.length === 0) return
    if (onJumpAttachment) { onJumpAttachment(arr[idx] || arr[0]); return }
    // The index must point into the FILTERED array, or dropping a urlless
    // entry would open the wrong file.
    const target = list[idx]
    const at = Math.max(0, arr.indexOf(target))
    setViewing({ attachments: arr, index: at })
  }

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
      <PanelHead icon="forum" title="Timeline" subtitle={summary} accent="teal" />

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
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-default)',
          background: '#fff'
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
            width: 20, height: 20,
            accentColor: 'var(--brand-primary)',
            cursor: onSelectAll ? 'pointer' : 'default'
          }}
        />
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
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
        {rows.map((m, i) => {
          const prev = i > 0 ? rows[i - 1] : null
          const newDay = !prev || !sameDay(prev.ts, m.ts)
          return (
            <React.Fragment key={m.id}>
              {newDay && m.ts && <DayHeader iso={m.ts} />}
              {m.threadId && threads.has(m.threadId) ? (
                <EmailThreadCard
                  thread={threadOrdered(m.threadId)}
                  highlightedId={highlightedId}
                  onToggleSelect={onToggleSelect}
                  onOpenThread={setThreadOf}
                  onOpenAttachment={openAttachment}
                />
              ) : m.kind === 'task' || m.kind === 'note' ? (
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
                  dealId={dealId}
                  dealTargets={dealTargets}
                  onMessageMoved={onMessageMoved}
                  onOpenAttachment={openAttachment}
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

      {viewing && (
        <AttachmentViewer
          attachments={viewing.attachments}
          index={viewing.index}
          onClose={() => setViewing(null)}
        />
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
