import React, { useEffect, useRef, useState } from 'react'
import { contactsAPI } from '../../api/contacts'
import {
  Panel, StateMessage, SkeletonStyles, Bar, formatDate, initialsFor, nameFor
} from '../shared/ListChrome'

// Contact record — everything about one person, in four panels:
//
//   Header      identity + how to reach them
//   Details     editable fields, saved on blur
//   Do not disturb   per-channel switches
//   Deals       which opportunities they're on
//   All messages     every message, with the deal it's filed to
//
// The last panel is the useful one: showing all messages together is what
// makes a wrongly-filed message visible, because it's the row whose deal tag
// looks wrong beside its content.

export default function ContactDetail({ contactId, onBack, onOpenDeal }) {
  const [contact, setContact] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setContact(null)
    setError(null)
    contactsAPI.get(contactId)
      .then((c) => alive && setContact(c))
      .catch((err) => alive && setError(err.message || 'Failed to load contact'))
    return () => { alive = false }
  }, [contactId])

  if (error) {
    return (
      <Shell onBack={onBack}>
        <div
          style={{
            padding: 16, borderLeft: '3px solid var(--status-stuck)',
            background: 'var(--tint-rose)', color: 'var(--status-stuck)',
            borderRadius: 'var(--radius-md)', fontSize: 'var(--text-md)'
          }}
        >
          {error}
        </div>
      </Shell>
    )
  }

  if (!contact) {
    return (
      <Shell onBack={onBack}>
        <SkeletonStyles />
        {[120, 220, 260, 140].map((h, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: '#fff', padding: 16, display: 'grid', gap: 10
            }}
          >
            <Bar w={i % 2 ? '32%' : '46%'} h={15} />
            <Bar w="100%" h={h / 3} r="var(--radius-md)" />
          </div>
        ))}
      </Shell>
    )
  }

  return (
    <Shell onBack={onBack}>
      <Header contact={contact} />
      <Details
        contact={contact}
        onSaved={(patch) => setContact((c) => ({ ...c, ...patch }))}
      />
      <DoNotDisturb
        contact={contact}
        onChange={(dnd) => setContact((c) => ({ ...c, dnd }))}
      />
      <Deals deals={contact.deals} onOpenDeal={onOpenDeal} />
      <AllMessages
        messages={contact.messages}
        onOpenDeal={onOpenDeal}
      />
    </Shell>
  )
}

function Shell({ children, onBack }) {
  return (
    <div
      style={{
        maxWidth: 1000, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: 'var(--space-1) 20px var(--space-7)',
        display: 'grid', gap: 14
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          style={{
            justifySelf: 'start',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: 'none', background: 'none', padding: 'var(--space-1) 0',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
            color: 'var(--text-link)'
          }}
        >
          <span className="ms" style={{ fontSize: 17 }}>arrow_back</span>
          All contacts
        </button>
      )}
      {children}
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────

function Header({ contact }) {
  const accent = `var(--accent-${contact.accent || 'sky'})`
  const tint = `var(--tint-${contact.accent || 'sky'})`
  const name = nameFor(contact)

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: accent,
        ['--panel-tint']: tint,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        padding: 'var(--space-4) 18px',
        display: 'grid', gap: 'var(--space-3)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 46, height: 46, flex: 'none',
            borderRadius: '50%',
            background: tint, color: accent,
            fontSize: 'var(--text-lg)', fontWeight: 600
          }}
        >
          {initialsFor(contact.firstName, contact.lastName, name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 600, color: 'var(--text-heading)' }}>
              {name}
            </h1>
            <span
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase',
                padding: '3px 9px', borderRadius: 'var(--radius-sm)',
                background: 'var(--gray-100)', color: 'var(--text-muted)'
              }}
            >
              Contact record
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
            {[contact.contactType, contact.business].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px 22px',
          fontSize: 'var(--text-md)', color: 'var(--text-body)'
        }}
      >
        {contact.email && <Fact icon="mail" href={`mailto:${contact.email}`}>{contact.email}</Fact>}
        {contact.phone && <Fact icon="call" href={`tel:${contact.phone}`}>{contact.phone}</Fact>}
        {contact.address && <Fact icon="location_on">{contact.address}</Fact>}
        {contact.timezone && <Fact icon="schedule">{contact.timezone}</Fact>}
      </div>

      {contact.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {contact.tags.map((t) => (
            <span
              key={t}
              style={{
                height: 22, padding: '0 9px',
                display: 'inline-flex', alignItems: 'center',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border-default)',
                background: 'var(--gray-50)', color: 'var(--text-body)',
                fontSize: 'var(--text-sm)', fontWeight: 500
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function Fact({ icon, children, href }) {
  const inner = (
    <>
      <span className="ms" style={{ fontSize: 15, color: 'var(--text-faint)' }}>{icon}</span>
      {children}
    </>
  )
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
    color: 'inherit', textDecoration: href ? 'none' : undefined
  }
  return href ? <a href={href} style={style}>{inner}</a> : <span style={style}>{inner}</span>
}

// ── Details (editable) ────────────────────────────────────────────────

const FIELDS = [
  ['firstName', 'First name', 'text'],
  ['lastName', 'Last name', 'text'],
  ['business', 'Business', 'text'],
  ['address', 'Address', 'text'],
  ['email', 'Primary email', 'email'],
  ['phone', 'Primary phone', 'tel']
]

const CONTACT_TYPES = ['Homeowner', 'Architect', 'Builder', 'Trade account', 'Developer']

function Details({ contact, onSaved }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(FIELDS.map(([k]) => [k, contact[k] || '']))
  )
  const [type, setType] = useState(contact.contactType || '')
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const timer = useRef(null)

  // Save on blur rather than per keystroke: a PATCH per character is a lot of
  // requests for no benefit, and a half-typed email saved mid-word then shown
  // "everywhere this contact appears" reads as data corruption.
  const save = async (patch) => {
    setState('saving')
    setError(null)
    try {
      await contactsAPI.update(contact.id, patch)
      onSaved(patch)
      setState('saved')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      setError(err.message || 'Could not save')
      setState('error')
    }
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (key) => {
    const value = key === 'contactType' ? type : draft[key]
    if ((contact[key] || '') === value) return
    save({ [key]: value })
  }

  return (
    <Panel
      icon="badge"
      title="Details"
      accent="sky"
      meta={
        state === 'saving' ? 'Saving…'
          : state === 'saved' ? 'Saved'
          : state === 'error' ? error
          : 'Editable'
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-3)', padding: '14px var(--space-4)'
        }}
      >
        {FIELDS.map(([key, label, type_]) => (
          <label key={key} style={{ display: 'grid', gap: 5, minWidth: 0 }}>
            <span
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: 'var(--text-muted)'
              }}
            >
              {label}
            </span>
            <input
              type={type_}
              value={draft[key]}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              onBlur={() => commit(key)}
              placeholder={`Add ${label.toLowerCase()}`}
              style={inputStyle}
            />
          </label>
        ))}

        <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            Contact type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            onBlur={() => commit('contactType')}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">—</option>
            {/* Keep an unrecognised value selectable rather than silently
                rewriting what GHL sent. */}
            {type && !CONTACT_TYPES.includes(type) && <option value={type}>{type}</option>}
            {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {(contact.secondaryEmails?.length > 0 || contact.secondaryPhones?.length > 0) && (
        <div
          style={{
            padding: '0 var(--space-4) var(--space-3)',
            display: 'flex', flexWrap: 'wrap', gap: '6px 18px',
            fontSize: 'var(--text-base)', color: 'var(--text-muted)'
          }}
        >
          {contact.secondaryEmails?.map((e) => (
            <span key={e}>Also: {e}</span>
          ))}
          {contact.secondaryPhones?.map((p) => (
            <span key={p}>Also: {p}</span>
          ))}
        </div>
      )}

      <p
        style={{
          margin: 0, padding: '10px var(--space-4)',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--gray-25)',
          fontSize: 'var(--text-base)', color: 'var(--text-muted)'
        }}
      >
        Changes show everywhere this contact appears — deal cards, timelines and
        search. They are not yet pushed back to GoHighLevel, so an edit there
        will overwrite one made here.
      </p>
    </Panel>
  )
}

const inputStyle = {
  width: '100%', height: 36, boxSizing: 'border-box',
  padding: '0 11px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)',
  background: '#fff',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-heading)'
}

// ── Do not disturb ────────────────────────────────────────────────────

const DND_ROWS = [
  ['all', 'All channels', 'block', 'Master switch — mutes everything below'],
  ['email', 'Email', 'mail', 'No outbound email'],
  ['sms', 'Text messages', 'sms', 'No SMS, WhatsApp or iMessage'],
  ['call', 'Calls and voicemail', 'call', 'No outbound dials or voicemail drops'],
  ['inbound', 'Inbound calls and SMS', 'call_received', 'Their inbound calls and texts are silenced']
]

function DoNotDisturb({ contact, onChange }) {
  const [pending, setPending] = useState(null)
  const dnd = contact.dnd || {}

  const isBlocked = (key) => {
    if (key === 'all') return dnd.all === true
    if (key === 'inbound') return dnd.inbound === true
    // Master switch wins: showing a channel as "on" while everything is muted
    // would be a lie.
    return dnd.all === true || dnd.channels?.[key] === true
  }

  const toggle = async (key) => {
    const next = !isBlocked(key)
    setPending(key)
    try {
      const res = await contactsAPI.setDnd(contact.id, key, next)
      onChange(res.dnd)
    } catch (err) {
      // Nothing changed locally, so there's nothing to roll back.
    } finally {
      setPending(null)
    }
  }

  const blockedCount = dnd.blockedCount || 0
  const meta = dnd.all
    ? 'All channels off'
    : blockedCount > 0
    ? `${blockedCount} channel${blockedCount === 1 ? '' : 's'} off`
    : 'All channels on'

  return (
    <Panel icon="do_not_disturb_on" title="Do not disturb" accent="rose" meta={meta}>
      <p
        style={{
          margin: 0, padding: '10px var(--space-4)',
          borderTop: '1px solid var(--border-default)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--gray-50)',
          fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-body)'
        }}
      >
        Turn a channel off and it goes quiet everywhere this contact appears —
        deal cards flag it, and the AI will not draft a message on that channel.
      </p>

      {DND_ROWS.map(([key, label, icon, hint], i) => {
        const blocked = isBlocked(key)
        // A per-channel row is not independently toggleable while the master
        // switch is on — it's already muted, so offering the control would
        // imply an effect it can't have.
        const forced = key !== 'all' && key !== 'inbound' && dnd.all === true
        return (
          <div
            key={key}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              borderBottom: i === DND_ROWS.length - 1
                ? 'none'
                : '1px solid var(--border-default)',
              opacity: forced ? 0.6 : 1
            }}
          >
            <span
              className="ms"
              style={{ fontSize: 'var(--text-xl)', color: blocked ? 'var(--status-stuck)' : 'var(--text-faint)' }}
            >
              {icon}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block', fontSize: 'var(--text-lg)', fontWeight: 600,
                  color: 'var(--text-heading)'
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>{hint}</span>
            </span>
            <Switch
              on={!blocked}
              disabled={forced || pending === key}
              busy={pending === key}
              onToggle={() => toggle(key)}
              label={label}
            />
          </div>
        )
      })}
    </Panel>
  )
}

// On = reachable, Off = blocked. Worth stating, because the underlying data is
// inverted (GHL's "DND active" means blocked) and a switch that reads "on" for
// "muted" would be a trap.
function Switch({ on, disabled, busy, onToggle, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', flex: 'none' }}>
      <span
        style={{
          fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: 'var(--tracking-label)',
          color: on ? 'var(--green-600)' : 'var(--status-stuck)'
        }}
      >
        {busy ? '···' : on ? 'ON' : 'OFF'}
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={`${label} — ${on ? 'on' : 'off'}`}
        disabled={disabled}
        onClick={onToggle}
        style={{
          position: 'relative',
          width: 42, height: 24, flex: 'none',
          border: 'none', borderRadius: 'var(--radius-pill)',
          background: on ? 'var(--green-300)' : 'var(--gray-300)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s ease-out'
        }}
      >
        <span
          style={{
            position: 'absolute', top: 3, left: on ? 21 : 3,
            width: 18, height: 18, borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(31,36,48,.3)',
            transition: 'left 0.15s ease-out'
          }}
        />
      </button>
    </span>
  )
}

// ── Deals ─────────────────────────────────────────────────────────────

function Deals({ deals = [], onOpenDeal }) {
  return (
    <Panel
      icon="sell"
      title="Deals"
      accent="pine"
      meta={`${deals.length} ${deals.length === 1 ? 'deal' : 'deals'}`}
    >
      <StateMessage
        empty={deals.length === 0}
        emptyText="This contact isn't on any deals yet."
      />
      {deals.map((d, i) => (
        <div
          key={d.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: i === deals.length - 1 ? 'none' : '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 17, color: 'var(--accent-pine)' }}>sell</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block', fontSize: 'var(--text-lg)', fontWeight: 600,
                color: 'var(--text-heading)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              {d.name || '(unnamed deal)'}
            </span>
            <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
              {[d.stage, d.pipeline].filter(Boolean).join(' · ')}
            </span>
          </span>
          {d.value && (
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)',
                color: 'var(--text-heading)', flex: 'none'
              }}
            >
              {d.value}
            </span>
          )}
          <button
            onClick={() => onOpenDeal && onOpenDeal(d.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
              height: 32, padding: '0 13px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: '#fff', color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', cursor: 'pointer'
            }}
          >
            Open deal
            <span className="ms" style={{ fontSize: 15 }}>arrow_forward</span>
          </button>
        </div>
      ))}
    </Panel>
  )
}

// ── All messages ──────────────────────────────────────────────────────

function AllMessages({ messages = [], onOpenDeal }) {
  const filed = messages.filter((m) => m.dealId).length
  const unassigned = messages.length - filed

  return (
    <Panel
      icon="forum"
      title="All messages"
      accent="gold"
      meta={
        messages.length === 0
          ? '0'
          : `${messages.length} total${unassigned > 0 ? ` · ${unassigned} unassigned` : ''}`
      }
    >
      <p
        style={{
          margin: 0, padding: '10px var(--space-4)',
          borderTop: '1px solid var(--border-default)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--gray-50)',
          fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-body)'
        }}
      >
        Every message is filed to one deal at most. Seeing them together is how
        a wrongly-filed message shows up — it's the one whose deal looks wrong
        beside what it says.
      </p>

      <StateMessage
        empty={messages.length === 0}
        emptyText="No messages synced for this contact yet."
      />

      {messages.map((m, i) => (
        <div
          key={m.id}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: i === messages.length - 1 ? 'none' : '1px solid var(--border-default)'
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, flex: 'none', marginTop: 1,
              borderRadius: 'var(--radius-md)',
              background: 'var(--gray-50)'
            }}
          >
            <span className="ms" style={{ fontSize: 16, color: 'var(--text-muted)' }}>
              {m.channel === 'email' ? 'mail'
                : m.channel === 'call' ? 'call'
                : m.channel === 'note' ? 'sticky_note_2'
                : 'sms'}
            </span>
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase', color: 'var(--accent-clay)'
                }}
              >
                {m.channel}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {m.direction === 'in' ? 'In ←' : '→ Out'}
              </span>
              <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)' }}>
                {m.who}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                {formatDate(m.at)}
              </span>
            </div>
            <p
              style={{
                margin: '4px 0 0', maxWidth: 640,
                fontSize: 'var(--text-md)', lineHeight: 1.5, color: 'var(--text-body)'
              }}
            >
              {m.body || <span style={{ color: 'var(--text-faint)' }}>(no readable text)</span>}
            </p>
          </div>

          {/* Which deal it's filed to. Unassigned is stated, not hidden —
              an unfiled message is exactly what someone needs to notice. */}
          <button
            onClick={() => m.dealId && onOpenDeal && onOpenDeal(m.dealId)}
            title={m.dealId ? 'Open this deal' : 'Not filed to any deal'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, flex: 'none',
              maxWidth: 190,
              height: 28, padding: '0 11px',
              border: `1px solid ${m.dealId ? 'var(--green-300)' : 'var(--border-strong)'}`,
              borderRadius: 'var(--radius-pill)',
              background: m.dealId ? 'var(--tint-pine)' : 'var(--gray-50)',
              color: m.dealId ? 'var(--green-600)' : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 500,
              cursor: m.dealId ? 'pointer' : 'default'
            }}
          >
            <span className="ms" style={{ fontSize: 13 }}>sell</span>
            <span
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {m.dealName || 'Unassigned'}
            </span>
          </button>
        </div>
      ))}
    </Panel>
  )
}
