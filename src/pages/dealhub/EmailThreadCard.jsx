import React, { useMemo, useState } from 'react'
import { RichBody } from '../shared/ListChrome'
import { htmlToText } from '../../utils/sanitiseHtml'
import AttachmentChip from './AttachmentChip'

// One email THREAD as one card — the shape GHL's own conversation view uses,
// and what the client asked the timeline to match.
//
//   ┌ how are you                                  ⤢  ⌄ ┐   subject bar
//   │          ─────( + 4 messages earlier )─────       │   collapsed: the pill
//   │ (JS) J srini  ✉  Lorem ipsum…        12:06  ↩     │   + newest email, one line
//   └────────────────────────────────────────────────────┘
//
// Before this every email was its own timeline row with a "4 in thread" link
// to a modal, so a five-message exchange took five rows and the thread was
// a thing you opened elsewhere. Here the thread IS the row; the others fold
// into it.
//
// Three states, as GHL has them:
//   collapsed — pill + newest email (its body opens in place on click)
//   headers   — every email as a one-line row; the newest open. For a thread
//               of more than four: first · pill · second-newest · newest, with
//               the pill opening the full list.
//   each row  — click to open/close its body
//
// `mails` arrive NEWEST FIRST (timeline order); the card reads oldest → newest
// top to bottom, as a conversation does.

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
}

function clock(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function EmailThreadCard({
  mails, onOpenThread, onOpenAttachment, onReplyEmail, selectedIds, onToggleSelect
}) {
  const ordered = useMemo(() => [...mails].reverse(), [mails])   // oldest → newest
  const newest = ordered[ordered.length - 1]
  const count = ordered.length
  const subject = newest?.subject || ordered.find((m) => m.subject)?.subject || '(no subject)'

  // 'collapsed' | 'headers' | 'partial'
  const [view, setView] = useState('collapsed')
  const [open, setOpen] = useState(() => new Set(newest ? [newest.id] : []))

  const toggleOpen = (id) => setOpen((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const expandAll = () => {
    setView('headers')
    setOpen(new Set(ordered.map((m) => m.id)))
  }
  const openHeaders = () => {
    setOpen(new Set(newest ? [newest.id] : []))
    setView(count > 4 ? 'partial' : 'headers')
  }
  const collapse = () => {
    setView('collapsed')
    setOpen(new Set(newest ? [newest.id] : []))
  }
  const onHeaderClick = () => (view === 'collapsed' ? openHeaders() : collapse())

  // Which emails are on screen, and where the "+N earlier" pill sits.
  const rows = useMemo(() => {
    if (view === 'collapsed') return [{ pill: count - 1 }, newest].filter((r) => !(r.pill === 0))
    if (view === 'partial') {
      return [ordered[0], { pill: count - 3 }, ordered[count - 2], ordered[count - 1]]
    }
    return ordered
  }, [view, ordered, newest, count])

  const allExpanded = ordered.every((m) => open.has(m.id)) && view !== 'collapsed'

  return (
    <div className="pp-thread">
      {/* Subject bar */}
      <div className="pp-thread-head" onClick={onHeaderClick} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onHeaderClick() } }}>
        <span className="pp-thread-subject" title={subject}>{subject}</span>
        <span className="pp-thread-tools" onClick={(e) => e.stopPropagation()}>
          {count > 1 && onOpenThread && (
            <button type="button" className="pp-thread-tool" title="Open the whole thread"
              onClick={() => onOpenThread(newest)}>
              <span className="ms" style={{ fontSize: 16 }}>open_in_full</span>
            </button>
          )}
          <button type="button" className="pp-thread-tool"
            title={allExpanded ? 'Collapse thread' : 'Expand every email'}
            onClick={allExpanded ? collapse : expandAll}>
            <span className="ms" style={{ fontSize: 18 }}>{allExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>
        </span>
      </div>

      {rows.map((r, i) => r.pill != null ? (
        <div key={`pill-${i}`} className="pp-thread-pillrow">
          <button type="button" className="pp-thread-pill"
            onClick={view === 'collapsed' ? openHeaders : expandAll}
            title={view === 'collapsed' ? 'Show the earlier emails' : 'Show every email'}>
            <span className="pp-thread-plus">+</span>
            {r.pill} {r.pill === 1 ? 'message' : 'messages'} earlier
          </button>
        </div>
      ) : (
        <MailRow
          key={r.id}
          m={r}
          expanded={open.has(r.id)}
          onToggle={() => toggleOpen(r.id)}
          onOpenAttachment={onOpenAttachment}
          onReply={onReplyEmail ? () => onReplyEmail(r) : null}
          selected={selectedIds ? selectedIds.has(r.id) : null}
          onToggleSelect={onToggleSelect ? () => onToggleSelect(r) : null}
          last={i === rows.length - 1}
        />
      ))}
    </div>
  )
}

function MailRow({ m, expanded, onToggle, onOpenAttachment, onReply, selected, onToggleSelect, last }) {
  const preview = useMemo(() => htmlToText(m.body || ''), [m.body])
  const atts = Array.isArray(m.attachments) ? m.attachments : []
  const inbound = m.direction === 'inbound'
  const name = m.senderName || (inbound ? 'Customer' : 'Us')

  return (
    <div className={`pp-mail${last ? ' pp-mail-last' : ''}`}>
      <div className="pp-mail-head" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}>
        {/* Deal AI selection, per email — the thread replaced one checkbox
            per timeline row, so the control moves inside. */}
        {onToggleSelect && (
          <input type="checkbox" className="pp-mail-tick" checked={!!selected}
            onClick={(e) => e.stopPropagation()} onChange={onToggleSelect}
            title={selected ? 'Co-Pilot reads this email' : 'Co-Pilot skips this email'} />
        )}
        <span className="pp-mail-avatar" data-inbound={inbound ? '1' : '0'}>
          {initialsOf(name)}
          <span className="ms pp-mail-avatar-badge">{inbound ? 'mail' : 'outgoing_mail'}</span>
        </span>
        <span className="pp-mail-who">
          <span className="pp-mail-name">{name}</span>
          {expanded
            ? <span className="pp-mail-to">To: {m.emailTo || '—'}</span>
            : <span className="pp-mail-snippet">{preview || (atts.length ? `${atts.length} attachment${atts.length === 1 ? '' : 's'}` : '')}</span>}
        </span>
        <span className="pp-mail-time">{clock(m.ts)}</span>
        {onReply && (
          <button type="button" className="pp-mail-replyicon" title="Reply"
            onClick={(e) => { e.stopPropagation(); onReply() }}>
            <span className="ms" style={{ fontSize: 18 }}>reply</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="pp-mail-body">
          {preview ? (
            <RichBody html={m.body} color="var(--text-body)" size="var(--text-lg)"
              leading="var(--leading-normal)" maxWidth={820} />
          ) : atts.length === 0 ? (
            <p className="pp-email-nobody">This email has no message text.</p>
          ) : null}
          {atts.length > 0 && (
            <div className="pp-email-atts-list" style={{ marginTop: 10 }}>
              {atts.map((att, i) => (
                <AttachmentChip key={`${att.name}-${i}`} att={att}
                  channelAccent={m.channelAccent} onClick={() => onOpenAttachment(atts, i)} />
              ))}
            </div>
          )}
          {onReply && (
            <div className="pp-mail-actions">
              <button type="button" className="pp-mail-reply" onClick={onReply}>
                <span className="ms" style={{ fontSize: 17 }}>reply</span> Reply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
