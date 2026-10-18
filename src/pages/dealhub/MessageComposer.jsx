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

const CHANNEL_ICON = { Email: 'mail', SMS: 'sms', WhatsApp: 'chat' }
const DND_KEY = { Email: 'email', SMS: 'sms', WhatsApp: 'whatsapp' }

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
    out.push({ key: 'Email', channel: 'Email', providerId: null, label: 'Email', icon: CHANNEL_ICON.Email })
  }
  for (const channel of ['WhatsApp', 'SMS']) {
    const live = (byName[channel]?.providers || []).filter((p) => !p.isDeleted)
    const custom = live.filter((p) => p.id !== null && !p.isNative)
    const nativeRow = live.some((p) => p.id !== null && p.isNative)
    if (nativeRow || custom.length === 0) {
      if (live.length) {
        out.push({ key: `${channel}:native`, channel, providerId: null, label: channel, icon: CHANNEL_ICON[channel] })
      }
    }
    for (const p of custom) {
      out.push({ key: `${channel}:${p.id}`, channel, providerId: p.id, label: p.name, icon: CHANNEL_ICON[channel] })
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

  const bodyEmpty = mode === 'comment' || !isEmail ? !text.trim() : isHtmlEmpty(html)
  const canSend = !sending && !blocked && !bodyEmpty && (mode === 'comment' || !isEmail || subject.trim())

  const reset = () => {
    setHtml(''); setText(''); setCc(''); setBcc('')
    setShowCc(false); setShowBcc(false)
    setReply(null); setSubject('')
    setError(null)
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
          <span className="ms">{option?.icon || 'mail'}</span>
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
            <span className="ms">{option?.icon || 'mail'}</span>
            {option?.label || 'Email'}
            <span className="ms pp-composer-caret">expand_more</span>
          </button>
          {menu === 'channel' && (
            <div className="pp-composer-menu" role="menu">
              {options.map((o) => (
                <button key={o.key} type="button" role="menuitem" className="pp-composer-menuitem"
                  onClick={() => pickChannel(o)}>
                  <span className="ms">{o.icon}</span>
                  <span className="pp-composer-menulabel">{o.label}</span>
                  {!comment && o.key === option?.key && <span className="ms pp-composer-check">check</span>}
                </button>
              ))}
              <button type="button" role="menuitem" className="pp-composer-menuitem" onClick={() => pickChannel('comment')}>
                <span className="ms">visibility</span>
                <span className="pp-composer-menulabel">{COMMENT_TITLE}</span>
              </button>
            </div>
          )}
        </span>
        <span className="pp-composer-divider" />
        <button type="button" className={`pp-composer-tab${comment ? ' pp-composer-tab-on' : ''}`}
          onClick={() => setMode('comment')}>
          <span className="ms">visibility</span>
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
          <RichEditor value={html} onChange={setHtml} placeholder="Type a message" minHeight={large ? 320 : 120} />
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

      <div className="pp-composer-foot">
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
