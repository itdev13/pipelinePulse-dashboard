import React, { useCallback, useEffect, useState } from 'react'
import { dealsAPI } from '../../api/deals'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import DealEditPanel from '../deals/DealEditPanel'
import DealCreatePanel from '../deals/DealCreatePanel'
import {
  Shell, PageHeader, SearchInput, StateMessage, DealCardsSkeleton, LoadMore,
  formatDate, initialsFor, nameFor
} from '../shared/ListChrome'

// Deals tab — one card per open deal, each showing the facts a rep scans for,
// the contacts on the deal, and an Edit expander.
//
// EDITING LIVES IN THE EXPANDER, not on the card face. The card used to carry
// four inline controls (value, expected close, stage, owner), of which two
// worked: the Stage picker offered only the deal's current stage because the
// list route sent no stage ids, and Owner was a read-only Input labelled
// "coming next".
//
// A rep scans this list far more often than they edit it, so the card is now
// read-only and the full field set — everything GHL's own edit modal offers —
// opens in place via DealEditPanel. That removed the half-working controls and
// made the rest actually saveable.

export default function DealsTab({ onOpenDeal, initialEditDealId = null }) {
  const [q, setQ] = useTabState('deals', 'q', '')
  // Server-side: filtering only the loaded page would hide matches further
  // down the list.
  const [search, setSearch] = useTabState('deals', 'search', '')

  // Which row is expanded for editing. One at a time: two open editors mean two
  // sets of unsaved changes and no way to tell which Update belongs to which.
  // Seeded from initialEditDealId so the Deal Hub can send a rep straight to
  // this deal's editor — "edit the full record" on the deal card. Held as
  // state, not read directly, so closing the row does not reopen it on the
  // next render.
  const [editingId, setEditingId] = useState(initialEditDealId)

  // The create form, above the list. Mutually exclusive with an open editor —
  // two draft forms on screen is two things to lose.
  const [creating, setCreating] = useState(false)

  // Pipelines and users, fetched ONCE for the whole tab rather than per row.
  // They are location-wide and identical for every deal; fetching them in the
  // panel would be two requests every time a row is expanded.
  //
  // Lazy: the fetch runs when the first row is expanded, not on page load, so a
  // rep who only reads the list never pays for it.
  const [refData, setRefData] = useState(null)
  const [refError, setRefError] = useState(null)

  useEffect(() => {
    // Also when the create form opens — it needs the pipeline list to be
    // usable at all, since a pipeline is required.
    if ((editingId === null && !creating) || refData !== null) return
    let alive = true
    Promise.all([
      dealsAPI.pipelines().catch(() => null),
      dealsAPI.users().catch(() => null)
    ]).then(([p, u]) => {
      if (!alive) return
      // A failed reference fetch does not break the panel — the text fields
      // still save. Only the affected dropdown degrades, and it says why.
      if (!p && !u) setRefError('Could not load pipelines or users')
      setRefData({ pipelines: p?.pipelines || [], users: u?.users || [] })
    })
    return () => { alive = false }
  }, [editingId, creating, refData])

  const fetchPage = useCallback(
    ({ cursor }) => dealsAPI.list({ status: 'open', limit: 20, cursor, q: search || undefined }),
    [search]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore, patchItem, reload } =
    usePagedList({ fetchPage, key: 'deals', deps: [search] })

  // After a save: refetch THAT deal and patch it in place.
  //
  // Not reload() — that resets to page one, so a rep who had scrolled to deal
  // 60 would be thrown back to the top for editing one row.
  //
  // Delayed, because our writes go to GoHighLevel and nothing is written to our
  // database until the webhook lands. An immediate refetch returns the OLD row:
  // the same race that made the Deal Hub chips read "Not set" after a
  // successful save.
  const refreshDeal = useCallback((id) => {
    window.setTimeout(() => {
      dealsAPI.get(id)
        .then((fresh) => {
          if (!fresh) return
          patchItem((it) => it.id === id, fresh)
        })
        .catch(() => {})
    }, 2500)
  }, [patchItem])
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const deals = items || []

  return (
    <Shell maxWidth={1240}>
      <PageHeader
        title="Deals"
        subtitle="Expand any deal to edit it — changes save straight to your CRM"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <SearchInput
              value={q}
              onChange={setQ}
              onKeyDown={(e) => { if (e.key === 'Enter') setSearch(q.trim()) }}
              onBlur={() => setSearch(q.trim())}
              placeholder="Search deal name — press Enter"
              width={280}
            />
            {/* Opening the create form closes any open editor — see `creating`
                above. */}
            <button
              onClick={() => { setCreating(true); setEditingId(null) }}
              disabled={creating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                flex: 'none',
                height: 36, padding: '0 15px',
                border: 'none', borderRadius: 'var(--radius-md)',
                background: creating ? 'var(--gray-200)' : 'var(--brand-primary)',
                color: creating ? 'var(--text-faint)' : '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
                cursor: creating ? 'default' : 'pointer'
              }}
            >
              <span className="ms" style={{ fontSize: 18 }}>add</span>
              New deal
            </button>
          </div>
        }
      />

      {creating && (
        <DealCreatePanel
          pipelines={refData?.pipelines || null}
          users={refData?.users || null}
          refError={refError}
          onClose={() => setCreating(false)}
          // A new deal is not in the loaded page, and it may not be on page one
          // either, so this is a full reload rather than a patch. The delay is
          // the webhook race: our POST goes to GHL and our row is written when
          // the webhook lands, so an immediate refetch would not include it.
          onCreated={() => {
            setCreating(false)
            window.setTimeout(() => reload(), 2500)
          }}
        />
      )}

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
        <DealCard
          key={d.id}
          deal={d}
          onOpenDeal={onOpenDeal}
          expanded={editingId === d.id}
          onToggleExpand={() => {
            setCreating(false)
            setEditingId((cur) => (cur === d.id ? null : d.id))
          }}
          pipelines={refData?.pipelines || null}
          users={refData?.users || null}
          refError={refError}
          onSaved={() => refreshDeal(d.id)}
          // A deleted deal is gone from the list entirely, so this is the one
          // case that warrants a full reload rather than patching a row.
          onDeleted={() => { setEditingId(null); reload() }}
        />
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

function DealCard({
  deal, onOpenDeal, expanded, onToggleExpand,
  pipelines, users, refError, onSaved, onDeleted
}) {
  // No edit state on the card any more — DealEditPanel owns the whole draft,
  // so there is one place a change can live and one Update that commits it.
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
      // .pp-card carries the border, the layered shadow and — the part that
      // could not be done inline — the hover lift. .pp-card-open keeps the
      // expanded row raised with a brand edge so it does not drop back when
      // the pointer leaves the card being edited.
      className={expanded ? 'pp-card pp-card-open' : 'pp-card'}
      style={{
        ['--panel-accent']: 'var(--accent-pine-text)',
        ['--panel-tint']: 'var(--tint-pine)',
        overflow: 'hidden'
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

        {/* Edit before Open deal: editing is the action a rep takes on a row in
            a list, and Open deal navigates away from it. */}
        <button
          onClick={onToggleExpand}
          aria-expanded={expanded}
          title={expanded ? 'Close the editor' : 'Edit this deal without leaving the list'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 34, padding: '0 13px',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: expanded ? 'var(--gray-100)' : '#fff',
            color: 'var(--text-heading)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
            cursor: 'pointer', flex: 'none'
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>
            {expanded ? 'expand_less' : 'edit'}
          </span>
          {expanded ? 'Close' : 'Edit'}
        </button>

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

      {/* A read-only summary of the numbers a rep scans for. These were
          editable controls on the card face; editing now happens in the
          expander, so the card can show the value formatted (with its currency)
          rather than as a raw number in a text input. */}
      <div
        style={{
          display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)',
          flexWrap: 'wrap', padding: 'var(--space-3) var(--space-4) 0'
        }}
      >
        <Stat label="Value" value={deal.value} mono />
        <Stat label="Stage" value={deal.stage} />
        <Stat
          label="Expected close"
          value={deal.forecastCloseDate ? formatDate(deal.forecastCloseDate) : null}
        />
        <Stat label="Owner" value={deal.owner} />
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

      {/* Mounted only while expanded, so the panel's draft state resets when
          it closes — a half-typed value must not survive a reopen and read as
          the deal's actual figure. */}
      {expanded && (
        <DealEditPanel
          deal={deal}
          pipelines={pipelines}
          users={users}
          refError={refError}
          onSaved={onSaved}
          onDeleted={onDeleted}
          // Cancel closes the panel when there is nothing to discard, so it
          // needs the same toggle the Edit button uses.
          onClose={onToggleExpand}
        />
      )}
    </section>
  )
}

// A read-only label/value pair for the card face.
//
// Renders "Not set" rather than being omitted: on a card these four sit in a
// fixed row, and dropping one would shift the others so the same field appears
// in a different place on every card.
function Stat({ label, value, mono = false }) {
  const set = value != null && String(value).trim() !== ''
  return (
    <div style={{ minWidth: 0 }}>
      <span
        style={{
          display: 'block', marginBottom: 2,
          fontSize: 'var(--text-xs)', fontWeight: 600,
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--text-lg)', fontWeight: 600,
          fontFamily: mono && set ? 'var(--font-mono)' : 'var(--font-sans)',
          color: set ? 'var(--text-heading)' : 'var(--text-faint)'
        }}
      >
        {set ? String(value) : 'Not set'}
      </span>
    </div>
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
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)',
        maxWidth: 340,
        // Bigger overall: 28px avatar and 6px padding made a pill you had to
        // squint at, and the two on this deal were visually identical.
        padding: '8px 14px 8px 8px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff'
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, flex: 'none',
          borderRadius: '50%',
          background: tint, color: accent,
          fontSize: 'var(--text-md)', fontWeight: 600
        }}
      >
        {initialsFor(person.firstName, person.lastName, name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-heading)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {name}
        </span>
        {/* Something that distinguishes THIS person.
            The contact type alone ("lead") is identical on every pill, so it's
            the last resort. And whatever nameFor already used as the heading is
            skipped — showing "mark@example.com" twice, once as the name and
            once beneath it, says nothing the first line didn't. */}
        {(() => {
          const detail =
            [person.business, person.email, person.phone, person.contactType]
              .find((v) => v && String(v).trim() && String(v).trim() !== name)
          if (!detail) return null
          return (
            <span
              style={{
                display: 'block', marginTop: 1,
                fontSize: 'var(--text-base)', color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              {detail}
            </span>
          )
        })()}
      </span>
      {person.primary && (
        <span
          style={{
            flex: 'none',
            fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 'var(--radius-sm)',
            // Solid: on green-50 (1.13:1 against the white card) the badge
            // was invisible and PRIMARY read as ordinary small text.
            background: 'var(--green-600)', color: '#fff'
          }}
        >
          Primary
        </span>
      )}
    </span>
  )
}

function daysSince(ts) {
  if (!ts) return null
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / 86400000))
}
