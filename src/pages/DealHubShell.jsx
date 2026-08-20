import React, { useState, useEffect } from 'react'
import DealHubTab from './tabs/DealHubTab'
import DealsTab from './tabs/DealsTab'
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

// Order: Deal hub → Deals (the paired opp views) → Contacts → Tasks → Notes → Control.
// Deal hub and Deals both centre on opportunities, so they sit side by side;
// Contacts and everything else follow.
const TABS = [
  { id: 'hub',      label: 'Deal hub',       icon: 'space_dashboard' },
  { id: 'deals',    label: 'Deals',          icon: 'sell' },
  { id: 'contacts', label: 'Contacts',       icon: 'group' },
  { id: 'tasks',    label: 'Tasks',          icon: 'task_alt' },
  { id: 'notes',    label: 'Notes',          icon: 'sticky_note_2' },
  { id: 'control',  label: 'Control centre', icon: 'tune' }
]

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

  const openDeal = (dealId) => {
    setSelectedDealId(dealId)
    setActiveTab('hub')
  }

  return (
    <div data-dealhub style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      {/* Header bar: brand + tabs + search */}
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          minHeight: 60, padding: '10px 20px',
          borderBottom: '1px solid var(--border-default)',
          background: '#fff'
        }}
      >
        <span
          title={locationName}
          style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-heading)' }}
        >
          {locationName}
        </span>

        {/* Tab chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = activeTab === t.id
            // Location-wide count on each section chip. Deal-hub + Control
            // centre chips don't have a meaningful total, so we skip them.
            const countMap = {
              contacts: counts?.contacts,
              deals:    counts?.deals,
              tasks:    counts?.tasks,
              notes:    counts?.notes
            }
            const count = countMap[t.id]
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  cursor: 'pointer',
                  height: 34, padding: '0 14px',
                  border: active
                    ? '1px solid var(--brand-primary)'
                    : '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-pill)',
                  background: active ? 'var(--surface-selected)' : '#fff',
                  color: active ? 'var(--brand-primary)' : 'var(--text-body)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
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
                      background: active ? 'var(--brand-primary)' : 'var(--gray-100)',
                      color: active ? '#fff' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
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
            onSwitchDeal={setSelectedDealId}
          />
        )}
        {activeTab === 'deals' && <DealsTab onOpenDeal={openDeal} />}
        {activeTab === 'contacts' && <ContactsTab />}
        {/* Deal chips on tasks + notes jump to that deal in the hub, which
            is the "click a task to see it on the deal hub" flow. */}
        {activeTab === 'tasks' && <TasksTab onOpenDeal={openDeal} />}
        {activeTab === 'notes' && <NotesTab onOpenDeal={openDeal} />}
        {activeTab === 'control' && <ControlCentreTab />}
      </main>
    </div>
  )
}
