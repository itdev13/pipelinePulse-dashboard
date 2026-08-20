import React from 'react'

// Inner-tab strip for the Deal Hub — one row across the top of the deal
// canvas that names the six discovery lenses we render below (Commitments,
// Three whys, Qualification, Next step, Tasks, Notes). Each tab optionally
// carries a count chip: "2 overdue" on Commitments, "2 open" on Tasks, etc.
//
// This is a visual index, not a router. Clicking a tab highlights it and
// (later) will scroll to the matching section. Section rendering itself
// still happens below in the normal flow.

const TABS = [
  {
    id: 'commitments',
    label: 'Commitments',
    icon: 'handshake',
    accent: 'pine',
    countKey: 'commitmentsOverdue',
    countSuffix: 'overdue',
    countTone: 'danger'
  },
  {
    id: 'whys',
    label: 'Three whys',
    icon: 'psychology',
    accent: 'plum',
    countKey: null
  },
  {
    id: 'qualification',
    label: 'Qualification',
    icon: 'rule',
    accent: 'gold',
    countKey: 'qualificationMissing',
    countSuffix: 'missing',
    countTone: 'danger'
  },
  {
    id: 'next-step',
    label: 'Next step',
    icon: 'arrow_forward',
    accent: 'pine',
    countKey: null
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: 'task_alt',
    accent: 'teal',
    countKey: 'tasksOpen',
    countSuffix: 'open',
    countTone: 'neutral'
  },
  {
    id: 'notes',
    label: 'Notes',
    icon: 'sticky_note_2',
    accent: 'clay',
    countKey: 'notes',
    countSuffix: null,
    countTone: 'neutral'
  }
]

export default function DealSectionTabs({ counts = {}, activeId, onSelect }) {
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        marginBottom: 14
      }}
    >
      {TABS.map((t) => {
        const active = t.id === activeId
        const accent = `var(--accent-${t.accent})`
        const tint = `var(--tint-${t.accent})`
        const rawCount = t.countKey ? counts[t.countKey] : null
        const hasCount = typeof rawCount === 'number' && rawCount > 0
        return (
          <button
            key={t.id}
            onClick={() => onSelect && onSelect(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              cursor: 'pointer',
              height: 36, padding: '0 14px',
              border: active ? `1.5px solid ${accent}` : '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: active ? tint : '#fff',
              color: active ? accent : 'var(--text-body)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13.5, fontWeight: active ? 600 : 500,
              transition: 'all 0.15s ease-out'
            }}
          >
            <span className="ms" style={{ fontSize: 17 }}>{t.icon}</span>
            <span>{t.label}</span>
            {hasCount && (
              <CountChip value={rawCount} suffix={t.countSuffix} tone={t.countTone} />
            )}
          </button>
        )
      })}
    </div>
  )
}

function CountChip({ value, suffix, tone }) {
  const danger = tone === 'danger'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 20, padding: '0 8px',
        borderRadius: 'var(--radius-pill)',
        background: danger ? 'var(--tint-rose)' : 'var(--gray-100)',
        color: danger ? 'var(--status-stuck)' : 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11, fontWeight: 600, letterSpacing: '-0.01em'
      }}
    >
      {suffix ? `${value} ${suffix}` : value}
    </span>
  )
}
