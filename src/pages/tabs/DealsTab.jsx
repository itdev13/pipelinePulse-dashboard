import React, { useCallback, useState } from 'react'
import { dealsAPI } from '../../api/deals'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import {
  Shell, PageHeader, SearchInput, StateMessage, DealCardsSkeleton, LoadMore,
  formatDate, initialsFor, nameFor
} from '../shared/ListChrome'

// Deals tab — one card per open deal, each showing the facts a rep scans for
// and the full contact list on the deal.
//
// Value / expected close / stage / owner render as controls per the design.
// /api/deals is read-only (no PATCH route yet), so they hold local state and
// carry a "coming next" title — same convention as PeopleSection's Make
// primary / Remove and the Deal Hub's stage dropdown.

export default function DealsTab({ onOpenDeal }) {
  const [q, setQ] = useState('')
  // Server-side: filtering only the loaded page would hide matches further
  // down the list.
  const [search, setSearch] = useState('')

  const fetchPage = useCallback(
    ({ cursor }) => dealsAPI.list({ status: 'open', limit: 20, cursor, q: search || undefined }),
    [search]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore } =
    usePagedList({ fetchPage, key: 'deals', deps: [search] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const deals = items || []

  return (
    <Shell maxWidth={1240}>
      <PageHeader
        title="Deals"
        subtitle="Value, expected close, stage and owner are editable inline"
        action={
          <SearchInput
            value={q}
            onChange={setQ}
            onKeyDown={(e) => { if (e.key === 'Enter') setSearch(q.trim()) }}
            onBlur={() => setSearch(q.trim())}
            placeholder="Search deal name — press Enter"
            width={320}
          />
        }
      />

      {/* Cards, not rows — so the loading state mirrors the card shape
          rather than the generic row skeleton. */}
      {loading && <DealCardsSkeleton cards={3} />}

      {(error || (!loading && deals.length === 0)) && (
        <div
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', overflow: 'hidden'
          }}
        >
          <StateMessage
            error={error}
            empty={!loading && deals.length === 0}
            emptyText={
              search
                ? 'No deals match — clear the search to see everything.'
                : 'No open deals in this sub-account.'
            }
          />
        </div>
      )}

      {deals.map((d) => (
        <DealCard key={d.id} deal={d} onOpenDeal={onOpenDeal} />
      ))}

      {!loading && deals.length > 0 && (
        <LoadMore
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          count={deals.length}
          noun="deal"
        />
      )}
    </Shell>
  )
}

function DealCard({ deal, onOpenDeal }) {
  const [value, setValue] = useState(deal.value || '')
  const [closeDate, setCloseDate] = useState(
    deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : ''
  )
  const [stage, setStage] = useState(deal.stage || '')

  const people = deal.people || []
  const daysInStage = daysSince(deal.currentStageEnteredAt)

  // The strip under the controls: what it is, where it came from, how long
  // it's sat there. Only facts we actually have — no "—" filler.
  const facts = [
    deal.product,
    deal.leadSource,
    daysInStage != null ? `${daysInStage} ${daysInStage === 1 ? 'day' : 'days'} in stage` : null,
    deal.pipeline
  ].filter(Boolean)

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-pine-text)',
        ['--panel-tint']: 'var(--tint-pine)',
        borderRadius: 'var(--radius-md)',
        background: '#fff', overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
          flexWrap: 'wrap', padding: '14px var(--space-4) 0'
        }}
      >
        <span
          className="ms"
          style={{ fontSize: 'var(--text-xl)', color: 'var(--accent-pine)', marginTop: 2 }}
        >
          sell
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-heading)',
              margin: 0, lineHeight: 1.3
            }}
          >
            {deal.dealTag || '(unnamed deal)'}
          </h2>
          {deal.opportunityName && deal.opportunityName !== deal.dealTag && (
            <p style={{ margin: '3px 0 0', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
              {deal.opportunityName}
            </p>
          )}
        </div>

        <button
          onClick={() => onOpenDeal && onOpenDeal(deal.id)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 34, padding: '0 15px',
            border: 'none', borderRadius: 'var(--radius-md)',
            background: 'var(--green-600)', color: '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
            cursor: 'pointer', flex: 'none'
          }}
        >
          Open deal
          <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
        </button>
      </header>

      {/* Inline-editable fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4) 0'
        }}
      >
        <Field label="Value">
          <Control
            value={value}
            onChange={setValue}
            mono
            title="Value — write flow coming next"
          />
        </Field>
        <Field label="Expected close">
          <Control
            type="date"
            value={closeDate}
            onChange={setCloseDate}
            title="Expected close — write flow coming next"
          />
        </Field>
        <Field label="Stage">
          <Control
            value={stage}
            onChange={setStage}
            title="Stage — write flow coming next"
          />
        </Field>
        <Field label="Owner">
          <Control
            value={deal.owner || ''}
            readOnly
            title="Reassigning an owner writes back to GoHighLevel — coming next"
          />
        </Field>
      </div>

      {facts.length > 0 && (
        <p
          style={{
            margin: 0, padding: '10px var(--space-4) 0',
            fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.5
          }}
        >
          {facts.join(' · ')}
          {deal.lastCustomerContactAt && (
            <> · last contact {formatDate(deal.lastCustomerContactAt)}</>
          )}
        </p>
      )}

      {people.length > 0 && (
        <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)' }}>
          <span
            style={{
              display: 'block', marginBottom: 7,
              fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            {people.length === 1 ? 'Contact on this deal' : 'Contacts on this deal'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {people.map((p) => (
              <PersonPill key={p.id} person={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function PersonPill({ person }) {
  const accent = `var(--accent-${person.accent || 'sky'}-text)`
  const tint = `var(--tint-${person.accent || 'sky'})`
  const name = nameFor(person)

  return (
    <span
      title={person.business || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 9,
        maxWidth: 300,
        padding: '6px var(--space-3) 6px 6px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        background: '#fff'
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, flex: 'none',
          borderRadius: '50%',
          background: tint, color: accent,
          fontSize: 'var(--text-xs)', fontWeight: 600
        }}
      >
        {initialsFor(person.firstName, person.lastName, name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {name}
        </span>
        {(person.contactType || person.business) && (
          <span
            style={{
              display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
          >
            {person.contactType || person.business}
          </span>
        )}
      </span>
      {person.primary && (
        <span
          style={{
            flex: 'none',
            fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 'var(--radius-sm)',
            background: 'var(--green-50)', color: 'var(--green-600)'
          }}
        >
          Primary
        </span>
      )}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span
        style={{
          display: 'block', marginBottom: 5,
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function Control({ value, onChange, type = 'text', mono, title, readOnly }) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      title={title}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      style={{
        width: '100%', height: 36, boxSizing: 'border-box',
        padding: '0 11px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: readOnly ? 'var(--gray-25)' : '#fff',
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: 'var(--text-md)', color: 'var(--text-heading)'
      }}
    />
  )
}

function toDateInput(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function daysSince(ts) {
  if (!ts) return null
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / 86400000))
}
