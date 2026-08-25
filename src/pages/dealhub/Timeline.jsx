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
function EventRow({ m }) {
  // A system event ("Opportunity created", "Task completed") is background, not
  // conversation. Centred and quiet, so it separates the thread the way a day
  // divider does rather than competing with the messages either side of it.
  const label = m.eventLabel || m.channel || 'Event'
  const body = m.body || ''
  const startsWithLabel = body.toLowerCase().startsWith(label.toLowerCase())
  const text = body
    ? (startsWithLabel ? body : `${label} · ${body}`)
    : label

  return (
    <div
      id={`tl-${m.id}`}
      style={{
        display: 'flex', justifyContent: 'center',
        margin: 'var(--space-2) 0'
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          maxWidth: '80%',
          padding: '4px 12px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--gray-50)',
          fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
        }}
      >
        <span className="ms" style={{ fontSize: 14, flex: 'none' }}>
          {m.channelIcon || 'info'}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {text}
        </span>
        <span style={{ flex: 'none', color: 'var(--text-faint)' }}>
          {formatClock(m.ts)}
        </span>
      </span>
    </div>
  )
}

// One message, as a chat bubble.
//
// This is a CONVERSATION, so it reads like one: outbound sits right, inbound
// sits left, and the bubble hugs its content. Before this every message was an
// identical full-width boxed card with a five-part header — "SMS → Out ●
// jaladanki srinivas to Contact" above two characters of text — so you could
// not tell at a glance who had said what, and a one-word reply occupied the
// same real estate as a paragraph.
//
// The channel, sender and time move BELOW the bubble as one quiet line. They
// are context, not the message.
// "14:32". The date lives on the day divider, so each message only needs its
// time — the old gutter repeated "19 Aug" beside five consecutive messages.
function formatClock(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// A date separator between days, the way any messaging app does it. Replaces
// the per-row date gutter.
function DayDivider({ iso }) {
  const d = new Date(iso)
  const label = Number.isNaN(d.getTime())
    ? 'Unknown date'
    : (() => {
        const today = new Date()
        const startOf = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
        const days = Math.round((startOf(today) - startOf(d)) / 86400000)
        if (days === 0) return 'Today'
        if (days === 1) return 'Yesterday'
        const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const year = d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`
        return `${d.getDate()} ${M[d.getMonth()]}${year}`
      })()

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        margin: 'var(--space-4) 0 var(--space-3)'
      }}
    >
      <span style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      <span
        style={{
          flex: 'none',
          fontSize: 'var(--text-sm)', fontWeight: 600,
          color: 'var(--text-muted)'
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
    </div>
  )
}

// Same calendar day? Used to decide where a divider goes.
function sameDay(a, b) {
  if (!a || !b) return false
  const x = new Date(a), y = new Date(b)
  if (Number.isNaN(x.getTime()) || Number.isNaN(y.getTime())) return false
  return x.getFullYear() === y.getFullYear()
    && x.getMonth() === y.getMonth()
    && x.getDate() === y.getDate()
}

function MessageRow({ m, highlighted, onJumpAttachment }) {
  const channelCol = accentVar(m.channelAccent)
  const inbound = m.direction === 'inbound'
  const outbound = m.direction === 'outbound'
  const isEvent = m.event || m.channel === 'TASK' || m.channel === 'SYSTEM'
  const many = m.toIds && m.toIds.length > 1
  const opacity = m.imported ? 0.6 : 1

  // Ours on the right, theirs on the left — the universal convention. Anything
  // with no direction (a system row) centres as neutral.
  const side = outbound ? 'flex-end' : 'flex-start'

  return (
    <div
      id={`tl-${m.id}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: side,
        marginBottom: 'var(--space-3)', opacity
      }}
    >
      <div
        style={{
          maxWidth: '78%', minWidth: 0,
          padding: '10px 14px',
          // Outbound is brand-tinted, inbound is white with a border. Colour
          // carries the direction so the label doesn't have to.
          background: highlighted
            ? 'var(--tint-gold)'
            : outbound ? 'var(--tint-pine)' : '#fff',
          border: `1px solid ${
            highlighted
              ? 'var(--accent-gold)'
              : outbound ? 'var(--green-100)' : 'var(--border-default)'
          }`,
          // The corner nearest the speaker is squared off — the tail.
          borderRadius: outbound
            ? 'var(--radius-md) var(--radius-md) var(--radius-sm) var(--radius-md)'
            : 'var(--radius-md) var(--radius-md) var(--radius-md) var(--radius-sm)',
          transition: 'background 0.4s ease-out'
        }}
      >
        {/* Call rows carry their duration in place of a body. */}
        {m.isCall && !m.body && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 'var(--text-md)', color: 'var(--text-muted)'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>call</span>
            Call · {m.callDurationMin ? `${m.callDurationMin} min` : 'unknown length'}
            {' · '}no transcript, so the agent cannot read it
          </span>
        )}

        {m.body && (
          <div
            style={{
              fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-normal)',
              color: isEvent ? 'var(--text-muted)' : 'var(--text-heading)',
              whiteSpace: 'pre-line', overflowWrap: 'anywhere'
            }}
          >
            {m.body}
          </div>
        )}

        {m.attachments && m.attachments.length > 0 && (
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              marginTop: 'var(--space-2)'
            }}
          >
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

      {/* Meta, below the bubble and aligned to its edge. Channel, who, when —
          the things that used to crowd the top of every card. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          margin: '4px 2px 0',
          fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
        }}
      >
        <span className="ms" style={{ fontSize: 13, color: channelCol }}>
          {m.channelIcon}
        </span>
        <span style={{ fontWeight: 600, color: channelCol }}>
          {CH_LABEL[m.channel] || m.channel}
        </span>
        <span aria-hidden>·</span>
        <span>{m.senderName}</span>
        <span aria-hidden>·</span>
        <span>{formatClock(m.ts)}</span>

        {many && (
          <span title={`Sent as one message to ${m.toIds.length} people`}>
            {' · '}to {m.toIds.length} people
          </span>
        )}
        {m.ambiguous && (
          <span
            title="This contact has more than one open deal — filing may be ambiguous"
            style={{ color: 'var(--accent-gold-text)' }}
          >
            {' · '}also on another deal
          </span>
        )}
      </div>
    </div>
  )
}

// Task and note rows.
//
// The mockup renders these as full cards inline in the thread, not as the thin
// EventRow used for GHL activity events — "send the revised quote" is part of
// the conversation, and a one-line grey event is too quiet for something a rep
// has to act on.
//
// Same card frame as a message (stripe + gutter square + deal pill) so the
// stream reads as one thing rather than three interleaved lists.
function EntryRow({ m, highlighted }) {
  const col = accentVar(m.channelAccent)
  const isNote = m.kind === 'note'
  const opacity = m.imported ? 0.6 : 1

  // Notes and tasks are neither ours nor theirs — they're internal records
  // filed against the deal. Full width, centred between the bubbles, with the
  // channel colour as a left rail. The old date gutter is gone; the day divider
  // above carries the date.
  return (
    <div
      id={`tl-${m.id}`}
      style={{ marginBottom: 'var(--space-3)', opacity }}
    >
      <div
        style={{
          border: '1px solid var(--border-default)',
          borderLeft: `3px solid ${col}`,
          borderRadius: 'var(--radius-md)',
          background: highlighted ? 'var(--tint-gold)' : 'var(--gray-25)',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          {/* Kind + badges on one quiet line. The deal pill is gone: the whole
              timeline is scoped to one deal, so it repeated the same name on
              every row. */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              flexWrap: 'wrap', marginBottom: 5
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 600,
                letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: col
              }}
            >
              {isNote ? 'Note' : 'Task'}
            </span>
            {isNote && m.isAi && <Badge tone="sky" icon="auto_awesome">AI note — internal</Badge>}
            {!isNote && m.status === 'completed' && <Badge tone="pine" icon="check">Completed</Badge>}
            {!isNote && m.overdue && m.status !== 'completed' && (
              <Badge tone="rose" icon="schedule">Overdue</Badge>
            )}
          </div>

          {/* The title leads — it's the thing itself, not who filed it. */}
          <div
            style={{
              fontSize: 'var(--text-lg)', fontWeight: 600,
              lineHeight: 1.4, color: 'var(--text-heading)'
            }}
          >
            {m.title || (isNote ? 'Note' : 'Task')}
          </div>

          {/* Body. Notes and tasks are authored in GHL's rich-text editor, so
              their bodies are MARKUP — rendered as a string they print their own
              tags ("<p style=...>opp note</p>"). */}
          {m.body && (
            <div style={{ marginTop: 4 }}>
              <RichBody html={m.body} size="var(--text-md)" maxWidth={720} />
            </div>
          )}

          {/* Attribution and due date as a quiet meta line, the way the list
              pages already render tasks — rather than the author competing with
              the title for the top of the card. */}
          <div
            style={{
              marginTop: 6,
              fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
            }}
          >
            {[
              isNote
                ? (m.senderName ? `by ${m.senderName}` : null)
                : (m.assignee ? `assigned to ${m.assignee}` : 'unassigned'),
              !isNote && m.duePhrase ? `due ${m.duePhrase}` : null,
              m.manual ? 'added manually' : null
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    </div>
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

  const summary = [
    `${msgCount} ${msgCount === 1 ? 'message' : 'messages'}`,
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

      <div
        style={{
          position: 'relative',
          padding: '10px var(--space-3) var(--space-3)',
        }}
      >
        {/* The vertical spine and the per-row date gutter are gone: the spine
            anchored a column of channel icons that no longer exists, and the
            gutter printed "19 Aug" beside five consecutive messages. Dates are
            day dividers now, the way a messaging app does it. */}
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null
          const newDay = !prev || !sameDay(prev.ts, m.ts)
          return (
            <React.Fragment key={m.id}>
              {newDay && m.ts && <DayDivider iso={m.ts} />}
              {m.kind === 'task' || m.kind === 'note' ? (
                <EntryRow m={m} highlighted={highlightedId === m.id} />
              ) : m.event ? (
                <EventRow m={m} />
              ) : (
                <MessageRow
                  m={m}
                  highlighted={highlightedId === m.id}
                  onJumpAttachment={onJumpAttachment}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </section>
  )
}
