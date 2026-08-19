import React, { useState } from 'react'
import DealHubTab from './tabs/DealHubTab'
import DealsTab from './tabs/DealsTab'
import ContactsTab from './tabs/ContactsTab'
import TasksTab from './tabs/TasksTab'
import NotesTab from './tabs/NotesTab'
import ControlCentreTab from './tabs/ControlCentreTab'

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

const TABS = [
  { id: 'hub',      label: 'Deal hub',       icon: 'space_dashboard' },
  { id: 'contacts', label: 'Contacts',       icon: 'group' },
  { id: 'deals',    label: 'Deals',          icon: 'sell' },
  { id: 'tasks',    label: 'Tasks',          icon: 'task_alt' },
  { id: 'notes',    label: 'Notes',          icon: 'sticky_note_2' },
  { id: 'control',  label: 'Control centre', icon: 'tune' }
]

export default function DealHubShell() {
  const [activeTab, setActiveTab] = useState('hub')
  const [selectedDealId, setSelectedDealId] = useState(null)

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
          style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-heading)' }}
        >
          EverGreen Junction
        </span>

        {/* Tab chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = activeTab === t.id
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
              </button>
            )
          })}
        </div>

        {/* Search (⌘K) — right-anchored */}
        <div
          role="search"
          style={{
            marginLeft: 'auto',
            display: 'flex', alignItems: 'center', gap: 8,
            height: 34, padding: '0 12px', minWidth: 280,
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--gray-50)',
            color: 'var(--text-muted)', fontSize: 13,
            cursor: 'not-allowed'
          }}
          title="Search — coming next"
        >
          <span className="ms" style={{ fontSize: 17 }}>search</span>
          Search deals
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '1px 5px', background: '#fff'
            }}
          >
            ⌘K
          </span>
        </div>
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
        {activeTab === 'tasks' && <TasksTab />}
        {activeTab === 'notes' && <NotesTab />}
        {activeTab === 'control' && <ControlCentreTab />}
      </main>
    </div>
  )
}
