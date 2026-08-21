import React, { useState } from 'react'

// Deal Hub — People section (opp-associated contacts).
//
// One card per contact linked to this opportunity via
// OPPORTUNITIES_CONTACTS_ASSOCIATION. Primary contact first, then followers.
// Each card takes the contact's own accent colour (stable hash) so the same
// person looks the same across every screen (People card, timeline sender
// dot, filter chips, contact record).
//
// Actions on each card:
//   Show in thread     → filters the timeline to this person's messages
//   View contact       → opens the contact record (TODO — future)
//   Make primary       → shown on non-primary cards only; sets is_primary
//                        for this contact on this opp (TODO — needs write)
//   Remove             → shown on all cards; unlinks this contact from
//                        this opp — the deal must retain at least one
//                        contact (TODO — needs write)

export default function PeopleSection({
  people = [],
  peopleFilter = [],
  onPeopleFilterChange
}) {
  if (!people || people.length === 0) return null

  return (
    <section
      style={{
        border: '2px solid var(--accent-sky)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-sky)' }}>group</span>
        <h3
          style={{
            fontSize: 18, fontWeight: 600, color: 'var(--accent-sky)',
            margin: 0, flex: 1
          }}
        >
          People
        </h3>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </span>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 0
        }}
      >
        {people.map((p) => (
          <PersonCard
            key={p.id}
            p={p}
            filterActive={peopleFilter.includes(p.id)}
            onShowInThread={() =>
              onPeopleFilterChange && onPeopleFilterChange([p.id])
            }
            allowRemove={people.length > 1}
          />
        ))}
      </div>

      {/* Add-contact search (mockup-parity — write flow deferred) */}
      <AddContactFooter />
    </section>
  )
}

// Contacts in GHL are often skeletal — sometimes just a phone or an email,
// no name at all. Rather than falling back to a generic "Contact" label
// (which the user can't tell apart from every other unnamed person), pick
// the best identifier we actually have, in this order:
//   1. first + last  (e.g. "Mark Whitmore")
//   2. first only    (e.g. "Mark")
//   3. last only     (e.g. "Whitmore")
//   4. email         (e.g. "mark@example.com")
//   5. phone         (e.g. "+447338628553")
//   6. business      (e.g. "SSEN")
//   7. "Contact"     — genuine last resort, no data at all
// Initials follow the same fallback: initials of a real name if we have
// one, else first char of the chosen identifier, else "?".
function displayFor(p) {
  const first = (p.firstName || '').trim()
  const last  = (p.lastName || '').trim()
  if (first && last) return { name: `${first} ${last}`, initials: (first[0] + last[0]).toUpperCase() }
  if (first)         return { name: first, initials: first[0].toUpperCase() }
  if (last)          return { name: last, initials: last[0].toUpperCase() }
  if (p.email)       return { name: p.email, initials: p.email[0].toUpperCase() }
  if (p.phone)       return { name: p.phone, initials: '#' }
  if (p.business)    return { name: p.business, initials: p.business[0].toUpperCase() }
  return { name: 'Contact', initials: '?' }
}

function PersonCard({ p, filterActive, onShowInThread, allowRemove }) {
  const { name: fullName, initials } = displayFor(p)
  const accent = `var(--accent-${p.accent})`
  const tint = `var(--tint-${p.accent})`

  return (
    <div
      style={{
        minWidth: 0,
        padding: '14px 16px',
        borderRight: '1px solid var(--border-default)',
        borderBottom: '2px solid var(--accent-sky)',
        borderTop: `3px solid ${accent}`,
        // filter-active state — subtle green ring around the card
        boxShadow: filterActive ? '0 0 0 2px var(--brand-primary) inset' : 'none'
      }}
    >
      {/* Head — avatar + name + primary + DND pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, flex: 'none',
            borderRadius: '50%',
            background: tint, color: accent,
            fontSize: 12, fontWeight: 600
          }}
        >
          {initials}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-heading)' }}>
              {fullName}
            </span>
            {p.primary && (
              <span
                style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--green-50)', color: 'var(--green-600)'
                }}
              >
                Primary
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {p.contactType && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                  background: tint, color: accent
                }}
              >
                {p.contactType}
              </span>
            )}
            {/* Contact permissions. Shown on the card because this is where a
                rep decides how to follow up — and the AI draft gate refuses
                these channels, so the two must visibly agree. */}
            <DndChip dnd={p.dnd} />
          </div>
        </div>
      </div>

      {/* Contact details */}
      <div
        style={{
          display: 'grid', gap: 4, marginTop: 10,
          fontSize: 12, color: 'var(--text-body)'
        }}
      >
        {p.business && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>business</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.business}
            </span>
          </span>
        )}
        {p.email && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>mail</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.email}
            </span>
          </span>
        )}
        {p.phone && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>call</span>
            {p.phone}
          </span>
        )}
      </div>

      {/* Actions row */}
      <div
        style={{
          display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap'
        }}
      >
        <GhostBtn
          icon="filter_alt"
          onClick={onShowInThread}
          active={filterActive}
        >
          Show in thread
        </GhostBtn>
        <GhostBtn icon="person" title="Contact record — coming next">
          View contact
        </GhostBtn>
        {!p.primary && (
          <GhostBtn title="Set as primary — coming next">Make primary</GhostBtn>
        )}
        {allowRemove && (
          <GhostBtn
            icon="person_remove"
            danger
            title="Remove from deal — coming next"
          >
            Remove
          </GhostBtn>
        )}
      </div>
    </div>
  )
}

function GhostBtn({ icon, children, onClick, active, danger, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: onClick ? 'pointer' : 'default',
        height: 30, padding: '0 10px',
        border: active
          ? '1px solid var(--brand-primary)'
          : danger
          ? '1px solid var(--border-strong)'
          : '1px solid transparent',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--surface-selected)' : 'transparent',
        color: active
          ? 'var(--brand-primary)'
          : danger
          ? 'var(--status-stuck)'
          : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12.5,
        opacity: !onClick ? 0.55 : 1
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 15 }}>{icon}</span>}
      {children}
    </button>
  )
}

function AddContactFooter() {
  const [q, setQ] = useState('')
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 16px',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      <span className="ms" style={{ fontSize: 17, color: 'var(--text-muted)' }}>person_add</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Add someone to this deal — search contacts"
        style={{
          width: 320, height: 32, boxSizing: 'border-box',
          padding: '0 10px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-body)'
        }}
      />
      {q && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Add-contact search wires up next
        </span>
      )}
    </div>
  )
}

// Blocked-channel chip for a person card. Reads the same payload the AI draft
// gate uses (routes/deals.js people[].dnd), so a rep never sees "Email
// available" next to a draft that refused to use email.
function DndChip({ dnd }) {
  if (!dnd) return null
  if (dnd.all) {
    return (
      <span
        title="This contact has asked not to be contacted on any channel"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
          textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 'var(--radius-sm)',
          background: 'var(--status-stuck)', color: '#fff'
        }}
      >
        <span className="ms" style={{ fontSize: 12 }}>block</span>
        Do not contact
      </span>
    )
  }
  const blocked = dnd.blockedChannels || []
  if (blocked.length === 0) return null
  return (
    <span
      title={`Switched off: ${blocked.map((b) => (b === 'sms' ? 'SMS' : b)).join(', ')}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 600,
        padding: '2px 8px', borderRadius: 'var(--radius-sm)',
        background: 'var(--tint-rose)', color: 'var(--status-stuck)'
      }}
    >
      <span className="ms" style={{ fontSize: 12 }}>block</span>
      {blocked.length} off
    </span>
  )
}
