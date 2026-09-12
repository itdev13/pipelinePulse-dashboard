import React, { useEffect, useRef, useState } from 'react'

// The strip above the board: saved views, filters, search, view switch.
//
// Laid out in two rows because they answer different questions and change at
// different rates:
//
//   row 1  WHICH DEALS — the saved view tabs, plus the count they resolve to
//   row 2  HOW THEY LOOK and how to narrow them — filters, search, view mode
//
// One row would put a tab strip that grows with every saved view next to
// controls that never move, and the fixed controls would shift sideways every
// time someone saved a view.

const FILTER_LABEL = {
  status: 'Status',
  pipelineId: 'Pipeline',
  stageId: 'Stage',
  assignedTo: 'Owner'
}

// A tab. The active one is filled rather than underlined — this strip sits on
// a tinted page and an underline on a light ground reads as a divider.
function ViewTab({ view, active, onSelect, onDelete }) {
  const [hover, setHover] = useState(false)
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', flex: 'none' }}
    >
      <button
        onClick={onSelect}
        title={view.isShared && !view.isMine ? 'Shared with the team' : undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 32, padding: onDelete && hover ? '0 4px 0 12px' : '0 12px',
          border: '1px solid',
          borderColor: active ? 'var(--green-300)' : 'transparent',
          borderRadius: 'var(--radius-pill)',
          background: active ? 'var(--tint-pine)' : 'transparent',
          color: active ? 'var(--green-600)' : 'var(--text-muted)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
          fontWeight: active ? 600 : 500,
          cursor: 'pointer', whiteSpace: 'nowrap'
        }}
      >
        {view.isShared && (
          <span className="ms" style={{ fontSize: 14 }} title="Shared">group</span>
        )}
        {view.name}
      </button>
      {/* Delete appears on hover and only on your own views — a shared view
          belongs to whoever made it. */}
      {onDelete && hover && (
        <button
          onClick={onDelete}
          title={`Delete "${view.name}"`}
          aria-label={`Delete ${view.name}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, marginLeft: -6, marginRight: 4,
            border: 'none', borderRadius: '50%',
            background: 'transparent', color: 'var(--text-faint)',
            cursor: 'pointer'
          }}
        >
          <span className="ms" style={{ fontSize: 15 }}>close</span>
        </button>
      )}
    </span>
  )
}

// A live filter, shown as a removable chip so what is narrowing the list is
// visible rather than hidden behind a "Filters (2)" button.
function FilterChip({ label, value, onClear }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 28, padding: '0 6px 0 10px',
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface)',
      fontSize: 'var(--text-base)', color: 'var(--text-body)',
      maxWidth: 220
    }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span style={{
        fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>
        {value}
      </span>
      <button
        onClick={onClear}
        aria-label={`Clear ${label}`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, flex: 'none',
          border: 'none', borderRadius: '50%',
          background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer'
        }}
      >
        <span className="ms" style={{ fontSize: 14 }}>close</span>
      </button>
    </span>
  )
}

export default function DealToolbar({
  views = [], activeViewId, onSelectView, onSaveView, onDeleteView,
  filters = {}, filterLabels = {}, onClearFilter, onClearAll,
  count, countLabel = 'deals',
  children
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { if (naming) inputRef.current?.focus() }, [naming])

  const active = Object.entries(filters).filter(([, v]) => v)

  function save() {
    const n = name.trim()
    if (!n) return
    onSaveView(n)
    setName('')
    setNaming(false)
  }

  return (
    // A white band, not a floating group. GHL's toolbar is a surface the
    // controls sit ON; ours sat directly on the tinted page, so the tabs and
    // the chips looked like loose elements rather than one strip.
    <div style={{
      display: 'grid', gap: 0,
      background: 'var(--surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }}>
      {/* ROW 1 — which deals */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--border-default)',
        padding: '8px 14px'
      }}>
        <ViewTab
          view={{ name: 'All open deals' }}
          active={!activeViewId}
          onSelect={() => onSelectView(null)}
        />
        {views.map((v) => (
          <ViewTab
            key={v.id}
            view={v}
            active={activeViewId === v.id}
            onSelect={() => onSelectView(v.id)}
            onDelete={v.isMine ? () => onDeleteView(v.id) : undefined}
          />
        ))}

        {naming ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') { setNaming(false); setName('') }
              }}
              placeholder="Name this view"
              maxLength={60}
              style={{
                height: 32, width: 180, padding: '0 10px',
                border: '1px solid var(--green-300)',
                borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                color: 'var(--text-body)', outline: 'none'
              }}
            />
            <button
              onClick={save}
              disabled={!name.trim()}
              style={{
                height: 32, padding: '0 12px',
                border: 'none', borderRadius: 'var(--radius-pill)',
                background: name.trim() ? 'var(--brand-primary)' : 'var(--gray-200)',
                color: name.trim() ? '#fff' : 'var(--text-faint)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
                cursor: name.trim() ? 'pointer' : 'default'
              }}
            >
              Save
            </button>
          </span>
        ) : (
          // Only offered once something is actually filtered: saving "all
          // deals" under a name is a tab that does what the first tab does.
          active.length > 0 && (
            <button
              onClick={() => setNaming(true)}
              title="Save these filters as a view"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                height: 32, padding: '0 10px',
                border: '1px dashed var(--border-strong)',
                borderRadius: 'var(--radius-pill)',
                background: 'transparent', color: 'var(--text-muted)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                cursor: 'pointer'
              }}
            >
              <span className="ms" style={{ fontSize: 16 }}>add</span>
              Save view
            </button>
          )
        )}

        {typeof count === 'number' && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 'var(--text-lg)', color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {count} {count === 1 ? countLabel.replace(/s$/, '') : countLabel}
          </span>
        )}
      </div>

      {/* ROW 2 — how they look, and how to narrow them */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        flexWrap: 'wrap',
        padding: '8px 14px'
      }}>
        {children}

        {active.map(([k, v]) => (
          <FilterChip
            key={k}
            label={FILTER_LABEL[k] || k}
            value={filterLabels[k] || v}
            onClear={() => onClearFilter(k)}
          />
        ))}
        {active.length > 1 && (
          <button
            onClick={onClearAll}
            style={{
              height: 28, padding: '0 10px',
              border: 'none', background: 'transparent',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
              textDecoration: 'underline', cursor: 'pointer'
            }}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
