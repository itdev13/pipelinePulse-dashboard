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
// "13\nAug" for the gutter — two short lines under the channel icon.
function formatGutterDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return (
    <>
      {d.getDate()}
      <br />
      {M[d.getMonth()]}
    </>
  )
}

function formatClock(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// One message row.
//
// Card-per-message with a date+channel gutter on the left, matching the design.
// The gutter is what makes the thread scannable: one glance down the column
// tells you the channel mix and the dates, without reading a word.
//
// Selection is per-row and drives what the agent reads.
function MessageRow({ m, highlighted, onJumpAttachment, selected, onToggleSelect }) {
  const channelCol = accentVar(m.channelAccent)
  const senderCol = accentVar(m.senderAccent)
  const inbound = m.direction === 'inbound'
  const outbound = m.direction === 'outbound'
  const isEvent = m.event || m.channel === 'TASK' || m.channel === 'SYSTEM'
  const many = m.toIds && m.toIds.length > 1
  const opacity = m.imported ? 0.6 : 1
  const dirLabel = inbound ? 'In ←' : outbound ? '→ Out' : null

  return (
    <div
      id={`tl-${m.id}`}
      style={{
        display: 'grid', gridTemplateColumns: '46px 1fr',
        gap: 'var(--space-2)', marginBottom: 'var(--space-2)', opacity
      }}
    >
      {/* Gutter — channel icon over the date. */}
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 3, paddingTop: 6
        }}
      >
        <span
          title={CH_LABEL[m.channel] || m.channel}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, boxSizing: 'border-box',
            border: `1.5px solid ${channelCol}`,
            borderRadius: 'var(--radius-sm)',
            background: '#fff', color: channelCol
          }}
        >
          <span className="ms" style={{ fontSize: 17 }}>{m.channelIcon}</span>
        </span>
        <span
          style={{
            textAlign: 'center', lineHeight: 1.2,
            fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-faint)'
          }}
        >
          {formatGutterDate(m.ts)}
        </span>
      </div>

      {/* Card */}
      <div
        style={{
          border: '1px solid var(--border-default)',
          borderTop: `3px solid ${channelCol}`,
          borderRadius: 'var(--radius-md)',
          background: highlighted ? 'var(--tint-gold)' : '#fff',
          transition: 'background 0.4s ease-out',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: isEvent ? '8px 14px' : '11px 14px' }}>
          {/* Header: channel · direction · sender, then the row controls. */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              flexWrap: 'wrap'
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-sm)', fontWeight: 600,
                letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: channelCol
              }}
            >
              {CH_LABEL[m.channel] || m.channel}
            </span>

            {dirLabel && (
              <span
                style={{
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: inbound ? 'var(--accent-pine-text)' : 'var(--text-muted)'
                }}
              >
                {dirLabel}
              </span>
            )}

            {/* Sender, with their accent dot — the thing that lets you tell
                three people apart at a glance. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 9, height: 9, flex: 'none',
                  borderRadius: '50%', background: senderCol
                }}
              />
              <span
                style={{
                  fontSize: 'var(--text-lg)', fontWeight: 600,
                  color: 'var(--text-heading)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {m.senderName}
              </span>
            </span>

            {m.ambiguous && (
              <span
                title="This contact has more than one open deal, so this message's filing is a guess"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 9px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--tint-gold)', color: 'var(--accent-gold-text)',
                  fontSize: 'var(--text-sm)', fontWeight: 600
                }}
              >
                <span className="ms" style={{ fontSize: 14 }}>help</span>
                Which opportunity?
              </span>
            )}

            <span style={{ flex: 1 }} />

            <span
              style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)', flex: 'none' }}
            >
              {formatClock(m.ts)}
            </span>

            {/* Selection. Only real messages are selectable — an event has no
                content for the agent to read. */}
            {!isEvent && (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect && onToggleSelect(m)}
                title={
                  selected
                    ? 'Selected — the agent reads this message'
                    : 'Not selected — the agent skips this message'
                }
                style={{
                  width: 17, height: 17, flex: 'none',
                  accentColor: 'var(--brand-primary)', cursor: 'pointer'
                }}
              />
            )}
          </div>

          {/* Call without a transcript: say so, since it's why coverage is short. */}
          {m.isCall && !m.body && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 5,
                fontSize: 'var(--text-md)', color: 'var(--text-muted)'
              }}
            >
              <span className="ms" style={{ fontSize: 16 }}>call</span>
              Call · {m.callDurationMin ? `${m.callDurationMin} min` : 'unknown length'}
              {' · '}no transcript, so the agent cannot read it
            </div>
          )}

          {m.body && (
            <div
              style={{
                marginTop: 5,
                fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-normal)',
                color: isEvent ? 'var(--text-muted)' : 'var(--text-heading)',
                whiteSpace: 'pre-line', overflowWrap: 'anywhere'
              }}
            >
              {m.body}
            </div>
          )}

          {many && (
            <div
              style={{
                marginTop: 5,
                fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
              }}
            >
              Sent as one message to {m.toIds.length} people
            </div>
          )}

          {m.attachments && m.attachments.length > 0 && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <span className="pp-label" style={{ marginBottom: 5 }}>
                {m.attachments.length > 1
                  ? `${m.attachments.length} attachments`
                  : '1 attachment'}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {m.attachments.map((att, i) => (
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
  onToggleSelect,
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

  const selectedCount = messages.filter(
    (m) => !m.kind && !m.event && m.included !== false
  ).length

  const summary = [
    // "18 of 20 selected" when some are excluded — the number that decides what
    // the agent reads, so it belongs in the header rather than being something
    // you count by eye.
    selectedCount === msgCount
      ? `${msgCount} ${msgCount === 1 ? 'message' : 'messages'}`
      : `${selectedCount} of ${msgCount} selected`,
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
        {/* The date lives in each row's gutter, as the design has it — one
            glance down the left column gives you the channel mix and the dates
            without reading a word. */}
        {messages.map((m) => {
          return (
            <React.Fragment key={m.id}>
              {m.kind === 'task' || m.kind === 'note' ? (
                <EntryRow m={m} highlighted={highlightedId === m.id} />
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
