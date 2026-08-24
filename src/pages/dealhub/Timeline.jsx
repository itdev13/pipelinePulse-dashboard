import React from 'react'

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
function tintVar(accent) {
  return accent === 'gray' ? 'var(--gray-50)' : `var(--tint-${accent})`
}

function formatDateGutter(iso) {
  const d = new Date(iso)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return { day: d.getDate(), mon: M[d.getMonth()] }
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
  const gutter = formatDateGutter(m.ts)
  const col = accentVar(m.channelAccent)
  return (
    <div
      id={`tl-${m.id}`}
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: '40px 1fr',
        alignItems: 'center', marginBottom: 6, opacity: 0.7
      }}
    >
      {/* Gutter — smaller square for events */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 3 }}>
        <div
          title={m.channel}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, boxSizing: 'border-box',
            border: `1px solid ${col}`, borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-page)'
          }}
        >
          <span className="ms" style={{ fontSize: 12, color: col }}>{m.channelIcon}</span>
        </div>
        <div
          style={{
            textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 500, lineHeight: 1.2,
            color: 'var(--text-faint)'
          }}
        >
          {gutter.day} {gutter.mon}
        </div>
      </div>

      {/* Event line — thin, muted. Two parts:
            1. LABEL (bold-ish) — "Opportunity" / "Invoice" / "Appointment"
            2. BODY (regular)   — the human phrase GHL sends, e.g.
                                  "created" / "Task completed — Send brochure"
          If the body already starts with the label (e.g. "Opportunity
          created"), we drop the label to avoid "Opportunity · Opportunity
          created". */}
      {(() => {
        const label = m.eventLabel || m.channel || 'Event'
        const body = m.body || ''
        const bodyStartsWithLabel = body.toLowerCase().startsWith(label.toLowerCase())
        return (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: 'var(--space-1) var(--space-3)',
              fontSize: 'var(--text-base)', color: 'var(--text-muted)',
              minHeight: 24
            }}
          >
            {!bodyStartsWithLabel && (
              <span
                style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase', color: col,
                  padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)'
                }}
              >
                {label}
              </span>
            )}
            <span style={{ fontWeight: 500, color: 'var(--text-body)' }}>
              {body || label}
            </span>
            {m.senderName && m.senderName !== 'Rep' && m.senderName !== 'Contact' && (
              <span style={{ color: 'var(--text-faint)' }}>· {m.senderName}</span>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function MessageRow({ m, highlighted, onJumpAttachment }) {
  const gutter = formatDateGutter(m.ts)
  const channelCol = accentVar(m.channelAccent)
  const channelTint = tintVar(m.channelAccent)
  const senderCol = accentVar(m.senderAccent)
  // The API passes messages.message_direction straight through, which the
  // writers store as 'inbound' / 'outbound'.
  const inbound = m.direction === 'inbound'
  const outbound = m.direction === 'outbound'
  const showDot = inbound || outbound
  const isEvent = m.event || m.channel === 'TASK' || m.channel === 'SYSTEM'
  const dirLabel = inbound ? 'In ←' : outbound ? '→ Out' : null
  const dirColor = inbound ? 'var(--green-600)' : 'var(--text-muted)'
  const many = m.toIds && m.toIds.length > 1
  const opacity = m.imported ? 0.6 : 1

  return (
    <div
      id={`tl-${m.id}`}
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: '40px 1fr',
        alignItems: 'start', marginBottom: 10,
      }}
    >
      {/* Left gutter — channel square + date */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, paddingTop: 11 }}>
        <div
          title={CH_LABEL[m.channel]}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, boxSizing: 'border-box',
            border: `1.5px solid ${channelCol}`,
            borderRadius: 'var(--radius-sm)',
            background: channelTint,
            opacity,
          }}
        >
          <span className="ms" style={{ fontSize: 16, color: channelCol }}>{m.channelIcon}</span>
        </div>
        <div
          style={{
            textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 600, lineHeight: 1.25,
            color: 'var(--text-faint)', background: 'var(--surface-page)', padding: '2px 0',
          }}
        >
          {gutter.day}
          <br />
          {gutter.mon}
        </div>
      </div>

      {/* Card — channel-accent frames the row (top + bottom stripes) */}
      <div
        style={{
          border: '1px solid var(--border-strong)',
          borderTop: `4px solid ${channelCol}`,
          borderBottom: `4px solid ${channelCol}`,
          borderRadius: 'var(--radius-md)',
          opacity,
          background: highlighted ? 'var(--tint-gold)' : '#fff',
          transition: 'background 0.4s ease-out',
          overflow: 'hidden',
        }}
      >
      <div
        style={{
          padding: isEvent ? '8px 16px' : '12px 16px',
        }}
      >
        {/* Content — full width now the per-message AI checkbox is gone. */}
        <div style={{ minWidth: 0 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 'var(--text-sm)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: channelCol,
              }}
            >
              {CH_LABEL[m.channel]}
            </span>
            {dirLabel && (
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: dirColor }}>{dirLabel}</span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {showDot && (
                <span
                  style={{
                    width: 9, height: 9, flex: 'none',
                    borderRadius: 'var(--radius-pill)',
                    background: senderCol,
                  }}
                />
              )}
              <span style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-heading)' }}>
                {m.senderName}
              </span>
            </span>
            {many && (
              <span
                title={`Sent as one message to ${m.toIds.length} people`}
                style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}
              >
                to {m.toNames.join(', ')}
              </span>
            )}
            {!many && outbound && m.toNames && m.toNames.length === 1 && (
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>to {m.toNames[0]}</span>
            )}
            {m.ambiguous && (
              <span
                title="This contact is on more than one opportunity — file it with the tag on the right"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                  height: 22, padding: '0 var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--tint-gold)', color: 'var(--accent-gold-text)',
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                }}
              >
                <span className="ms" style={{ fontSize: 13 }}>help</span>
                Which opportunity?
              </span>
            )}
            {m.imported && (
              <span
                style={{
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--gray-100)', color: 'var(--gray-600)',
                }}
              >
                Imported
              </span>
            )}
            {m.manual && (
              <span
                style={{
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--tint-pine)', color: 'var(--accent-pine-text)',
                }}
              >
                Added manually
              </span>
            )}
            {m.excludedBy && (
              <span
                style={{
                  fontSize: 'var(--text-sm)', fontWeight: 600,
                  padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--tint-gold)', color: 'var(--accent-gold-text)',
                }}
              >
                Excluded by {m.excludedBy}
              </span>
            )}
          </div>

          {/* Call-only note when unreadable */}
          {m.channel === 'CALL' && !m.readable && (
            <div
              style={{
                marginTop: 6, padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-base)', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              }}
            >
              <span className="ms" style={{ fontSize: 16, color: 'var(--text-faint)' }}>call</span>
              Call · {m.callDurationMin} min · no transcript — not readable by AI yet
            </div>
          )}

          {/* Body */}
          {m.body && (
            <div
              style={{
                fontSize: 'var(--text-lg)', lineHeight: 1.5,
                color: isEvent ? 'var(--text-muted)' : 'var(--text-heading)',
                marginTop: 5, whiteSpace: 'pre-line',
              }}
            >
              {m.body}
            </div>
          )}

          {/* Group message note */}
          {many && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--text-faint)',
              }}
            >
              <span className="ms" style={{ fontSize: 14 }}>group</span>
              Sent as one message to {m.toIds.length} people
            </div>
          )}

          {/* Attachments */}
          {m.attachments && m.attachments.length > 0 && (
            <div
              style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                marginTop: 10,
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-sm)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase',
                  color: 'var(--text-faint)', marginRight: 2,
                }}
              >
                {m.attachments.length > 1 ? `${m.attachments.length} attachments` : '1 attachment'}
              </span>
              {m.attachments.map((att, i) => (
                <AttachmentChip
                  key={i}
                  att={att}
                  channelAccent={m.channelAccent}
                  onClick={() => onJumpAttachment && onJumpAttachment(m, att)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer strip — sits between the body and the bottom channel stripe.
          Anchors the deal-tag pill so every row surfaces which opp it's on
          in exactly the same spot, no matter how tall the body is. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: '6px var(--space-3) 6px var(--space-4)',
          background: channelTint,
          borderTop: '1px solid var(--border-default)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase', color: channelCol,
          }}
        >
          {CH_LABEL[m.channel]}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Deal-assignment pill — the reassignment control. Renders the
              deal name when we have one; with no name it's icon + chevron
              only, since inventing a placeholder label says less than the
              tooltip already does. */}
          <button
            title={
              m.dealTag
                ? `Part of ${m.dealTag} — click to reassign`
                : 'Click to reassign this message to another deal'
            }
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px var(--space-2) 3px 9px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-pill)',
              background: '#fff',
              cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
            }}
          >
            <span className="ms" style={{ fontSize: 13, color: 'var(--text-muted)' }}>sell</span>
            {m.dealTag && (
              <span
                style={{
                  maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
                  fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)',
                }}
              >
                {m.dealTag}
              </span>
            )}
            <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>expand_more</span>
          </button>
        </div>
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
  const gutter = formatDateGutter(m.ts)
  const col = accentVar(m.channelAccent)
  const isNote = m.kind === 'note'
  const opacity = m.imported ? 0.6 : 1

  return (
    <div
      id={`tl-${m.id}`}
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: '40px 1fr',
        gap: 0, marginBottom: 8, opacity
      }}
    >
      {/* Gutter — channel square + date, same geometry as a message row. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 8 }}>
        <div
          title={isNote ? 'Note' : 'Task'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, boxSizing: 'border-box',
            border: `1.5px solid ${col}`, borderRadius: 'var(--radius-sm)',
            background: tintVar(m.channelAccent)
          }}
        >
          <span className="ms" style={{ fontSize: 16, color: col }}>{m.channelIcon}</span>
        </div>
        <div
          style={{
            textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 500, lineHeight: 1.25,
            color: 'var(--text-faint)'
          }}
        >
          {gutter.day}<br />{gutter.mon}
        </div>
      </div>

      <div
        style={{
          border: '1px solid var(--border-default)',
          borderTop: `3px solid ${col}`,
          borderRadius: 'var(--radius-md)',
          background: highlighted ? 'var(--surface-selected)' : '#fff',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          {/* Header: kind · author · badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 'var(--text-sm)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: col
              }}
            >
              {isNote ? 'Note' : 'Task'}
            </span>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-heading)' }}>
              {m.senderName}
            </span>

            {m.manual && <Badge tone="pine">Added manually</Badge>}
            {/* Only shown when the note was actually written by the agent —
                the server keeps this false unless it can tell. */}
            {isNote && m.isAi && <Badge tone="sky" icon="auto_awesome">AI note — internal</Badge>}
            {!isNote && m.status === 'completed' && <Badge tone="pine" icon="check">Completed</Badge>}

            <span style={{ flex: 1 }} />

            {m.dealTag && <DealPill label={m.dealTag} />}
          </div>

          {/* Body */}
          {m.body && (
            <div
              style={{
                marginTop: 8,
                fontSize: 'var(--text-lg)', lineHeight: 1.55, color: 'var(--text-body)',
                overflowWrap: 'anywhere'
              }}
            >
              {m.body}
            </div>
          )}
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

// The deal pill, matching the message rows' footer control.
function DealPill({ label }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 26, padding: '0 10px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--gray-50)'
      }}
    >
      <span className="ms" style={{ fontSize: 13, color: 'var(--text-muted)' }}>sell</span>
      <span
        style={{
          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)'
        }}
      >
        {label}
      </span>
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
        border: '2px solid var(--accent-teal)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
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
        {/* Vertical spine behind the channel icons */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 31, top: 24, bottom: 24, width: 2,
            background: 'var(--border-default)',
          }}
        />
        {messages.map((m) =>
          // Tasks and notes render as their own card — a full card inline in
          // the thread, not the thin grey EventRow used for GHL activity.
          m.kind === 'task' || m.kind === 'note' ? (
            <EntryRow key={m.id} m={m} highlighted={highlightedId === m.id} />
          ) : m.event ? (
            <EventRow key={m.id} m={m} />
          ) : (
            <MessageRow
              key={m.id}
              m={m}
              highlighted={highlightedId === m.id}
              onJumpAttachment={onJumpAttachment}
            />
          )
        )}
      </div>
    </section>
  )
}
