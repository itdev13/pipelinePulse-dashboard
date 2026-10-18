import React, { useEffect, useMemo, useRef, useState } from 'react'
import { dealsAPI } from '../../api/deals'
import { providersAPI } from '../../api/providers'
import { controlAPI } from '../../api/control'
import { notesAPI } from '../../api/notes'
import RichEditor from '../shared/RichEditor'
import { isHtmlEmpty } from '../../utils/sanitiseHtml'
import './composer.css'

// The timeline composer — GHL's Conversations composer, docked under the deal's
// timeline, so a rep can answer the customer without leaving the deal.
//
//   collapsed   [✉ ⌄]  Type a message…                           [ ➤ ]
//
//   expanded    [✉ Email ⌄] | [👁 Internal Comment]               –  ⤢
//               From  [sender ⌄]
//               To    [contact ⌄]                             CC  BCC
//               Subject: …
//               body …
//               error / status                          [Discard] [Send]
//
// SENDS DIRECTLY. Unlike a Co-Pilot draft there is no propose/confirm step:
// the rep wrote it, so pressing Send is the confirmation. The server checks
// the recipient is on this deal and not on DND before anything goes out.
//
// THE CHANNEL LIST is GHL's: one entry per way a message can leave — Email,
// then every SMS/WhatsApp sender the location has (native, "WhatsApp QR",
// "SMS Android", "iMessage"). A custom provider is sent as its channel plus
// its provider id; the server turns that into GHL's type 'Custom'.
//
// INTERNAL COMMENT. GHL has no API for creating its internal comments, so a
// comment here is saved as a note on the contact, linked to this deal and
// titled "Internal comment" — visible to the team in GHL's Notes and in this
// timeline, never sent to the customer.

const COMMENT_TITLE = 'Internal comment'

const DND_KEY = { Email: 'email', SMS: 'sms', WhatsApp: 'whatsapp' }

// Which icon a channel entry wears — GHL's: a blue envelope for Email, the
// green WhatsApp mark for WhatsApp and "WhatsApp QR", a blue bubble for
// iMessage, an amber SMS bubble for SMS and "SMS Android". By provider NAME
// for iMessage, because GHL files it under the SMS channel.
export function iconKind(channel, label = '') {
  if (channel === 'Email') return 'email'
  if (channel === 'WhatsApp') return 'whatsapp'
  if (/imessage/i.test(label)) return 'imessage'
  return 'sms'
}

const WHATSAPP_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'

function ChannelIcon({ kind, size = 18 }) {
  if (kind === 'whatsapp') {
    return (
      <svg className="pp-composer-ico pp-composer-ico-whatsapp" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d={WHATSAPP_PATH} />
      </svg>
    )
  }
  const glyph = { email: 'mail', imessage: 'chat_bubble', sms: 'sms', comment: 'visibility' }[kind] || 'mail'
  return <span className={`ms pp-composer-ico pp-composer-ico-${kind}`} style={{ fontSize: size }} aria-hidden="true">{glyph}</span>
}

// GHL's accepted attachment types (POST /conversations/messages/upload).
const ATTACH_ACCEPT = '.jpg,.jpeg,.png,.mp4,.mpeg,.zip,.rar,.pdf,.doc,.docx,.txt,.mp3,.wav'
const fmtSize = (n) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

// Every way a message can leave, flattened the way GHL's dropdown lists them.
//
// Email is ONE entry — its senders (the location's email, a rep's Gmail) are a
// From choice, not separate channels. SMS and WhatsApp list each sender as its
// own entry, because to a rep "WhatsApp QR" and "SMS Android" ARE channels.
//
// The native option is only listed when GHL shows a native sender for it, or
// when it is the channel's only option: a location running only "SMS Android"
// has no native SMS, and offering it would send into a channel that is not
// connected.
export function channelOptions(channels = []) {
  const out = []
  const byName = Object.fromEntries((channels || []).map((c) => [c.channel, c]))
  if (byName.Email) {
    out.push({ key: 'Email', channel: 'Email', providerId: null, label: 'Email', kind: 'email' })
  }
  for (const channel of ['WhatsApp', 'SMS']) {
    const live = (byName[channel]?.providers || []).filter((p) => !p.isDeleted)
    const custom = live.filter((p) => p.id !== null && !p.isNative)
    const nativeRow = live.some((p) => p.id !== null && p.isNative)
    if (nativeRow || custom.length === 0) {
      if (live.length) {
        out.push({ key: `${channel}:native`, channel, providerId: null, label: channel, kind: iconKind(channel, channel) })
      }
    }
    for (const p of custom) {
      out.push({ key: `${channel}:${p.id}`, channel, providerId: p.id, label: p.name, kind: iconKind(channel, p.name) })
    }
  }
  return out
}

// Why this person cannot be sent to on this channel, or null when they can.
export function blockedReason(person, channel) {
  if (!person) return 'Pick who to send this to'
  if (channel === 'Email' && !person.email) return 'This contact has no email address'
  if (channel !== 'Email' && !person.phone) return 'This contact has no phone number'
  if (person.dnd?.all || person.dnd?.channels?.[DND_KEY[channel]]) {
    return `This contact has do-not-disturb on for ${channel}`
  }
  return null
}

const nameOf = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || p?.email || p?.phone || 'Contact'
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const textToHtml = (s) => String(s || '').split(/\n/).map((l) => `<p>${escapeHtml(l) || '<br>'}</p>`).join('')
const splitAddresses = (s) => String(s || '').split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean)

export default function MessageComposer({ dealId, people = [], primaryContactId = null, replyTarget = null, onSent }) {
  const rootRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [large, setLarge] = useState(false)
  const [mode, setMode] = useState('message')          // 'message' | 'comment'
  const [channels, setChannels] = useState(null)
  const [channelKey, setChannelKey] = useState(null)
  const [menu, setMenu] = useState(null)               // 'channel' | 'to' | 'from' | null
  const [contactId, setContactId] = useState(primaryContactId)
  const [fromId, setFromId] = useState(null)
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [text, setText] = useState('')
  const [reply, setReply] = useState(null)             // { messageId, subject }
  const [signature, setSignature] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)
  // Files on this message: { key, name, size, url?, uploading, error? }.
  // Uploaded the moment they are picked — GHL wants the file before the send
  // and takes its URL on the message — so Send waits only for the text.
  const [files, setFiles] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    let alive = true
    providersAPI.list({ scope: 'composable' })
      .then((r) => { if (alive) setChannels(r?.channels || []) })
      // No catalogue: Email alone still works through GHL's default sender.
      .catch(() => { if (alive) setChannels([{ channel: 'Email', providers: [] }]) })
    // The rep's saved signature, appended to emails the way Co-Pilot drafts
    // already carry it. Missing is normal — most reps have none.
    controlAPI.getSignature()
      .then((r) => { if (alive) setSignature(r?.signature?.html || null) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const options = useMemo(() => channelOptions(channels || []), [channels])
  const option = options.find((o) => o.key === channelKey) || options[0] || null
  const channel = option?.channel || 'Email'
  const isEmail = channel === 'Email'

  const emailSenders = useMemo(() => {
    const g = (channels || []).find((c) => c.channel === 'Email')
    return (g?.providers || []).filter((p) => !p.isDeleted)
  }, [channels])
  const from = emailSenders.find((p) => (p.id ?? null) === (fromId ?? null)) || emailSenders[0] || null

  // The deal's primary is the default recipient, as it is in GHL; a new deal
  // (or a deal switch) resets to it.
  useEffect(() => { setContactId(primaryContactId) }, [primaryContactId, dealId])
  const person = people.find((p) => p.id === contactId) || people.find((p) => p.primary) || people[0] || null
  const blocked = mode === 'message' ? blockedReason(person, channel) : (person ? null : 'Pick who this is about')

  // Reply ↩ on a timeline email: open as an email to that sender, in that
  // thread. The nonce lets the same email be replied to twice.
  useEffect(() => {
    if (!replyTarget) return
    setMode('message')
    setChannelKey('Email')
    if (replyTarget.contactId && people.some((p) => p.id === replyTarget.contactId)) {
      setContactId(replyTarget.contactId)
    }
    const base = String(replyTarget.subject || '').replace(/^\s*re:\s*/i, '')
    setSubject(base ? `Re: ${base}` : '')
    setReply({ messageId: replyTarget.messageId, subject: replyTarget.subject || '' })
    setExpanded(true)
    setError(null); setSent(null)
    window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      rootRef.current?.querySelector('.ProseMirror')?.focus()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyTarget?.nonce])

  // Close an open menu on an outside click.
  useEffect(() => {
    if (!menu) return
    const onDown = (e) => { if (!e.target.closest?.('.pp-composer-menuwrap')) setMenu(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const ready = files.filter((f) => f.url)
  const uploading = files.some((f) => f.uploading)
  const attachable = mode === 'message'
  // A photo alone is a real SMS/WhatsApp message; an email still needs words.
  const bodyEmpty = mode === 'comment' ? !text.trim()
    : isEmail ? isHtmlEmpty(html)
      : !text.trim() && ready.length === 0
  const canSend = !sending && !uploading && !blocked && !bodyEmpty
    && (mode === 'comment' || !isEmail || subject.trim())

  const reset = () => {
    setHtml(''); setText(''); setCc(''); setBcc('')
    setShowCc(false); setShowBcc(false)
    setReply(null); setSubject('')
    setFiles([])
    setError(null)
  }

  const attach = async (picked) => {
    const list = [...(picked || [])]
    if (!list.length || !person) return
    const added = list.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, uploading: true }))
    setFiles((cur) => [...cur, ...added])
    try {
      const r = await dealsAPI.uploadMessageAttachments(dealId, person.id, list)
      const back = r?.files || []
      setFiles((cur) => cur.map((f) => {
        const i = added.findIndex((a) => a.key === f.key)
        if (i < 0) return f
        const got = back.find((b) => b.name === f.name) || back[i]
        return got?.url ? { ...f, url: got.url, uploading: false } : { ...f, uploading: false, error: 'Did not upload' }
      }))
    } catch (e) {
      // The whole batch failed: say why on each chip, so the rep removes
      // them rather than sending without noticing.
      setFiles((cur) => cur.map((f) => (added.some((a) => a.key === f.key)
        ? { ...f, uploading: false, error: e?.message || 'Did not upload' } : f)))
    }
  }

  const send = async () => {
    if (!canSend) return
    setSending(true); setError(null); setSent(null)
    try {
      if (mode === 'comment') {
        await notesAPI.create({
          contactId: person.id,
          title: COMMENT_TITLE,
          body: textToHtml(text),
          opportunityId: dealId
        })
        setSent('Comment saved — visible only to your team')
      } else {
        let bodyHtml = html
        if (isEmail && signature && !bodyHtml.includes(signature)) bodyHtml = `${bodyHtml}<br>${signature}`
        await dealsAPI.sendMessage(dealId, {
          type: channel,
          contactId: person.id,
          conversationProviderId: isEmail ? (from?.id ?? null) : option.providerId,
          attachments: ready.map((f) => f.url),
          ...(isEmail
            ? {
                subject: subject.trim(),
                html: bodyHtml,
                emailCc: splitAddresses(cc),
                emailBcc: splitAddresses(bcc),
                replyToMessageId: reply?.messageId || undefined
              }
            : { message: text.trim() })
        })
        setSent(`Sent to ${nameOf(person)}`)
      }
      reset()
      onSent?.(mode)
    } catch (e) {
      setError(e?.message || 'Could not send — nothing was sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
  }

  const pickChannel = (o) => {
    setMenu(null)
    if (o === 'comment') { setMode('comment'); return }
    setMode('message')
    // Plain text carries across channels so a switch does not lose typing.
    if (o.channel !== 'Email' && isEmail && !text && !isHtmlEmpty(html)) {
      const d = document.createElement('div'); d.innerHTML = html; setText(d.innerText.trim())
    }
    setChannelKey(o.key)
  }

  // ── Collapsed: one line, as under GHL's thread ─────────────────────────
  if (!expanded) {
    return (
      <div ref={rootRef} className="pp-composer pp-composer-collapsed">
        <button type="button" className="pp-composer-chan" title={`Send by ${option?.label || 'Email'}`}
          onClick={() => setExpanded(true)}>
          <ChannelIcon kind={option?.kind || 'email'} />
          <span className="ms pp-composer-caret">expand_more</span>
        </button>
        <button type="button" className="pp-composer-placeholder" onClick={() => setExpanded(true)}>
          Type a message
        </button>
        <button type="button" className="pp-composer-send" disabled title="Write a message first">
          <span className="ms">send</span>
        </button>
        {sent && <span className="pp-composer-sent">{sent}</span>}
      </div>
    )
  }

  const comment = mode === 'comment'
  return (
    <div ref={rootRef} className={`pp-composer${comment ? ' pp-composer-comment' : ''}${large ? ' pp-composer-large' : ''}`}
      onKeyDown={onKeyDown}>
      {/* Header: channel | Internal Comment, then minimise / enlarge. */}
      <div className="pp-composer-head">
        <span className="pp-composer-menuwrap">
          <button type="button" className={`pp-composer-tab${!comment ? ' pp-composer-tab-on' : ''}`}
            onClick={() => (comment ? setMode('message') : setMenu(menu === 'channel' ? null : 'channel'))}>
            <ChannelIcon kind={option?.kind || 'email'} />
            {option?.label || 'Email'}
            <span className="ms pp-composer-caret">expand_more</span>
          </button>
          {menu === 'channel' && (
            <div className="pp-composer-menu" role="menu">
              {options.map((o) => (
                <button key={o.key} type="button" role="menuitem" className="pp-composer-menuitem"
                  onClick={() => pickChannel(o)}>
                  <ChannelIcon kind={o.kind} />
                  <span className="pp-composer-menulabel">{o.label}</span>
                  {!comment && o.key === option?.key && <span className="ms pp-composer-check">check</span>}
                </button>
              ))}
              <button type="button" role="menuitem" className="pp-composer-menuitem" onClick={() => pickChannel('comment')}>
                <ChannelIcon kind="comment" size={16} />
                <span className="pp-composer-menulabel">{COMMENT_TITLE}</span>
              </button>
            </div>
          )}
        </span>
        <span className="pp-composer-divider" />
        <button type="button" className={`pp-composer-tab${comment ? ' pp-composer-tab-on' : ''}`}
          onClick={() => setMode('comment')}>
          <ChannelIcon kind="comment" size={16} />
          {COMMENT_TITLE}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="pp-composer-icon" title="Minimise" onClick={() => setExpanded(false)}>
          <span className="ms">remove</span>
        </button>
        <button type="button" className="pp-composer-icon" title={large ? 'Smaller' : 'Larger'} onClick={() => setLarge((v) => !v)}>
          <span className="ms">{large ? 'close_fullscreen' : 'open_in_full'}</span>
        </button>
      </div>

      {/* Addressing — not for an internal comment, which goes nowhere. */}
      {!comment && (
        <div className="pp-composer-fields">
          {isEmail && emailSenders.length > 0 && (
            <div className="pp-composer-row">
              <span className="pp-composer-k">From</span>
              <span className="pp-composer-menuwrap">
                <button type="button" className="pp-composer-chip"
                  disabled={emailSenders.length < 2}
                  onClick={() => setMenu(menu === 'from' ? null : 'from')}>
                  {from?.emailFrom || (from?.id == null ? 'Location email (default)' : from?.name)}
                  {emailSenders.length > 1 && <span className="ms pp-composer-caret">expand_more</span>}
                </button>
                {menu === 'from' && (
                  <div className="pp-composer-menu" role="menu">
                    {emailSenders.map((p) => (
                      <button key={p.id ?? 'native'} type="button" className="pp-composer-menuitem"
                        onClick={() => { setFromId(p.id ?? null); setMenu(null) }}>
                        <span className="pp-composer-menulabel">
                          {p.emailFrom || (p.id == null ? 'Location email (default)' : p.name)}
                        </span>
                        {(p.id ?? null) === (from?.id ?? null) && <span className="ms pp-composer-check">check</span>}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            </div>
          )}
          <div className="pp-composer-row">
            <span className="pp-composer-k">To</span>
            <span className="pp-composer-menuwrap">
              <button type="button" className="pp-composer-chip" disabled={people.length < 2}
                onClick={() => setMenu(menu === 'to' ? null : 'to')}>
                <span className="pp-composer-avatar">{nameOf(person).slice(0, 2).toUpperCase()}</span>
                {isEmail ? (person?.email || nameOf(person)) : (person?.phone || nameOf(person))}
                {people.length > 1 && <span className="ms pp-composer-caret">expand_more</span>}
              </button>
              {menu === 'to' && (
                <div className="pp-composer-menu" role="menu">
                  {people.map((p) => {
                    const why = blockedReason(p, channel)
                    return (
                      <button key={p.id} type="button" className="pp-composer-menuitem" title={why || undefined}
                        onClick={() => { setContactId(p.id); setMenu(null) }}>
                        <span className="pp-composer-menulabel">
                          {nameOf(p)}
                          <span className="pp-composer-sub">{why || (isEmail ? p.email : p.phone)}</span>
                        </span>
                        {p.id === person?.id && <span className="ms pp-composer-check">check</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </span>
            <span style={{ flex: 1 }} />
            {isEmail && (
              <>
                {!showCc && <button type="button" className="pp-composer-link" onClick={() => setShowCc(true)}>CC</button>}
                {!showBcc && <button type="button" className="pp-composer-link" onClick={() => setShowBcc(true)}>BCC</button>}
              </>
            )}
          </div>
          {isEmail && showCc && (
            <div className="pp-composer-row">
              <span className="pp-composer-k">CC</span>
              <input className="pp-composer-input" value={cc} onChange={(e) => setCc(e.target.value)}
                placeholder="name@example.com, …" aria-label="CC addresses" />
            </div>
          )}
          {isEmail && showBcc && (
            <div className="pp-composer-row">
              <span className="pp-composer-k">BCC</span>
              <input className="pp-composer-input" value={bcc} onChange={(e) => setBcc(e.target.value)}
                placeholder="name@example.com, …" aria-label="BCC addresses" />
            </div>
          )}
          {isEmail && (
            <div className="pp-composer-row">
              <span className="pp-composer-k">Subject:</span>
              <input className="pp-composer-input" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter subject" aria-label="Subject" />
            </div>
          )}
          {isEmail && reply && (
            <div className="pp-composer-reply">
              <span className="ms">reply</span>
              Replying in the thread “{reply.subject || '(no subject)'}”
              <button type="button" className="pp-composer-link" title="Send as a new email instead"
                onClick={() => setReply(null)}>
                New email instead
              </button>
            </div>
          )}
        </div>
      )}

      <div className="pp-composer-body">
        {!comment && isEmail ? (
          <RichEditor value={html} onChange={setHtml} placeholder="Type a message" minHeight={large ? 320 : 120}
            // On the formatting row with Bold and Link, as GHL has it.
            toolbarExtra={
              <button type="button" className="pp-tb-btn" title="Attach files" aria-label="Attach files"
                disabled={sending || !person}
                onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click() }}>
                <span className="ms" style={{ fontSize: 17 }}>attach_file</span>
              </button>
            } />
        ) : (
          <textarea
            className="pp-composer-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={large ? 12 : 3}
            placeholder={comment ? 'Internal comment - visible only to your team.' : 'Type a message'}
          />
        )}
      </div>

      {/* The files on this message, under the body as GHL shows them. */}
      {attachable && files.length > 0 && (
        <div className="pp-composer-files">
          {files.map((f) => (
            <span key={f.key} className={`pp-composer-file${f.error ? ' pp-composer-file-err' : ''}`}
              title={f.error || f.name}>
              <span className="ms">{f.uploading ? 'progress_activity' : f.error ? 'error' : 'attach_file'}</span>
              <span className="pp-composer-filename">{f.name}</span>
              <span className="pp-composer-filesize">{f.uploading ? 'Uploading…' : f.error ? f.error : fmtSize(f.size)}</span>
              <button type="button" className="pp-composer-fileremove" title="Remove"
                onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))}>
                <span className="ms">close</span>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="pp-composer-foot">
        {attachable && (
          <>
            {/* SMS and WhatsApp have no formatting row, so the paperclip
                stays down here for them; an email's is in its toolbar. */}
            {!isEmail && (
              <button type="button" className="pp-composer-icon" title="Attach files" disabled={sending || !person}
                onClick={() => fileInputRef.current?.click()}>
                <span className="ms">attach_file</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" multiple hidden accept={ATTACH_ACCEPT}
              onChange={(e) => { attach(e.target.files); e.target.value = '' }} />
          </>
        )}
        <span className={`pp-composer-status${error || blocked ? ' pp-composer-status-err' : ''}`}>
          {error || blocked || sent || (comment
            ? `Saved as a note on ${nameOf(person)} for this deal`
            : isEmail && signature ? 'Your signature is added when you send' : '')}
        </span>
        <button type="button" className="pp-composer-icon" title="Discard" disabled={sending}
          onClick={() => { reset(); setSent(null) }}>
          <span className="ms">delete</span>
        </button>
        <button type="button" className="pp-composer-send" disabled={!canSend} onClick={send}
          title={blocked || (comment ? 'Save comment (Ctrl+Enter)' : 'Send (Ctrl+Enter)')}>
          {sending ? <span className="pp-composer-sending">…</span> : <span className="ms">send</span>}
        </button>
      </div>
    </div>
  )
}
