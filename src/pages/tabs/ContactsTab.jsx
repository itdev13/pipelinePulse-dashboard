import React, { useCallback, useState } from 'react'
import { contactsAPI } from '../../api/contacts'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { CardGridSkeleton, LoadMore } from '../shared/ListChrome'
import ContactDetail from '../contacts/ContactDetail'

// Contacts tab — every contact in this location.
// Grid of cards with editable-in-future fields; today they're read-only.
// Each card leads with the contact's accent (top-edge stripe + avatar tint)
// so the identity stays consistent with the rest of the app.
export default function ContactsTab({ onOpenDeal }) {
  // Which contact's record is open. Null = the grid. Kept here rather than in
  // the shell because it's local navigation within this tab.
  const [openId, setOpenId] = useState(null)
  const [q, setQ] = useState('')
  // Server-side search: 19 contacts fits in one page today, but Crittall has
  // thousands — filtering the loaded page would quietly miss most of them.
  const [search, setSearch] = useState('')

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
        onBack={() => setOpenId(null)}
        onOpenDeal={onOpenDeal}
      />
    )
  }

  return (
    <div
      style={{
        maxWidth: 1660, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: '16px 20px 28px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontSize: 24 }}>Contacts</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {loading ? 'Loading…' : `${contacts.length}${hasMore ? '+' : ''} in this location`}
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
            padding: '0 12px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', fontSize: 13, color: 'var(--text-body)'
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: 16, marginBottom: 14,
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--tint-rose)', color: 'var(--status-stuck)', fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {/* Card grid, so the skeleton mirrors the card shape and the layout
          doesn't jump when the real contacts land. minWidth matches the real
          grid's 320px track. */}
      {loading && <CardGridSkeleton cards={9} minWidth={320} />}

      {!loading && contacts.length === 0 && !error && (
        <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
          {search
            ? 'No contacts match — clear the search to see everything.'
            : 'No contacts in this sub-account yet.'}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14
        }}
      >
        {contacts.map((c) => {
          const initials = ((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?'
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpenId(c.id)
                }
              }}
              title="Open contact record"
              style={{
                cursor: 'pointer',
                border: '1px solid var(--border-default)',
                borderTop: `3px solid var(--accent-${c.accent})`,
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                boxShadow: 'var(--shadow-card)',
                padding: 14,
                display: 'grid', gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 38, height: 38, flex: 'none',
                    borderRadius: '50%',
                    background: `var(--tint-${c.accent})`,
                    color: `var(--accent-${c.accent})`,
                    fontSize: 13, fontWeight: 600
                  }}
                >
                  {initials}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 15, fontWeight: 600, color: 'var(--text-heading)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                  >
                    {c.name || '—'}
                  </div>
                  {c.contactType && (
                    <div
                      style={{
                        display: 'inline-block', marginTop: 3,
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                        background: `var(--tint-${c.accent})`, color: `var(--accent-${c.accent})`
                      }}
                    >
                      {c.contactType}
                    </div>
                  )}
                </div>
                <DndBadge dnd={c.dnd} />
              </div>

              <ChannelRow dnd={c.dnd} hasEmail={!!c.email} hasPhone={!!c.phone} />

              <div style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-body)' }}>
                {c.business && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>business</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.business}</span>
                  </div>
                )}
                {c.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>mail</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                  </div>
                )}
                {c.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>call</span>
                    {c.phone}
                  </div>
                )}
                {c.address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span className="ms" style={{ fontSize: 14, color: 'var(--text-faint)' }}>location_on</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</span>
                  </div>
                )}
              </div>

              {/* Tags + deal count */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 2 }}>
                {c.openDeals > 0 && (
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--tint-pine)', color: 'var(--accent-pine)',
                      fontSize: 11, fontWeight: 600
                    }}
                  >
                    <span className="ms" style={{ fontSize: 13 }}>sell</span>
                    {c.openDeals} {c.openDeals === 1 ? 'open deal' : 'open deals'}
                  </span>
                )}
                {(c.tags || []).slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--gray-100)', color: 'var(--text-muted)',
                      fontSize: 11
                    }}
                  >
                    {tag}
                  </span>
                ))}
                {c.tags && c.tags.length > 5 && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    +{c.tags.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
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

// Contact-permission badge. Counts channels the customer has switched off
// (migration 052 promoted DND to columns; the API pre-computes the count).
//
// Loud on purpose: this is the difference between contacting someone who
// asked us not to and respecting it, and the AI draft gate refuses these
// channels outright (spec rule 7). A quiet grey chip would get missed.
function DndBadge({ dnd }) {
  if (!dnd) return null

  if (dnd.all) {
    return (
      <span
        title="This contact has asked not to be contacted on any channel"
        style={{
          flex: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 26, padding: '0 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--status-stuck)', color: '#fff',
          fontSize: 11.5, fontWeight: 600
        }}
      >
        <span className="ms" style={{ fontSize: 14 }}>block</span>
        Do not contact
      </span>
    )
  }

  const n = dnd.blockedCount || 0
  if (n === 0) return null
  const which = (dnd.blockedChannels || []).map(labelFor).join(', ')
  return (
    <span
      title={`Off: ${which}`}
      style={{
        flex: 'none',
        display: 'inline-flex', alignItems: 'center',
        height: 26, padding: '0 10px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--status-stuck)', color: '#fff',
        fontSize: 11.5, fontWeight: 600
      }}
    >
      {n} channel{n === 1 ? '' : 's'} off
    </span>
  )
}

// Which channels are reachable. Shows all four so an available channel is as
// visible as a blocked one — a rep deciding how to follow up needs both.
// A channel with no address (no email on file) reads as unavailable rather
// than blocked: different reason, same practical outcome.
function ChannelRow({ dnd, hasEmail, hasPhone }) {
  if (!dnd) return null
  const items = [
    { key: 'email',    icon: 'mail',  label: 'Email',    has: hasEmail },
    { key: 'sms',      icon: 'sms',   label: 'SMS',      has: hasPhone },
    { key: 'call',     icon: 'call',  label: 'Call',     has: hasPhone },
    { key: 'whatsapp', icon: 'chat',  label: 'WhatsApp', has: hasPhone }
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((it) => {
        const blocked = dnd.all || dnd.channels?.[it.key]
        const missing = !it.has
        const reason = blocked
          ? dnd.reasons?.[it.key] || `${it.label} switched off by the contact`
          : missing
          ? `No ${it.key === 'email' ? 'email address' : 'phone number'} on file`
          : `${it.label} available`
        return (
          <span
            key={it.key}
            title={reason}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 22, padding: '0 8px',
              borderRadius: 'var(--radius-pill)',
              border: `1px solid ${blocked ? 'var(--tint-rose)' : 'var(--border-default)'}`,
              background: blocked ? 'var(--tint-rose)' : missing ? 'var(--gray-50)' : '#fff',
              color: blocked
                ? 'var(--status-stuck)'
                : missing
                ? 'var(--text-faint)'
                : 'var(--text-muted)',
              fontSize: 10.5, fontWeight: 500,
              textDecoration: blocked ? 'line-through' : 'none'
            }}
          >
            <span className="ms" style={{ fontSize: 12 }}>
              {blocked ? 'block' : it.icon}
            </span>
            {it.label}
          </span>
        )
      })}
      {dnd.inbound && (
        <span
          title="This contact has inbound messages switched off"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            height: 22, padding: '0 8px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--tint-gold)',
            background: 'var(--tint-gold)', color: 'var(--accent-gold)',
            fontSize: 10.5, fontWeight: 500
          }}
        >
          <span className="ms" style={{ fontSize: 12 }}>call_received</span>
          Inbound off
        </span>
      )}
    </div>
  )
}

function labelFor(k) {
  if (k === 'sms') return 'SMS'
  if (k === 'whatsapp') return 'WhatsApp'
  return k.charAt(0).toUpperCase() + k.slice(1)
}
