import React, { useCallback, useEffect } from 'react'
import { contactsAPI } from '../../api/contacts'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import { CardGridSkeleton, LoadMore } from '../shared/ListChrome'
import ContactDetail from '../contacts/ContactDetail'

// Contacts tab — every contact in this location.
// Grid of cards with editable-in-future fields; today they're read-only.
// Each card leads with the contact's accent (top-edge stripe + avatar tint)
// so the identity stays consistent with the rest of the app.
export default function ContactsTab({
  onOpenDeal, openContactId, onContactViewed,
  // Opening a card is navigation the shell never sees — it happens entirely
  // inside this tab. Report it so the Back button has a step to return to,
  // and so pressing Back doesn't restore a record the user has already left.
  onNavigate
}) {
  // Which contact's record is open. Null = the grid. Local navigation within
  // this tab, except when another tab hands us a contact to open (a contact
  // chip on a task or note) — openContactId is that entry point.
  const [openId, setOpenId] = useTabState('contacts', 'openId', null)

  useEffect(() => {
    if (openContactId) setOpenId(openContactId)
  }, [openContactId, setOpenId])
  const [q, setQ] = useTabState('contacts', 'q', '')
  // Server-side search: 19 contacts fits in one page today, but Crittall has
  // thousands — filtering the loaded page would quietly miss most of them.
  const [search, setSearch] = useTabState('contacts', 'search', '')

  const fetchPage = useCallback(
    ({ cursor }) => contactsAPI.list({ limit: 20, cursor, q: search || undefined }),
    [search]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore } =
    usePagedList({ fetchPage, key: 'contacts', deps: [search] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const contacts = items || []

  if (openId) {
    return (
      <ContactDetail
        contactId={openId}
        onBack={() => {
          setOpenId(null)
          // Clear the shell's request too, or coming back to this tab would
          // reopen the same record.
          if (onContactViewed) onContactViewed()
          // Tell the shell we're back on the list, so its Back button doesn't
          // reopen the record we just closed.
          if (onNavigate) onNavigate({ contactId: null })
        }}
        onOpenDeal={onOpenDeal}
      />
    )
  }

  return (
    <div
      style={{
        maxWidth: 1660, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: 'var(--space-4) 20px 28px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>Contacts</h1>
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
          {loading
            ? 'Loading…'
            : `${contacts.length}${hasMore ? '+' : ''} in this location — edit in your CRM, changes sync back`}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSearch(q.trim()) }}
          onBlur={() => setSearch(q.trim())}
          placeholder="Search name, email, phone or business — press Enter"
          style={{
            marginLeft: 'auto',
            width: 360, height: 36, boxSizing: 'border-box',
            padding: '0 var(--space-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', fontSize: 'var(--text-md)', color: 'var(--text-body)'
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: 16, marginBottom: 14,
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--tint-rose)', color: 'var(--status-stuck)', fontSize: 'var(--text-md)'
          }}
        >
          {error}
        </div>
      )}

      {/* Card grid, so the skeleton mirrors the card shape and the layout
          doesn't jump when the real contacts land. minWidth matches the real
          grid's 320px track. */}
      {loading && <CardGridSkeleton cards={6} minWidth={430} />}

      {!loading && contacts.length === 0 && !error && (
        <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 'var(--text-md)' }}>
          {search
            ? 'No contacts match — clear the search to see everything.'
            : 'No contacts in this sub-account yet.'}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(430px, 1fr))',
          gap: 14
        }}
      >
        {contacts.map((c) => (
          <ContactCard
            key={c.id}
            c={c}
            onOpen={() => {
              setOpenId(c.id)
              if (onNavigate) onNavigate({ contactId: c.id })
            }}
            onOpenDeal={onOpenDeal}
          />
        ))}
      </div>

      {!loading && contacts.length > 0 && (
        <LoadMore
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          count={contacts.length}
          noun="contact"
        />
      )}
    </div>
  )
}

// One contact, as a record card.
//
// Laid out as labelled fields rather than a summary line, because this is the
// contact's record — the same shape a rep sees when editing it. Fields render
// as inputs/selects so the card reads as the record it is, but they are
// DISABLED: editing has to write back to GoHighLevel, which this app has never
// done (no POST path, no write scopes). A live-looking input that silently
// discards a change would be worse than a visibly read-only one.
function ContactCard({ c, onOpen, onOpenDeal }) {
  const initials = ((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?'

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderTop: `3px solid var(--accent-${c.accent})`,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        boxShadow: 'var(--shadow-card)',
        padding: 14,
        display: 'grid', gap: 'var(--space-3)'
      }}
    >
      {/* Identity + the way into the full record */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, flex: 'none',
            borderRadius: '50%',
            background: `var(--tint-${c.accent})`,
            color: `var(--accent-${c.accent}-text)`,
            fontSize: 'var(--text-md)', fontWeight: 600
          }}
        >
          {initials}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-heading)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
          >
            {c.name || '—'}
          </div>
          {c.contactType && (
            <div style={{ marginTop: 1, fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
              {c.contactType}
            </div>
          )}
        </div>
        <button
          onClick={onOpen}
          title="Open the full contact record"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
            cursor: 'pointer',
            height: 30, padding: '0 var(--space-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            background: '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
            color: 'var(--text-body)'
          }}
        >
          Record
          <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
        </button>
      </div>

      {/* Fields, two per row, matching the record's own layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="First name" value={c.firstName} />
        <Field label="Last name" value={c.lastName} />
        <Field label="Primary email" value={c.email} />
        <Field label="Primary phone" value={c.phone} />
        <Field label="Business" value={c.business} select />
        <Field label="Contact type" value={c.contactType} select />
      </div>
      <Field label="Address" value={c.address} />

      {/* Contact permissions. Loud on purpose — the AI draft gate refuses these
          channels outright (spec rule 7), and a rep needs to see it before
          picking up the phone. */}
      {(c.dnd?.all || c.dnd?.blockedCount > 0) && <DndLine dnd={c.dnd} />}

      {/* Deals. PRIMARY marks the ones this contact owns rather than is merely
          linked to — an architect appears on a deal without owning it. */}
      {c.deals?.length > 0 && (
        <div>
          <FieldLabel>Deals</FieldLabel>
          <div style={{ display: 'grid', gap: 5 }}>
            {c.deals.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenDeal?.(d.id)}
                title="Open this deal"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  justifySelf: 'start', maxWidth: '100%',
                  cursor: onOpenDeal ? 'pointer' : 'default',
                  height: 28, padding: '0 10px',
                  border: '1px solid var(--green-100)',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--tint-pine)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
                  color: 'var(--green-600)'
                }}
              >
                <span className="ms" style={{ fontSize: 14, flex: 'none' }}>sell</span>
                <span
                  style={{
                    minWidth: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}
                >
                  {d.name}
                  {d.value != null && ` · ${money(d.value)}`}
                  {d.stage && ` · ${d.stage}`}
                </span>
                {d.primary && (
                  <span
                    style={{
                      flex: 'none',
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--green-600)', color: '#fff',
                      fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: 'var(--tracking-label)'
                    }}
                  >
                    PRIMARY
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// A labelled field. Rendered as a real input/select so the card reads as the
// record, but disabled — see ContactCard's note on write-back.
function Field({ label, value, select }) {
  const empty = value == null || String(value).trim() === ''
  const shared = {
    width: '100%', boxSizing: 'border-box',
    height: 34, padding: '0 10px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    background: empty ? 'var(--gray-50)' : '#fff',
    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
    color: empty ? 'var(--text-faint)' : 'var(--text-body)',
    fontStyle: empty ? 'italic' : 'normal',
    cursor: 'not-allowed'
  }
  return (
    <div style={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      {select ? (
        // A select rather than an input, because these are pick-lists in GHL.
        // Only the current value is listed: offering options we cannot save
        // would invite a change that goes nowhere.
        <select
          disabled
          value="v"
          title={`${label} — edit in your CRM`}
          style={{ ...shared, appearance: 'auto' }}
        >
          <option value="v">{empty ? 'Not set' : value}</option>
        </select>
      ) : (
        <input
          readOnly
          disabled
          value={empty ? 'Not set' : value}
          title={`${label} — edit in your CRM`}
          style={shared}
        />
      )}
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <span
      style={{
        display: 'block', marginBottom: 4,
        fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
        textTransform: 'uppercase', color: 'var(--text-muted)'
      }}
    >
      {children}
    </span>
  )
}

// "1 channel off" / "Do not contact" as an inline line rather than a corner
// badge — at card width a badge competes with the Record button.
function DndLine({ dnd }) {
  const all = dnd.all
  const n = dnd.blockedCount || 0
  const which = (dnd.blockedChannels || []).map(labelFor).join(', ')
  return (
    <span
      title={all ? 'This contact has asked not to be contacted on any channel' : `Off: ${which}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        justifySelf: 'start',
        fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--status-stuck)'
      }}
    >
      <span className="ms" style={{ fontSize: 16 }}>{all ? 'block' : 'notifications_off'}</span>
      {all ? 'Do not contact' : `${n} channel${n === 1 ? '' : 's'} off`}
    </span>
  )
}

function money(v) {
  return `£${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}

function labelFor(k) {
  if (k === 'sms') return 'SMS'
  if (k === 'whatsapp') return 'WhatsApp'
  return k.charAt(0).toUpperCase() + k.slice(1)
}
