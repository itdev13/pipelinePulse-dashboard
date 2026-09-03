import React, { useMemo, useState } from 'react'
import { dealsAPI } from '../../api/deals'
import ContactPicker from '../shared/ContactPicker'

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
  onPeopleFilterChange,
  // Needed to add someone — the link is made against the opportunity.
  dealId,
  // Called after a successful add so the parent refetches; the RelationCreate
  // webhook is what actually writes the row.
  onPeopleChanged
}) {
  if (!people || people.length === 0) return null

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-sky-text)',
        ['--panel-tint']: 'var(--tint-sky)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: '13px var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--panel-tint, var(--gray-25))'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-sky-text)' }}>group</span>
        <h3
          style={{
            fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--accent-sky-text)',
            margin: 0, flex: 1
          }}
        >
          People
        </h3>
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
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
      <AddContactFooter dealId={dealId} people={people} onAdded={onPeopleChanged} />
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
// What to show as the card's heading, and which field it came from.
//
// `usedField` matters: whatever gets promoted to the heading must not also
// appear as a detail row below it. The card was printing "SSEN" as the name and
// then "📞 SSEN" underneath — a business name behind a phone icon.
//
// Order is business → email → phone, not the old email → phone → business. A
// business is the most human label of the three, and a phone number is the
// least — it was winning over "SSEN" purely because of where it sat.
function displayFor(p) {
  const first = (p.firstName || '').trim()
  const last  = (p.lastName || '').trim()
  if (first && last) {
    return { name: `${first} ${last}`, initials: (first[0] + last[0]).toUpperCase(), usedField: null }
  }
  if (first) return { name: first, initials: first.slice(0, 2).toUpperCase(), usedField: null }
  if (last)  return { name: last,  initials: last.slice(0, 2).toUpperCase(), usedField: null }

  if (p.business) {
    return {
      name: p.business,
      initials: initialsFromWords(p.business),
      usedField: 'business'
    }
  }
  if (p.email) {
    return { name: p.email, initials: p.email[0].toUpperCase(), usedField: 'email' }
  }
  if (p.phone) {
    // A person icon, not '#'. The old placeholder read as a broken glyph — the
    // card showed a literal hash in the avatar circle.
    return { name: p.phone, initials: null, usedField: 'phone' }
  }
  return { name: 'Unnamed contact', initials: null, usedField: null }
}

// "SSEN" -> "SS", "Halloran Architects" -> "HA". Two letters either way, so
// every avatar is the same visual weight.
function initialsFromWords(value) {
  const words = String(value).trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] || '').slice(0, 2).toUpperCase() || null
}

function PersonCard({ p, filterActive, onShowInThread, allowRemove }) {
  const { name: fullName, initials, usedField } = displayFor(p)
  // Two variants, two jobs. The vivid fill is right for a 3px border; as TEXT
  // on its own tint it's 4.13:1, below AA — so the avatar initials use the
  // darkened -text pair.
  const accent = `var(--accent-${p.accent})`
  const accentText = `var(--accent-${p.accent}-text)`
  const tint = `var(--tint-${p.accent})`

  return (
    <div
      style={{
        minWidth: 0,
        padding: '14px var(--space-4)',
        borderRight: '1px solid var(--border-default)',
        borderBottom: '1px solid var(--border-default)',
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
            background: tint, color: accentText,
            fontSize: 'var(--text-md)', fontWeight: 600
          }}
        >
          {/* No usable initials (a phone-only contact) gets a person icon.
              The old fallback was a literal '#', which read as a broken glyph
              rather than "we don't know who this is". */}
          {initials || <span className="ms" style={{ fontSize: 19 }}>person</span>}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-heading)' }}>
              {fullName}
            </span>
            {p.primary && (
              <span
                style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase',
                  padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                  // Solid: on green-50 (1.13:1 against the white card) the badge
            // was invisible and PRIMARY read as ordinary small text.
            background: 'var(--green-600)', color: '#fff'
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
                  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase',
                  padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
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
          display: 'grid', gap: 'var(--space-1)', marginTop: 10,
          fontSize: 'var(--text-base)', color: 'var(--text-body)'
        }}
      >
        {p.business && usedField !== 'business' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>business</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.business}
            </span>
          </span>
        )}
        {p.email && usedField !== 'email' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>mail</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.email}
            </span>
          </span>
        )}
        {p.phone && usedField !== 'phone' && (
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
        fontSize: 'var(--text-base)',
        opacity: !onClick ? 0.55 : 1
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 15 }}>{icon}</span>}
      {children}
    </button>
  )
}

// Add a person to the deal.
//
// This was a bare <input> that typed into local state and printed
// "Add-contact search wires up next" — it searched nothing and saved nothing.
//
// ContactPicker is the app's existing searchable contact control: it queries
// GET /api/contacts?q= under RLS, matches name, email, phone AND business in
// one query, debounces, and guards against out-of-order responses. Rebuilding
// a search box here would have been a third copy of that.
//
// COLLAPSED until clicked, like the tag and field editors: a rail listing who
// is on a deal should not carry a permanently open search field.
function AddContactFooter({ dealId, people = [], onAdded }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Everyone already on the deal, so the picker cannot offer a duplicate —
  // GHL would accept the second link and the rail would show the person twice.
  const alreadyOn = useMemo(
    () => new Set((people || []).map((p) => p.id).filter(Boolean)),
    [people]
  )

  const add = async (contactId) => {
    if (!contactId || saving) return
    if (alreadyOn.has(contactId)) {
      setError('That person is already on this deal')
      window.setTimeout(() => setError(null), 4000)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await dealsAPI.addContact(dealId, contactId)
      setOpen(false)
      // The RelationCreate webhook writes opportunity_contacts, so the rail
      // refreshes from the server rather than us inventing a row — the same
      // reason nothing is written locally on the server side.
      onAdded && onAdded()
    } catch (err) {
      setError(err.message || 'Could not add that person — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
        padding: '10px var(--space-4)',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          disabled={!dealId}
          title={dealId ? 'Add someone to this deal' : 'No deal in scope'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 30, padding: '0 12px 0 10px',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-card)', color: 'var(--text-body)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 500,
            cursor: dealId ? 'pointer' : 'not-allowed'
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>person_add</span>
          Add someone
        </button>
      ) : (
        <>
          <span className="ms" style={{ fontSize: 17, color: 'var(--text-muted)' }}>
            person_add
          </span>
          <span style={{ minWidth: 280, flex: '0 1 340px' }}>
            <ContactPicker
              value={null}
              onChange={add}
              // Seeded with nobody: the people already on the deal are the ones
              // NOT to offer, so seeding with them would surface exactly the
              // wrong candidates first.
              seed={[]}
              invalid={!!error}
            />
          </span>
          <button
            onClick={() => { setOpen(false); setError(null) }}
            disabled={saving}
            style={{
              height: 30, padding: '0 11px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-card)', color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
              cursor: saving ? 'default' : 'pointer'
            }}
          >
            Cancel
          </button>
        </>
      )}

      {saving && (
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
          Adding…
        </span>
      )}
      {error && (
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--status-stuck-text)' }}>
          {error}
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
          display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase',
          padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
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
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
        fontSize: 'var(--text-xs)', fontWeight: 600,
        padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
        background: 'var(--tint-rose)', color: 'var(--status-stuck)'
      }}
    >
      <span className="ms" style={{ fontSize: 12 }}>block</span>
      {blocked.length} off
    </span>
  )
}
