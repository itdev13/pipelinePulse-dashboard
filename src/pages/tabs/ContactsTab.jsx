import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem } =
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
            onSaved={(id, saved) => {
              // Apply what the CRM echoed rather than what was typed, so a
              // reformatted phone or trimmed name shows the stored value.
              if (!saved) return
              patchItem((x) => x.id === id, {
                firstName: saved.firstName ?? null,
                lastName: saved.lastName ?? null,
                email: saved.email ?? null,
                phone: saved.phone ?? null,
                business: saved.companyName ?? saved.business ?? null,
                address: saved.address1 ?? saved.address ?? null
              })
            }}
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
// Editable in place, like the business Company Info panel.
//
// These fields used to be `disabled` inputs — they looked like a form and did
// nothing, which is worse than plain text: a rep would type into one and watch
// the change vanish. They write to the CRM now.
//
// contactType is the exception and stays read-only: it is a GHL CUSTOM FIELD,
// not a property of the contact, so the update endpoint rejects it. The server's
// contactPatch drops it for the same reason.
function ContactCard({ c, onOpen, onOpenDeal, onSaved }) {
  const initials = ((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?'

  // name → edited value. Absent = untouched, which keeps '' (a deliberate
  // clear) distinguishable from "not edited".
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)
  const [saved, setSaved] = useState(false)

  const valueOf = (name) => (name in edits ? edits[name] : (c[name] ?? ''))

  const changes = useMemo(() => {
    const out = {}
    for (const [name, v] of Object.entries(edits)) {
      const now = String(v ?? '').trim()
      const was = String(c[name] ?? '').trim()
      if (now !== was) out[name] = now
    }
    return out
  }, [c, edits])

  const dirty = Object.keys(changes).length > 0

  const setField = (name, v) => {
    setEdits((prev) => ({ ...prev, [name]: v }))
    setError(null)
    setErrorField(null)
    setSaved(false)
  }

  const revert = () => {
    setEdits({})
    setError(null)
    setErrorField(null)
  }

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    setErrorField(null)
    try {
      const res = await contactsAPI.update(c.id, changes)
      // Clear the local edits so the card reads from the refreshed record —
      // otherwise a value the CRM normalised (a reformatted phone number) would
      // keep showing what was typed.
      setEdits({})
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
      if (onSaved) onSaved(c.id, res.contact || null)
    } catch (err) {
      setError(err.message || 'Could not save that — try again')
      setErrorField(err.data?.field || null)
    } finally {
      setSaving(false)
    }
  }

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
        {/* Save and Cancel sit BEFORE Record, so the action that keeps your work
            is nearer than the one that navigates away from it. Both appear only
            when something is edited — a permanently visible Save on twenty
            cards would be twenty controls that do nothing. */}
        {dirty && !saving && (
          <button
            onClick={revert}
            title="Discard these changes"
            style={{
              display: 'inline-flex', alignItems: 'center',
              flex: 'none',
              height: 30, padding: '0 11px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              background: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
              color: 'var(--text-body)', cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        )}
        {(dirty || saving || saved) && (
          <button
            onClick={save}
            disabled={!dirty || saving}
            title={`Save ${Object.keys(changes).length} change${Object.keys(changes).length === 1 ? '' : 's'} to your CRM`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              flex: 'none',
              height: 30, padding: '0 12px',
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: saved ? 'var(--status-done)' : 'var(--brand-primary)',
              color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer'
            }}
          >
            {saving && (
              <span className="ms pp-spin" style={{ fontSize: 14 }}>progress_activity</span>
            )}
            {saved && <span className="ms" style={{ fontSize: 14 }}>check</span>}
            {saving ? 'Saving' : saved ? 'Saved' : 'Save'}
          </button>
        )}

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
        {[
          ['firstName', 'First name'],
          ['lastName',  'Last name'],
          ['email',     'Primary email'],
          ['phone',     'Primary phone'],
          ['business',  'Business']
        ].map(([name, label]) => (
          <Field
            key={name}
            label={label}
            value={valueOf(name)}
            onChange={(v) => setField(name, v)}
            disabled={saving}
            invalid={errorField === name}
            dirty={name in changes}
          />
        ))}
        {/* Read-only: contactType is a GHL custom field, not a contact
            property, so the update endpoint rejects it. An editable box here
            would be a control whose every save failed. */}
        <Field
          label="Contact type"
          value={c.contactType}
          readOnly
          title="Contact type is a custom field — edit it in your CRM"
        />
      </div>
      <Field
        label="Address"
        value={valueOf('address')}
        onChange={(v) => setField('address', v)}
        disabled={saving}
        invalid={errorField === 'address'}
        dirty={'address' in changes}
      />

      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            padding: '8px 10px',
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-base)', color: 'var(--status-stuck-text)'
          }}
        >
          <span className="ms" style={{ fontSize: 15, flex: 'none', marginTop: 1 }}>error</span>
          {error}
        </div>
      )}

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
// One field on a contact card.
//
// A real input now. It used to be a `disabled` input showing "Not set" as its
// VALUE — which looked like a form, refused to be typed into, and put the words
// "Not set" where a value belongs. Now the placeholder says that and the box
// works.
function Field({ label, value, onChange, disabled, invalid, dirty, readOnly, title }) {
  const editable = typeof onChange === 'function' && !readOnly
  return (
    <div style={{ minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value ?? ''}
        onChange={editable ? (e) => onChange(e.target.value) : undefined}
        readOnly={!editable}
        disabled={disabled}
        placeholder="Not set"
        title={title || (editable ? undefined : `${label} — edit in your CRM`)}
        style={{
          width: '100%', boxSizing: 'border-box',
          height: 34, padding: '0 10px',
          border: `1px solid ${
            invalid ? 'var(--status-stuck)'
              : dirty ? 'var(--brand-primary)'
                : 'var(--border-default)'
          }`,
          borderRadius: 'var(--radius-sm)',
          // Read-only fields stay grey so they read as unavailable rather than
          // as an empty box someone forgot to fill.
          background: editable ? '#fff' : 'var(--gray-50)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          color: 'var(--text-body)',
          cursor: editable ? 'text' : 'not-allowed',
          outline: 'none'
        }}
      />
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
