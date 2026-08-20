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
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-heading)' }}>{att.name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
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
            textAlign: 'center', fontSize: 9, fontWeight: 500, lineHeight: 1.2,
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
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 12px',
              fontSize: 12, color: 'var(--text-muted)',
              minHeight: 24
            }}
          >
            {!bodyStartsWithLabel && (
              <span
                style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
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

function MessageRow({ m, highlighted, onToggleIncluded, onJumpAttachment }) {
  const gutter = formatDateGutter(m.ts)
  const channelCol = accentVar(m.channelAccent)
  const channelTint = tintVar(m.channelAccent)
  const senderCol = accentVar(m.senderAccent)
  const showDot = m.direction === 'in' || m.direction === 'out'
  const isEvent = m.event || m.channel === 'TASK' || m.channel === 'SYSTEM'
  const dirLabel = m.direction === 'in' ? 'In ←' : m.direction === 'out' ? '→ Out' : null
  const dirColor = m.direction === 'in' ? 'var(--green-600)' : 'var(--text-muted)'
  const many = m.toIds && m.toIds.length > 1
  const showCheckbox = m.channel !== 'TASK' && m.channel !== 'SYSTEM'
  const cbDisabled = !m.readable
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
            textAlign: 'center', fontSize: 10, fontWeight: 600, lineHeight: 1.25,
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
          display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12,
          padding: isEvent ? '8px 16px' : '12px 16px',
        }}
      >
        {/* Inclusion checkbox column */}
        <div style={{ paddingTop: 1, opacity: cbDisabled ? 0.4 : 1 }}>
          {showCheckbox && (
            <input
              type="checkbox"
              checked={!!m.included}
              disabled={cbDisabled}
              onChange={() => onToggleIncluded && onToggleIncluded(m)}
              title={
                cbDisabled
                  ? 'No transcript yet — calls cannot be read by the AI until transcribed'
                  : m.included
                  ? 'Included in AI analysis — untick to exclude'
                  : 'Excluded from AI analysis'
              }
              style={{
                width: 18, height: 18, cursor: cbDisabled ? 'not-allowed' : 'pointer',
                accentColor: 'var(--brand-primary)',
              }}
            />
          )}
        </div>

        {/* Content column */}
        <div style={{ minWidth: 0 }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: channelCol,
              }}
            >
              {CH_LABEL[m.channel]}
            </span>
            {dirLabel && (
              <span style={{ fontSize: 11, fontWeight: 600, color: dirColor }}>{dirLabel}</span>
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
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-heading)' }}>
                {m.senderName}
              </span>
            </span>
            {many && (
              <span
                title={`Sent as one message to ${m.toIds.length} people`}
                style={{ fontSize: 12, color: 'var(--text-muted)' }}
              >
                to {m.toNames.join(', ')}
              </span>
            )}
            {!many && m.direction === 'out' && m.toNames && m.toNames.length === 1 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to {m.toNames[0]}</span>
            )}
            {m.ambiguous && (
              <span
                title="This contact is on more than one opportunity — file it with the tag on the right"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 22, padding: '0 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--tint-gold)', color: 'var(--accent-gold)',
                  fontSize: 11, fontWeight: 600,
                }}
              >
                <span className="ms" style={{ fontSize: 13 }}>help</span>
                Which opportunity?
              </span>
            )}
            {m.imported && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--gray-100)', color: 'var(--gray-600)',
                }}
              >
                Imported
              </span>
            )}
            {m.manual && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--tint-pine)', color: 'var(--accent-pine)',
                }}
              >
                Added manually
              </span>
            )}
            {m.excludedBy && (
              <span
                style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--tint-gold)', color: 'var(--accent-gold)',
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
                marginTop: 6, padding: '8px 12px',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12, color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 8,
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
                fontSize: 14, lineHeight: 1.5,
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
                marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)',
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
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
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
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px 6px 16px',
          background: channelTint,
          borderTop: '1px solid var(--border-default)',
        }}
      >
        <span
          style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
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
              padding: '3px 8px 3px 9px',
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
                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
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

export default function Timeline({
  messages,
  highlightedId = null,
  onToggleIncluded,
  onJumpAttachment,
}) {
  const total = messages.length
  const included = messages.filter((m) => m.readable && m.included).length
  const peopleCount = new Set(
    messages.map((m) => m.senderId).filter(Boolean)
  ).size

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
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)' }}>forum</span>
        <h3
          style={{
            fontSize: 18, fontWeight: 600, color: 'var(--accent-teal)',
            margin: 0, flex: 1,
          }}
        >
          Timeline
        </h3>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {included} of {total} included · {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
        </span>
      </header>

      <div
        style={{
          position: 'relative',
          padding: '10px 12px 12px',
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
          m.event ? (
            <EventRow key={m.id} m={m} />
          ) : (
            <MessageRow
              key={m.id}
              m={m}
              highlighted={highlightedId === m.id}
              onToggleIncluded={onToggleIncluded}
              onJumpAttachment={onJumpAttachment}
            />
          )
        )}
      </div>
    </section>
  )
}
