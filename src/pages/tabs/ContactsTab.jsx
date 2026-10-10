import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ViewSwitch from '../shared/ViewSwitch'
import ContactTable from '../contacts/ContactTable'
import ContactFilters, { activityParams, contactFilterLabels } from '../contacts/ContactFilters'
import DealToolbar from '../deals/DealToolbar'
import { savedViewsAPI, dealsAPI } from '../../api/deals'
import { FollowUpChips, Panel, DealPill, Truncate } from '../shared/ListChrome'
import { contactsAPI } from '../../api/contacts'
import BusinessPickerModal from '../shared/BusinessPickerModal'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import { useAuth } from '../../context/AuthContext'
import { OwnerFilter, TagFilter } from '../shared/ListFilters'
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
  const [userList, setUserList] = useState([])

  useEffect(() => {
    let alive = true
    savedViewsAPI.list('contacts')
      .then((r) => { if (alive) setViews(r?.views || []) })
      // A failed fetch leaves the strip empty, which is still a working page.
      .catch(() => {})
    contactsAPI.tagCatalogue()
      .then((r) => { if (alive) setTagList((r?.tags || []).map((t) => t.name || t)) })
      .catch(() => {})
    dealsAPI.users()
      .then((r) => { if (alive) setUserList(r?.users || []) })
      // Same as above: no owner dropdown is better than a broken page.
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Owner defaults to the signed-in user, and a change sticks: `filters` is
  // useTabState, so switching to All owners survives a tab switch and a reload
  // rather than snapping back to Mine on every visit.
  //
  // Seeded once, and only when nothing has been chosen yet — re-applying the
  // default on later renders would undo the rep's own choice, and re-applying
  // it after they picked "All owners" would look like the control was broken.
  const { session } = useAuth()
  const ownerSeeded = useRef(false)
  useEffect(() => {
    if (ownerSeeded.current) return
    if (!session?.user?.id) return
    ownerSeeded.current = true
    if (filters.assignedTo === undefined) {
      setFilters({ ...filters, assignedTo: session.user.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const fetchPage = useCallback(
    ({ cursor }) => contactsAPI.list({
      limit: 20, cursor, q: search || undefined,
      // `view` is the display mode, not a filter — stripped when a saved view
      // is applied, so it never reaches the query.
      contactType: filters.contactType || undefined,
      assignedTo: filters.assignedTo || undefined,
      tag: filters.tag || undefined,
      minValue: filters.minValue || undefined,
      maxValue: filters.maxValue || undefined,
      hasDeals: filters.hasDeals || undefined,
      // One UI control, two server parameters — see activityParams.
      ...activityParams(filters.activity)
    }),
    [search, filters]
  )
  const { items, error, hasMore, total, loadingMore, loading, loadMore, patchItem } =
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
    // `view` is NOT restored — it is the layout (cards / table), not a filter,
    // and forcing it threw a rep out of the view they were working in. Old
    // views still carry the key, so it is deleted rather than trusted.
    delete f.view
    setFilters(f)
    if (f.q !== undefined) { setQ(f.q || ''); setSearch(f.q || '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views])

  const saveView = useCallback(async (name) => {
    try {
      const r = await savedViewsAPI.save({
        scope: 'contacts',
        name,
        // No `view`: a saved view is a set of FILTERS. The layout is a
        // per-rep preference that outlives any one view — see applyView.
        filters: { ...filters, ...(search ? { q: search } : {}) }
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
  }, [filters, search])

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

      {/* A Panel, like Tasks and Notes — the title, count and controls on one
          header, with the toolbar in the panel's own band. It used to be a
          bare heading on the page ground with a separate bordered toolbar
          below, so Contacts was the one tab that did not look like the rest. */}
      <Panel
        icon="group"
        title="Contacts"
        accent="sky"
        // The server's total for the CURRENT filter. It used to be the loaded
        // row count, so the badge read "20+" and then "25" as you scrolled —
        // a number that answered no question a rep actually has.
        count={loading ? null : (total ?? contacts.length)}
        countTitle={total != null ? `${total} contacts match these filters` : undefined}
        // The controls sit on the TITLE row, not in a band below it.
        //
        // Contacts has one row of them — search, filters, view switch — and a
        // separate band for a single row put an empty strip under the title
        // and left the switch stranded mid-row. Tasks keeps its band because
        // it has two rows (Status and Due) that genuinely need their own line.
        actionFill
        contentPad
        // Search, Owner and Tag share the TITLE row (`action`); Filters,
        // chips and Save view go to `actionBreak`, a second header row that
        // starts at the panel's left padding rather than at the title's right
        // edge. Two lines, both aligned to the same margin.
        // Row 1, beside the title: what a rep changes constantly.
        action={
          <>
              <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSearch(q.trim()) }}
          onBlur={() => setSearch(q.trim())}
          placeholder="Search name, email, phone or business — press Enter"
          style={{
            // No marginLeft:auto — that pushed it to the far right of the
            // page header it used to live in. In the toolbar it leads the row.
            // Shrinks before the dropdowns do — a search box narrowed to 200px
            // is still usable, whereas a truncated owner name is not.
            width: 300, minWidth: 180, flex: '1 1 300px', maxWidth: 360,
            height: 36, boxSizing: 'border-box',
            padding: '0 var(--space-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-card)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-lg)', color: 'var(--text-body)'
          }}
        />
              {/* Owner and Tag upfront, the rest behind "Filters" — see the
                  same pair on DealsTab for why. */}
              <OwnerFilter
                value={filters.assignedTo ?? ''}
                onChange={(v) => {
                  setFilters({ ...filters, assignedTo: v || undefined })
                  setDirtyView(activeViewId)
                }}
              />
              <TagFilter
                value={filters.tag || ''}
                onChange={(v) => {
                  setFilters({ ...filters, tag: v || undefined })
                  setDirtyView(activeViewId)
                }}
              />
              {/* Everything after this starts a second line: the popover of
                  remaining filters, the chips it produces, and Save view.
                  Search, Owner and Tag are what a rep reaches for constantly;
                  the rest is occasional and belongs below rather than pushing
                  the common controls off the right edge. */}
          </>
        }
        // Row 2, at the panel's left padding: the filter popover, the chips it
        // produces, saved views, and the display switch.
        actionBreak={
          <>
          <DealToolbar
            bare
            countLabel="contacts"
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
          // Chips read as sentences, not raw values — "Quiet for 30+ days"
          // rather than "Activity quiet:30".
          filterLabels={contactFilterLabels(filters, userList)}
          onClearFilter={(k) => {
            setFilters((f) => { const next = { ...f }; delete next[k]; return next })
            setDirtyView(activeViewId)
          }}
          onClearAll={() => { setFilters({}); setActiveViewId(null); setDirtyView(null) }}
          // No count here — the panel's title badge carries it. Two counts a
          // few pixels apart is one too many, and they disagreed the moment a
          // filter narrowed the list.
          filterControl={
            <>
              <ContactFilters
              filters={filters}
              tags={tagList}
              users={userList}
              onChange={(next) => { setFilters(next); setDirtyView(activeViewId) }}
            />
            </>
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
          </>
        }
      >

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
          {/* "No contacts in this sub-account yet" was shown whenever the list
              came back empty for ANY reason — so an owner filter matching
              nothing claimed an account with 2,406 contacts was empty, and
              offered nothing to do about it. The filters are what a rep can
              actually change, so they are what the message names. */}
          {search || Object.keys(filters).length > 0
            ? `No contacts match ${
                [search && 'the search',
                 Object.keys(filters).length > 0 && 'the filters']
                  .filter(Boolean).join(' and ')
              } — clear ${Object.keys(filters).length > 0 ? 'them' : 'it'} to see everything.`
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
            // Link/unlink writes immediately — there is no Save on it, the
            // way there is for the text fields — so the row is patched here
            // rather than waiting for the card's own save cycle.
            onBusinessChanged={(id, link) => {
              patchItem((x) => x.id === id, {
                businessId: link.businessId ?? null,
                businessName: link.businessName ?? null
              })
            }}
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
          total={total}
          noun="contact"
        />
      )}
      </Panel>
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

// ── The contact's link to a business, on a card ───────────────────────
//
// Mirrors BusinessLink on the contact detail page, in the row shape the card
// uses. Both open the SAME BusinessPickerModal, so "link a business" means
// one thing in this app rather than three.
//
// Writes straight through: there is no Save button on this control, unlike
// the text fields beside it. Linking is a single, reversible decision and
// making a rep press Save afterwards would be ceremony — but it does mean
// the parent row has to be patched here rather than on the card's own save.
function CardBusinessLink({ contact, disabled, onChanged }) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const linked = contact.businessId
    ? { id: contact.businessId, name: contact.businessName || 'Linked business' }
    : null

  const unlink = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      await contactsAPI.update(contact.id, { businessId: null })
      onChanged && onChanged({ businessId: null, businessName: null })
    } catch (err) {
      setError(err?.message || 'Could not unlink')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 9px', borderRadius: 'var(--radius-sm)', minWidth: 0
      }}>
        <span className="ms" style={{ fontSize: 16, color: 'var(--text-faint)', flex: 'none' }}>
          business
        </span>
        <span className="pp-label" style={{ width: 64, flex: 'none' }}>Business</span>

        {linked ? (
          <>
            <Truncate style={{ flex: 1, color: 'var(--text-body)' }} title={linked.name}>
              {linked.name}
            </Truncate>
            <button
              onClick={() => setPicking(true)}
              disabled={disabled || busy}
              title="Link a different business"
              style={linkBtn}
            >
              Change
            </button>
            <button
              onClick={unlink}
              disabled={disabled || busy}
              title="Unlink this business from the contact"
              style={{ ...linkBtn, color: 'var(--status-stuck-text)' }}
            >
              {busy ? 'Working' : 'Unlink'}
            </button>
          </>
        ) : (
          <button
            onClick={() => setPicking(true)}
            disabled={disabled}
            style={{
              flex: 1, textAlign: 'left', border: 'none', background: 'none', padding: 0,
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
              color: 'var(--text-faint)', cursor: disabled ? 'default' : 'pointer'
            }}
          >
            Link a business
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{
          margin: '0 0 0 34px', fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)'
        }}>
          {error}
        </p>
      )}

      {picking && (
        <BusinessPickerModal
          contact={contact}
          blurb="Type a name to search the businesses in this sub-account."
          onClose={() => setPicking(false)}
          onLinked={(business) => {
            setPicking(false)
            onChanged && onChanged({ businessId: business.id, businessName: business.name })
          }}
        />
      )}
    </>
  )
}

const linkBtn = {
  flex: 'none', border: 'none', background: 'none', padding: 0,
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 600,
  color: 'var(--accent-pine-text)', cursor: 'pointer'
}

function ContactCard({ c, onOpen, onOpenDeal, onSaved, onBusinessChanged }) {
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
        {/* A LINK, not free text.
            This was an InlineEdit writing GHL's companyName — a label someone
            typed, connected to nothing. Typing "Acme" left you with the word
            "Acme" and a contact linked to no business at all, while the detail
            page right next door offered the real thing.
            Same picker the detail page and the Deal Hub use, so there is one
            way to link a business rather than three. */}
        <CardBusinessLink
          contact={c}
          disabled={saving}
          onChanged={(link) => onBusinessChanged && onBusinessChanged(c.id, link)}
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
              <div
                key={d.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  justifySelf: 'start', maxWidth: '100%',
                  height: 28, padding: '0 4px 0 10px',
                  border: '1px solid var(--green-100)',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--tint-pine)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
                  color: 'var(--green-600)'
                }}
              >
                <span className="ms" style={{ fontSize: 14, flex: 'none' }}>sell</span>
                <Truncate>
                  {d.name}
                  {d.value != null && ` · ${money(d.value)}`}
                  {d.stage && ` · ${d.stage}`}
                </Truncate>
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
                {/* The ACTION, same control as every other surface. The row
                    around it carries the deal's name, value, stage and
                    whether this contact owns it — information a bare pill
                    cannot show — so the row stays and the pill is added to
                    it rather than replacing it.

                    The row itself is no longer a button: a button inside a
                    button is invalid HTML, and it put two stops in the tab
                    order for one destination. */}
                <DealPill
                  compact
                  name={d.name}
                  onClick={onOpenDeal ? () => onOpenDeal(d.id) : undefined}
                />
              </div>
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
