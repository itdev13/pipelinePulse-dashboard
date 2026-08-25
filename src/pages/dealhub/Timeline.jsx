import React from 'react'
import { RichBody } from '../shared/ListChrome'

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

function accentVar(accent) {
  // 'gray' isn't in the token palette — map to the neutral border.
  return accent === 'gray' ? 'var(--gray-400)' : `var(--accent-${accent})`
}


function formatBytes(n) {
  if (!n) return ''
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}

function attachmentIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'picture_as_pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (ext === 'dwg') return 'architecture'
  return 'description'
}

function AttachmentChip({ att, channelAccent, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 10px 5px 7px',
        border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
        background: 'var(--gray-50)', cursor: 'pointer',
        fontFamily: 'var(--font-sans)', textAlign: 'left',
      }}
    >
      <span className="ms" style={{ fontSize: 16, color: accentVar(channelAccent) }}>
        {attachmentIcon(att.name)}
      </span>
      <span style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-heading)' }}>{att.name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
        {formatBytes(att.sizeBytes)}
      </span>
    </button>
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
function RowIcon({ icon, colour, title }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, marginTop: 1,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--gray-50)', color: colour
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

function MessageRow({ m, highlighted, onJumpAttachment, selected, onToggleSelect }) {
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
        title={CH_LABEL[m.channel] || m.channel}
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
            {CH_LABEL[m.channel] || m.channel}
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

        {m.body && (
          <div
            style={{
              fontSize: 'var(--text-md)', lineHeight: 'var(--leading-snug)',
              color: 'var(--text-body)',
              whiteSpace: 'pre-line', overflowWrap: 'anywhere'
            }}
          >
            {m.body}
          </div>
        )}

        {m.attachments?.length > 0 && (
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
      <RowIcon icon={m.channelIcon} colour={col} title={isNote ? 'Note' : 'Task'} />

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

        {m.body && (
          <div style={{ marginTop: 2 }}>
            <RichBody html={m.body} size="var(--text-md)" maxWidth={720} />
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
          reads. */}
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
    </section>
  )
}
