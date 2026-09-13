import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ViewSwitch from '../shared/ViewSwitch'
import ContactTable from '../contacts/ContactTable'
import ContactFilters from '../contacts/ContactFilters'
import DealToolbar from '../deals/DealToolbar'
import { savedViewsAPI } from '../../api/deals'
import { FollowUpChips } from '../shared/ListChrome'
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
  //
  // PLAIN STATE, not useTabState. It was persisted in the tab store, which
  // survives unmount — so leaving Contacts and coming back reopened whichever
  // record was last viewed, and the rep had to press Back to reach the list
  // they asked for. The search text and scroll position below DO persist;
  // those are where a rep was, while an open record is where they went.
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    if (openContactId) setOpenId(openContactId)
  }, [openContactId, setOpenId])
  const [q, setQ] = useTabState('contacts', 'q', '')
  // Server-side search: 19 contacts fits in one page today, but Crittall has
  // thousands — filtering the loaded page would quietly miss most of them.
  const [search, setSearch] = useTabState('contacts', 'search', '')

  // Cards or table. Persisted in localStorage: a display preference that
  // should outlive the session.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('pp.contacts.view') || 'cards' } catch { return 'cards' }
  })
  useEffect(() => {
    try { localStorage.setItem('pp.contacts.view', view) } catch { /* private mode */ }
  }, [view])

  // Filters and saved views — the same machinery the deals tab uses, so a
  // saved contacts view is stored, listed and applied by the same endpoints.
  // useTabState, not plain state: these are WHERE THE REP WAS, and stepping
  // into a contact record and back should not discard them.
  const [filters, setFilters] = useTabState('contacts', 'filters', {})
  const [views, setViews] = useTabState('contacts', 'views', [])
  const [activeViewId, setActiveViewId] = useTabState('contacts', 'activeViewId', null)
  const [dirtyView, setDirtyView] = useTabState('contacts', 'dirtyView', null)
  const [viewError, setViewError] = useState(null)
  const [tagList, setTagList] = useState([])

  useEffect(() => {
    let alive = true
    savedViewsAPI.list('contacts')
      .then((r) => { if (alive) setViews(r?.views || []) })
      // A failed fetch leaves the strip empty, which is still a working page.
      .catch(() => {})
    contactsAPI.tagCatalogue()
      .then((r) => { if (alive) setTagList((r?.tags || []).map((t) => t.name || t)) })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPage = useCallback(
    ({ cursor }) => contactsAPI.list({
      limit: 20, cursor, q: search || undefined,
      // `view` is the display mode, not a filter — stripped when a saved view
      // is applied, so it never reaches the query.
      contactType: filters.contactType || undefined,
      tag: filters.tag || undefined
    }),
    [search, filters]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem } =
    usePagedList({ fetchPage, key: 'contacts', deps: [search, filters] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  // Saved-view actions. DECLARED HERE, below the state they close over —
  // `const` is not hoisted, and a callback reading `filters` or `search` from
  // above throws on first render.
  const applyView = useCallback((id) => {
    setActiveViewId(id)
    setDirtyView(null)
    const v = views.find((x) => x.id === id)
    const f = { ...(v?.filters || {}) }
    if (f.view) { setView(f.view); delete f.view }
    setFilters(f)
    if (f.q !== undefined) { setQ(f.q || ''); setSearch(f.q || '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views])

  const saveView = useCallback(async (name) => {
    try {
      const r = await savedViewsAPI.save({
        scope: 'contacts',
        name,
        filters: { ...filters, ...(search ? { q: search } : {}), view }
      })
      // Replace by id so re-saving a name updates its tab rather than adding
      // a second one — the server upserts, and the list must agree.
      setViews((prev) => [...prev.filter((v) => v.id !== r.view.id), r.view])
      setActiveViewId(r.view.id)
      setDirtyView(null)
    } catch (e) {
      setViewError(e.message || 'That view could not be saved')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, search, view])

  const deleteView = useCallback(async (id) => {
    try {
      await savedViewsAPI.remove(id)
      setViews((prev) => prev.filter((v) => v.id !== id))
      if (activeViewId === id) { setActiveViewId(null); setFilters({}) }
    } catch (e) {
      setViewError(e.message || 'That view could not be deleted')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewId])

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

      {/* Filters and saved views — the same toolbar the deals tab uses, so a
          saved contacts view behaves identically to a saved deals view. */}
      <div style={{ marginBottom: 14 }}>
        <DealToolbar
          views={views}
          activeViewId={activeViewId}
          onSelectView={applyView}
          onSaveView={saveView}
          onDeleteView={deleteView}
          dirtyViewId={dirtyView}
          onUpdateView={(id) => {
            const v = views.find((x) => x.id === id)
            if (v) saveView(v.name)
          }}
          filters={filters}
          onClearFilter={(k) => {
            setFilters((f) => { const next = { ...f }; delete next[k]; return next })
            setDirtyView(activeViewId)
          }}
          onClearAll={() => { setFilters({}); setActiveViewId(null); setDirtyView(null) }}
          count={loading ? undefined : contacts.length}
          countLabel="contacts"
          filterControl={
            <ContactFilters
              filters={filters}
              tags={tagList}
              onChange={(next) => { setFilters(next); setDirtyView(activeViewId) }}
            />
          }
        >
          <ViewSwitch
            value={view}
            onChange={setView}
            options={[
              { id: 'cards', icon: 'grid_view', label: 'Cards' },
              { id: 'table', icon: 'table_rows', label: 'Table' }
            ]}
          />
        </DealToolbar>
        {viewError && (
          <p style={{
            margin: '8px 0 0', fontSize: 'var(--text-md)',
            color: 'var(--status-stuck-text)'
          }}>
            {viewError}
          </p>
        )}
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

      {/* TABLE — the same paged `contacts`, rendered dense. */}
      {view === 'table' && contacts.length > 0 && (
        <ContactTable
          contacts={contacts}
          onOpen={(id) => {
            setOpenId(id)
            if (onNavigate) onNavigate({ contactId: id })
          }}
        />
      )}

      <div
        style={view === 'table' ? { display: 'none' } : {
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
      className="pp-card"
      style={{
        // The per-contact accent stripe stays: .pp-card sets a uniform border
        // and this overrides the top edge only, so the card keeps its identity
        // colour while gaining the shared shadow and hover lift.
        borderTop: `3px solid var(--accent-${c.accent})`,
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
          {/* Type and follow-up on one line. The counts were not shown at all
              — a contact with three open tasks looked identical to one with
              none, so finding outstanding work meant opening each record. */}
          {(c.contactType || c.openTaskCount > 0 || c.noteCount > 0) && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                marginTop: 2, fontSize: 'var(--text-base)', color: 'var(--text-muted)'
              }}
            >
              {c.contactType && <span>{c.contactType}</span>}
              <FollowUpChips tasks={c.openTaskCount} notes={c.noteCount} />
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
          Open
          <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
        </button>
      </div>

      {/* THE FIELDS, as READABLE LINES that become inputs on click.
          Six permanently-open boxes per card turned a list of twenty people
          into eighty inputs — the page read as a form, and finding someone
          meant scanning label text rather than names. An InlineEdit shows the
          value plainly and becomes a control only when the reader means to
          change it. */}
      <div className="pp-cc-fields">
        <InlineEdit
          label="Name" icon="person"
          value={[valueOf('firstName'), valueOf('lastName')].filter(Boolean).join(' ')}
          placeholder="Add a name"
          disabled={saving}
          dirty={'firstName' in changes || 'lastName' in changes}
          invalid={errorField === 'firstName' || errorField === 'lastName'}
          // One line for what a person calls themselves, split back on save.
          // Two boxes for one name is a data-entry idea, not a reading one.
          onChange={(v) => {
            const parts = String(v).trim().split(/\s+/).filter(Boolean)
            setField('firstName', parts.shift() || '')
            setField('lastName', parts.join(' '))
          }}
        />
        <InlineEdit
          label="Email" icon="mail"
          value={valueOf('email')} placeholder="Add an email"
          disabled={saving} dirty={'email' in changes}
          invalid={errorField === 'email'}
          onChange={(v) => setField('email', v)}
        />
        <InlineEdit
          label="Phone" icon="call"
          value={valueOf('phone')} placeholder="Add a phone"
          disabled={saving} dirty={'phone' in changes}
          invalid={errorField === 'phone'}
          onChange={(v) => setField('phone', v)}
        />
        <InlineEdit
          label="Business" icon="business"
          value={valueOf('business')} placeholder="Add a business"
          disabled={saving} dirty={'business' in changes}
          invalid={errorField === 'business'}
          onChange={(v) => setField('business', v)}
        />
        <InlineEdit
          label="Address" icon="location_on"
          value={valueOf('address')} placeholder="Add an address"
          disabled={saving} dirty={'address' in changes}
          invalid={errorField === 'address'}
          onChange={(v) => setField('address', v)}
        />
      </div>

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

// One field as a READABLE LINE that becomes an input on click.
//
// The card rendered six permanently-open boxes, so twenty contacts were
// eighty inputs and the page read as a form rather than a list of people.
// The VALUE matters far more often than the control: a rep scans this list to
// find someone and edits occasionally.
//
// Click or Enter opens it; Enter or blur closes it; Escape abandons the edit.
// Nothing saves here — the change joins the card's own Save, so one editing
// session is one request.
function InlineEdit({
  label, value, placeholder, icon, onChange, disabled, dirty, invalid
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef(null)

  useEffect(() => { if (open) ref.current?.focus() }, [open])

  const commit = () => {
    setOpen(false)
    if (draft !== (value || '')) onChange(draft)
  }

  if (open) {
    return (
      <label className="pp-cc-row pp-cc-row-open">
        {icon && <span className="ms pp-cc-icon">{icon}</span>}
        <span className="pp-cc-label">{label}</span>
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            // Escape abandons rather than commits — the reflex when you
            // realise you opened the wrong field.
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
          }}
          className={invalid ? 'pp-cc-input pp-cc-input-bad' : 'pp-cc-input'}
          placeholder={placeholder}
        />
      </label>
    )
  }

  return (
    <button
      type="button"
      onClick={() => { if (!disabled) { setDraft(value || ''); setOpen(true) } }}
      disabled={disabled}
      className={dirty ? 'pp-cc-row pp-cc-row-dirty' : 'pp-cc-row'}
      title={`${label} — click to edit`}
    >
      {/* The icon carries the field's identity, so the label can stay small
          and quiet rather than being the loudest thing in the row. */}
      {icon && <span className="ms pp-cc-icon">{icon}</span>}
      <span className="pp-cc-label">{label}</span>
      <span className={value ? 'pp-cc-value' : 'pp-cc-value pp-cc-value-empty'}>
        {value || placeholder}
      </span>
      {/* On hover only — a pencil on every row of every card is six pencils
          per person. */}
      <span className="ms pp-cc-pencil">edit</span>
    </button>
  )
}
