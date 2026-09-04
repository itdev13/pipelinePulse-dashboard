import React, { useState, useEffect } from 'react'
import DealHubTab from './tabs/DealHubTab'
import DealsTab from './tabs/DealsTab'
import BusinessesTab from './tabs/BusinessesTab'
import ContactsTab from './tabs/ContactsTab'
import TasksTab from './tabs/TasksTab'
import NotesTab from './tabs/NotesTab'
import ControlCentreTab from './tabs/ControlCentreTab'
import { summaryAPI } from '../api/summary'
import { useAuth } from '../context/AuthContext'

// Top-nav shell for the Deal Hub app.
//
// One state atom drives the whole app:
//   activeTab   — which tab is currently rendered
//   selectedDealId — which deal the DealHub tab is showing (persists across
//                    tab switches, so users can jump to Tasks, come back and
//                    still be on the same deal)
//
// Cross-tab navigation goes through openDeal(id) → the Deals tab calls it
// when a user clicks a deal card, and it flips activeTab to 'hub'
// automatically. That's the "click a deal card → jump into deal hub" flow.

// Order: Deal hub → Businesses → Deals → Contacts → Tasks → Notes → Control.
// Businesses comes second because it's the widest lens: a business rolls up the
// deals, contacts and conversations that every tab after it shows one slice of.
const TABS = [
  { id: 'hub',        label: 'Deal hub',     icon: 'space_dashboard' },
  { id: 'businesses', label: 'Businesses',   icon: 'domain' },
  { id: 'deals',      label: 'Deals',        icon: 'sell' },
  { id: 'contacts',   label: 'Contacts',     icon: 'group' },
  { id: 'tasks',      label: 'Tasks',        icon: 'task_alt' },
  { id: 'notes',      label: 'Notes',        icon: 'sticky_note_2' },
  { id: 'control',    label: 'Control panel', icon: 'tune' }
]

// One navigation position. Back has to restore ALL of it, not just the tab:
// arriving at a contact record sets both activeTab AND openContactId, so
// rewinding the tab alone would land you on the Contacts LIST rather than the
// deal you actually came from.
// What to call a position in the Back tooltip. "Back" on its own doesn't say
// where, and after two or three jumps that's the thing you actually want to
// know before clicking.
function labelForPlace(p) {
  const tab = TABS.find((t) => t.id === p.tab)
  const name = tab ? tab.label : p.tab
  if (p.contactId) return `${name} — contact record`
  if (p.businessId) return `${name} — business record`
  return name
}

function samePlace(a, b) {
  return a.tab === b.tab
    && a.dealId === b.dealId
    && a.contactId === b.contactId
    && a.businessId === b.businessId
}

export default function DealHubShell() {
  const { location } = useAuth()
  const locationName = location?.name || location?.id || ''
  const [activeTab, setActiveTab] = useState('hub')
  const [selectedDealId, setSelectedDealId] = useState(null)
  // Location-wide totals for the top-nav pill counters. One fetch on mount.
  // Matches what each tab actually shows (Deals 343 = every open opp, etc).
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    let alive = true
    summaryAPI.counts()
      .then((c) => alive && setCounts(c))
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const [openBusinessId, setOpenBusinessId] = useState(null)
  // Which deal the Deals tab should open EXPANDED for editing. Set by the Deal
  // Hub's "Edit full record" action; cleared on the next navigation so
  // returning to the tab later does not silently reopen an editor.
  const [editDealId, setEditDealId] = useState(null)
  const [openContactId, setOpenContactId] = useState(null)

  // Where we've been. A stack, not the browser's history: the app is one route
  // inside an iframe, so there are no URLs to go back through — every jump
  // between tabs and records is a state change the browser never sees.
  //
  // Holds only PREVIOUS positions; the current one lives in the state above.
  const [history, setHistory] = useState([])

  const here = {
    tab: activeTab,
    dealId: selectedDealId,
    contactId: openContactId,
    businessId: openBusinessId
  }

  // The single way to move. Records where we were, then goes.
  const navigate = (next) => {
    const to = { ...here, ...next }
    // Clicking the tab you're already on, or the same record twice, shouldn't
    // push a step you then have to click Back through.
    if (samePlace(here, to)) return
    setHistory((h) => [...h, here])
    setActiveTab(to.tab)
    setSelectedDealId(to.dealId)
    setOpenContactId(to.contactId)
    setOpenBusinessId(to.businessId)
    // One-shot: only the navigation that requested it carries editDealId.
    // Without this, going to Deals for any other reason later would reopen the
    // editor on a deal the rep had finished with.
    if (to.tab !== 'deals') setEditDealId(null)
  }

  // A tab telling us it moved internally (opened or closed a record). The tab
  // has ALREADY changed its own state, so this records the step and syncs the
  // shell's copy of the position — it must not push the tab again, which is
  // why it isn't navigate().
  const noteInternalMove = (next) => {
    const to = { ...here, ...next }
    if (samePlace(here, to)) return
    setHistory((h) => [...h, here])
    setSelectedDealId(to.dealId)
    setOpenContactId(to.contactId)
    setOpenBusinessId(to.businessId)
  }

  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setActiveTab(prev.tab)
      setSelectedDealId(prev.dealId)
      setOpenContactId(prev.contactId)
      setOpenBusinessId(prev.businessId)
      return h.slice(0, -1)
    })
  }

  // Opening a record CLEARS the other two ids. Otherwise a contact opened
  // after a business would leave the business id set, and Back — which
  // restores the whole position — would reopen a record you'd already left.
  const openDeal = (dealId) =>
    navigate({ tab: 'hub', dealId, contactId: null, businessId: null })

  // Contact chips on tasks/notes open that person's record. The Contacts tab
  // owns the detail view, so we hand it the id and switch to it.
  const openContact = (contactId) =>
    navigate({ tab: 'contacts', contactId, businessId: null })

  // Business links on the Deal card open that business's record. Same pattern
  // as contact chips: hand the id to the tab that owns the detail view and
  // switch to it.
  const openBusiness = (businessId) =>
    navigate({ tab: 'businesses', businessId, contactId: null })

  return (
    <div data-dealhub style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      {/* Header bar: brand + tabs + search */}
      {/* Sticky: the section tabs are how you move around the app, so they
          shouldn't scroll away on a long deal. zIndex clears the Timeline's
          sticky day headers, which would otherwise ride over this bar. */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          minHeight: 60, padding: '10px 20px',
          borderBottom: '1px solid var(--border-default)',
          background: '#fff',
          // A shadow only once it's over content, so it reads as a layer
          // rather than a permanent band.
          boxShadow: '0 1px 2px rgba(23, 33, 46, 0.06)'
        }}
      >
        {/* The sub-account name, separated from the navigation by space AND a
            rule.
            The header's own gap is 14px — the same as between the chips — so
            with nothing added the name read as the first item in the nav
            rather than as the label for what follows. 24px was tried and was
            still not enough to separate two different kinds of thing.
            A divider does the work whitespace alone could not: 32px of space
            either side plus a hairline, so "whose account this is" and "where
            to go in it" read as two zones rather than one row of controls.
            flex: 'none' so a long sub-account name is truncated by the header
            rather than squeezing the chips. */}
        <span
          title={locationName}
          style={{
            flex: 'none',
            maxWidth: 260,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: 600, fontSize: 'var(--text-lg)', color: 'var(--text-heading)'
          }}
        >
          {locationName}
        </span>

        {/* The rule. aria-hidden because it is decoration — a screen reader
            announcing a separator between a heading and a nav adds nothing.
            The header wraps on a narrow iframe, and a vertical rule that ends
            up last on a line points at nothing. CSS cannot detect that, so the
            rule is simply narrow enough (1px + 32px of margin) that a stranded
            one reads as trailing space rather than as a mark. Hiding it would
            need a resize observer for a cosmetic case. */}
        <span
          aria-hidden="true"
          style={{
            flex: 'none',
            width: 1, height: 22,
            margin: '0 var(--space-4)',
            background: 'var(--border-default)'
          }}
        />

        {/* Back. Disabled rather than hidden on the first screen: a control
            that appears and disappears makes the whole header jump sideways
            every time you navigate, and the tabs beside it move with it. */}
        <button
          onClick={goBack}
          disabled={history.length === 0}
          title={
            history.length === 0
              ? 'Nowhere to go back to yet'
              : `Back to ${labelForPlace(history[history.length - 1])}`
          }
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            flex: 'none',
            height: 34, padding: '0 13px 0 10px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-pill)',
            background: '#fff',
            color: history.length === 0 ? 'var(--text-faint)' : 'var(--text-body)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-md)', fontWeight: 600,
            cursor: history.length === 0 ? 'default' : 'pointer',
            opacity: history.length === 0 ? 0.55 : 1
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>arrow_back</span>
          Back
        </button>

        {/* Tab chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = activeTab === t.id
            // Location-wide count on each section chip. Deal-hub + Control
            // centre chips don't have a meaningful total, so we skip them.
            const countMap = {
              businesses: counts?.businesses,
              contacts: counts?.contacts,
              deals:    counts?.deals,
              tasks:    counts?.tasks,
              notes:    counts?.notes
            }
            const count = countMap[t.id]
            return (
              <button
                key={t.id}
                onClick={() => navigate({ tab: t.id })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  cursor: 'pointer',
                  height: 34, padding: '0 14px',
                  border: active
                    ? '1px solid var(--brand-primary)'
                    : '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-pill)',
                  background: active ? 'var(--brand-primary)' : '#fff',
                  color: active ? '#fff' : 'var(--text-body)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-md)', fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s ease-out'
                }}
              >
                <span className="ms" style={{ fontSize: 16 }}>{t.icon}</span>
                {t.label}
                {typeof count === 'number' && (
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 20, height: 20, padding: '0 6px',
                      borderRadius: 'var(--radius-pill)',
                      // The chip itself is now solid brand when active, so a
                      // brand-filled badge with white text inside it would be
                      // invisible. Invert: white pill, brand digits.
                      background: active ? 'rgba(255,255,255,0.92)' : 'var(--gray-100)',
                      color: active ? 'var(--brand-primary)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600,
                      marginLeft: 2
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Global search (⌘K across all tabs) is intentionally deferred
            until each tab's scoped search proves insufficient. Every tab
            already has its own in-page search that fits its content. */}
      </header>

      {/* Tab content */}
      <main>
        {activeTab === 'hub' && (
          <DealHubTab
            dealId={selectedDealId}
            onSwitchDeal={(id) => navigate({ tab: 'hub', dealId: id })}
            onAutoSelectDeal={setSelectedDealId}
            onOpenBusiness={openBusiness}
            // Cross-tab jumps from the rails' "All tasks" / "All notes" links.
            // They were hardcoded disabled with a "coming next" title because
            // the rail had no way to reach the shell's navigate() — this is
            // that way. Back still works: navigate() pushes history.
            onOpenTab={(tab) => navigate({ tab })}
            // "Edit full record" on the deal card: open the Deals tab with
            // THIS deal's editor already expanded, rather than making the rep
            // find the row again.
            onEditDealRecord={(id) => { setEditDealId(id); navigate({ tab: 'deals' }) }}
          />
        )}
        {activeTab === 'deals' && (
          <DealsTab onOpenDeal={openDeal} initialEditDealId={editDealId} />
        )}
        {/* Deal links on a contact record jump into the Deal hub. */}
        {/* Deal + contact links on a business roll-up reuse the same
            cross-tab navigation as tasks and notes. */}
        {activeTab === 'businesses' && (
          <BusinessesTab
            onOpenDeal={openDeal}
            onOpenContact={openContact}
            openBusinessId={openBusinessId}
            onBusinessViewed={() => setOpenBusinessId(null)}
            onNavigate={noteInternalMove}
          />
        )}
        {activeTab === 'contacts' && (
          <ContactsTab
            onOpenDeal={openDeal}
            openContactId={openContactId}
            onContactViewed={() => setOpenContactId(null)}
            onNavigate={noteInternalMove}
          />
        )}
        {/* Deal chips on tasks + notes jump to that deal in the hub, which
            is the "click a task to see it on the deal hub" flow. */}
        {activeTab === 'tasks' && (
          <TasksTab onOpenDeal={openDeal} onOpenContact={openContact} />
        )}
        {activeTab === 'notes' && (
          <NotesTab onOpenDeal={openDeal} onOpenContact={openContact} />
        )}
        {activeTab === 'control' && <ControlCentreTab />}
      </main>
    </div>
  )
}
