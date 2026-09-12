import React, { useCallback, useEffect, useState } from 'react'
import DealBoard from '../deals/DealBoard'
import DealTable from '../deals/DealTable'
import DealToolbar from '../deals/DealToolbar'
import DealFilters from '../deals/DealFilters'
import DealEditPage from '../deals/DealEditPage'
import { savedViewsAPI } from '../../api/deals'
import { FollowUpChips } from '../shared/ListChrome'
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
  // Which view. Persisted because it is a working preference, not a
  // navigation step: a rep who works the board should not be handed the list
  // again every time they come back to this tab.
  //
  // 'cards' is the existing expandable list and stays the default — it is the
  // only view that can EDIT a deal inline, so demoting it would take a
  // capability away from anyone who does not switch back.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('pp.deals.view') || 'board' } catch { return 'board' }
  })
  useEffect(() => {
    try { localStorage.setItem('pp.deals.view', view) } catch { /* private mode */ }
  }, [view])

  // The board needs one pipeline at a time — its columns ARE that pipeline's
  // stages. Defaults to the first, which is the only one most locations have.
  const [boardPipelineId, setBoardPipelineId] = useState(null)

  // The deal open as a full page. Null = the list.
  const [openDealId, setOpenDealId] = useState(null)

  // Live filters. The keys match GET /api/deals's query parameters exactly,
  // so applying a saved view is "spread these onto the request" rather than a
  // translation step that can drift.
  const [filters, setFilters] = useState({})
  const [views, setViews] = useState([])
  const [activeViewId, setActiveViewId] = useState(null)
  // The id of a saved view whose filters have since been EDITED. Not the same
  // as activeViewId: the view is still the one on screen, but what it shows no
  // longer matches what was saved — so the toolbar offers "Update <name>"
  // rather than only "Save view" under a new name.
  const [dirtyView, setDirtyView] = useState(null)



  useEffect(() => {
    let alive = true
    savedViewsAPI.list('deals')
      .then((r) => { if (alive) setViews(r?.views || []) })
      // A failed fetch leaves the tab strip with just "All open deals", which
      // is still a working page — no banner for a feature nobody invoked.
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const [q, setQ] = useTabState('deals', 'q', '')
  // Server-side: filtering only the loaded page would hide matches further
  // down the list.
  const [search, setSearch] = useTabState('deals', 'search', '')

  // Search is stored in a saved view (see saveView), so committing new text
  // edits the applied view exactly as a filter change does.
  const commitSearch = useCallback(() => {
    const next = q.trim()
    if (next === search) return
    setSearch(next)
    setDirtyView(activeViewId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, search, activeViewId])

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

  // Saved-view actions.
  //
  // DECLARED HERE, not beside the view state above, because `const` is not
  // hoisted: applyView reads setQ/setSearch and saveView reads search and
  // setRefError, all of which are declared further down. Sitting above them
  // it threw "Cannot access 'g' before initialization" on first render — a
  // temporal dead zone error that both lint and the production build accept
  // without complaint.
  const applyView = useCallback((id) => {
    setActiveViewId(id)
    // Freshly applied: what is on screen IS what was saved.
    setDirtyView(null)
    const v = views.find((x) => x.id === id)
    const f = { ...(v?.filters || {}) }
    // `view` rides along in a saved view but is the display mode, not a
    // filter — it is pulled out before the rest reach the query.
    if (f.view) { setView(f.view); delete f.view }
    setFilters(f)
    if (f.q !== undefined) { setQ(f.q || ''); setSearch(f.q || '') }
    // setQ/setSearch are stable useState setters; React guarantees their
    // identity, and listing them would only add noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views])

  const saveView = useCallback(async (name) => {
    try {
      const r = await savedViewsAPI.save({
        name,
        filters: { ...filters, ...(search ? { q: search } : {}), view }
      })
      // Replace by id so re-saving a name updates its tab rather than adding
      // a second one — the server upserts, and the list must agree.
      setViews((prev) => {
        const rest = prev.filter((v) => v.id !== r.view.id)
        return [...rest, r.view]
      })
      setActiveViewId(r.view.id)
      setDirtyView(null)
    } catch (e) {
      setRefError(e.message || 'That view could not be saved')
    }
  }, [filters, search, view])

  const deleteView = useCallback(async (id) => {
    try {
      await savedViewsAPI.remove(id)
      setViews((prev) => prev.filter((v) => v.id !== id))
      if (activeViewId === id) { setActiveViewId(null); setFilters({}) }
    } catch (e) {
      setRefError(e.message || 'That view could not be deleted')
    }
  }, [activeViewId])


  useEffect(() => {
    // Also when the create form opens — it needs the pipeline list to be
    // usable at all, since a pipeline is required.
    //
    // AND on the board, whose COLUMNS are a pipeline's stages: without this
    // the board rendered nothing at all, because refData stayed null until
    // someone opened an editor.
    // Always, now: the Filters control offers Stage and Owner in EVERY view,
    // and both lists live here. Gating this on the board left the table and
    // card views with a filter popover holding only Status.
    if (refData !== null) return
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
  }, [refData])

  const fetchPage = useCallback(
    ({ cursor }) => dealsAPI.list({
      status: 'open', limit: 20, cursor, q: search || undefined,
      // The saved view's filters, minus `view` (display mode, stripped when
      // the view is applied) and `q` (owned by the search box above).
      ...filters
    }),
    [search, filters]
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

  // The deal's own page REPLACES the list, the way ContactDetail replaces the
  // contacts list. Rendered before the Shell so the shell's tab strip, Back
  // button and location name all stay on screen — a full-screen overlay hid
  // them and left this page with no way out except its own header.
  const openDeal = openDealId ? deals.find((d) => d.id === openDealId) : null
  if (openDealId && openDeal) {
    return (
      <Shell maxWidth={1240}>
        <DealEditPage
          deal={openDeal}
          pipelines={refData?.pipelines || null}
          users={refData?.users || null}
          refError={refError}
          onClose={() => setOpenDealId(null)}
          onSaved={() => refreshDeal(openDealId)}
          onDeleted={() => { setOpenDealId(null); reload() }}
          onOpenInHub={(id) => { setOpenDealId(null); onOpenDeal(id) }}
        />
      </Shell>
    )
  }

  return (
    // The BOARD gets the full width. A kanban is read across, and 1240px
    // centred left a third of a wide screen empty while the columns scrolled
    // sideways — the one layout where a reading-width cap is exactly wrong.
    // The paged views keep the cap: a table or a card list stretched to
    // 2400px is a line of text nobody can track back from.
    // Full width in EVERY view. The cap was kept for the table and the card
    // list on the reasoning that a very wide row is hard to track back from —
    // but a nine-column table squeezed into 1240px while a third of the screen
    // sits empty is the worse problem, and the table scrolls inside its own
    // box rather than stretching its type.
    <Shell maxWidth="none">
      <PageHeader
        title="Deals"
        subtitle="Expand any deal to edit it — changes save straight to your CRM"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <SearchInput
              value={q}
              onChange={setQ}
              // The search text is SAVED into a view (see saveView), so
              // changing it edits the applied view the same way a filter does.
              // Only when the text actually CHANGED. Blur fires every time the
              // box loses focus, and marking the view dirty on a no-op would
              // offer "Update view1" to a rep who merely clicked away.
              onKeyDown={(e) => { if (e.key === 'Enter') commitSearch() }}
              onBlur={commitSearch}
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
      {/* Card-shaped, so only for the card and table views. The board has its
          own "Loading pipeline…" and each column reports its own emptiness —
          three card skeletons above a board was the blank area with no
          explanation. */}
      {view !== 'board' && loading && <DealCardsSkeleton cards={3} />}

      {/* An ERROR is worth showing everywhere; an empty page only matters to
          the paged views, since a board with no deals says so per column. */}
      {(error || (view !== 'board' && !loading && deals.length === 0)) && (
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

      {/* BOARD — one pipeline's stages as columns. Each column fetches its own
          stage, so this deliberately does not read `deals` above. */}
      <DealToolbar
        views={views}
        activeViewId={activeViewId}
        onSelectView={applyView}
        onSaveView={saveView}
        onDeleteView={deleteView}
        filters={filters}
        // Chips show NAMES, not ids. Without this a stage filter rendered as
        // "Stage bc551c54-eb49-…", which tells a rep nothing about what their
        // board is currently showing.
        filterLabels={{
          stageId: ((refData?.pipelines || []).flatMap((p) => p.stages || [])
            .find((st) => st.id === filters.stageId) || {}).name,
          assignedTo: ((refData?.users || [])
            .find((u) => u.id === filters.assignedTo) || {}).name
        }}
        // Removing a chip EDITS the applied view, exactly like changing a
        // filter in the panel does. It used to change the filters without
        // marking the view dirty, so the toolbar went on offering "Save view"
        // under a new name while "view1" sat active and no longer matched.
        onClearFilter={(k) => {
          setFilters((f) => {
            const next = { ...f }; delete next[k]; return next
          })
          setDirtyView(activeViewId)
        }}
        onClearAll={() => { setFilters({}); setActiveViewId(null); setDirtyView(null) }}
        // The view whose filters have been edited since it was applied. The
        // toolbar turns this into "Update <name>", which saves over it rather
        // than creating a second view with almost the same filters.
        dirtyViewId={dirtyView}
        onUpdateView={(id) => {
          const v = views.find((x) => x.id === id)
          if (v) saveView(v.name)
        }}
        count={view === 'board' ? undefined : deals.length}
        filterControl={
          <DealFilters
            filters={filters}
            onChange={(next) => {
              setFilters(next)
              // The view that produced these filters is now EDITED, not
              // abandoned. Keeping its id is what lets the toolbar offer
              // "Update <name>" — clearing it here left a rep who tweaked a
              // filter with no way back to the view they were working on,
              // only "Save view" under a new name.
              setDirtyView(activeViewId)
            }}
            stages={
              ((refData?.pipelines || []).find((p) => p.id === boardPipelineId)
                || (refData?.pipelines || [])[0])?.stages || []
            }
            users={refData?.users || []}
          />
        }
        // The pipeline sits with Filters, not with the view icons: it decides
        // WHICH deals are on screen, which is the same question Filters
        // answers. The icons only decide how they are drawn.
        secondaryControl={
          view === 'board' && (refData?.pipelines || []).length > 1 && (
          <select
            aria-label="Pipeline"
            value={boardPipelineId || refData.pipelines[0]?.id || ''}
            onChange={(e) => setBoardPipelineId(e.target.value)}
            style={{
              height: 36, padding: '0 10px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-card)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
              color: 'var(--text-body)', cursor: 'pointer'
            }}
          >
            {refData.pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          )
        }
      >
        <ViewSwitch value={view} onChange={setView} />
      </DealToolbar>


      {/* The board waits on the PIPELINE list, not the deal page — its columns
          are stages. Without this it rendered an empty area with no
          explanation while that request was in flight. */}
      {view === 'board' && !error && refData === null && (
        <p style={{
          margin: 0, padding: 'var(--space-5)', textAlign: 'center',
          fontSize: 'var(--text-md)', color: 'var(--text-muted)'
        }}>
          Loading pipeline…
        </p>
      )}
      {view === 'board' && !error && refData !== null
        && !(refData.pipelines || []).length && (
        <p style={{
          margin: 0, padding: 'var(--space-5)', textAlign: 'center',
          fontSize: 'var(--text-md)', color: 'var(--text-muted)'
        }}>
          {refError || 'No pipelines found in this sub-account.'}
        </p>
      )}

      {view === 'board' && !error && (refData?.pipelines || []).length > 0 && (
        <DealBoard
          pipeline={
            (refData?.pipelines || []).find((p) => p.id === boardPipelineId)
            || (refData?.pipelines || [])[0]
            || null
          }
          search={search}
          // The board's columns ARE the stages, so a stage filter would leave
          // one column populated and the rest empty — it is applied by the
          // board's own column scoping instead. Status does pass through.
          status={filters.status || 'open'}
          // A card opens the deal's own page. It used to jump straight to the
          // deal hub, which is a different question — the hub is the record's
          // activity, this is the record itself. The hub is one button away
          // from there.
          onOpenDeal={setOpenDealId}
        />
      )}

      {/* TABLE — the same paged `deals` as the cards, rendered dense. */}
      {view === 'table' && !error && deals.length > 0 && (
        <DealTable deals={deals} onOpenDeal={setOpenDealId} />
      )}

      {/* CARDS — the default, and the only view that edits a deal inline. */}
      {view === 'cards' && deals.map((d) => (
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

      {/* Not on the board: this paginates the card/table list, and each board
          column pages itself. Shown there it read as the board's own total —
          "5 deals — that's everything" under a board holding far more. */}
      {view !== 'board' && !loading && deals.length > 0 && (
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

      {(facts.length > 0 || deal.openTaskCount > 0 || deal.noteCount > 0) && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '10px var(--space-4) 0'
          }}
        >
          {facts.length > 0 && (
            <p
              style={{
                margin: 0, flex: '1 1 auto', minWidth: 0,
                fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.5
              }}
            >
              {facts.join(' · ')}
              {deal.lastCustomerContactAt && (
                <> · last contact {formatDate(deal.lastCustomerContactAt)}</>
              )}
            </p>
          )}
          {/* FOLLOW-UP, ON THE CARD.
              These were only visible after clicking Edit, so scanning a list
              for deals with outstanding work meant opening every one. Chips
              rather than another clause in the grey line: a count is a state
              worth spotting, not one more attribute. */}
          <FollowUpChips
            tasks={deal.openTaskCount}
            notes={deal.noteCount}
          />
        </div>
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
          // Same refetch as a save. A link change is written to GHL
          // immediately, so the panel stays open and only the people list
          // needs to catch up.
          onPeopleChanged={onSaved}
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


// Cards / Board / Table.
//
// A segmented control rather than a dropdown: there are three options, the
// choice is made often, and a dropdown would hide two of them behind a click.
function ViewSwitch({ value, onChange }) {
  const OPTIONS = [
    { id: 'board', icon: 'view_kanban', label: 'Board' },
    { id: 'table', icon: 'table_rows', label: 'Table' },
    { id: 'cards', icon: 'view_agenda', label: 'Cards' }
  ]
  const [hover, setHover] = useState(null)

  // ICONS, with the name only on the active one or on hover.
  //
  // Three labelled buttons took the width of a filter chip each for a control
  // that is set once and rarely changed. The active view still reads its own
  // name, so the strip never becomes a row of anonymous glyphs — and `title`
  // carries the name for anyone who does not hover long enough to see it.
  return (
    <div
      role="tablist"
      aria-label="Deal view"
      style={{
        display: 'inline-flex', flex: 'none',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-card)',
        overflow: 'hidden'
      }}
    >
      {OPTIONS.map((o) => {
        const on = value === o.id
        const showLabel = on || hover === o.id
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            aria-label={o.label}
            onClick={() => onChange(o.id)}
            onMouseEnter={() => setHover(o.id)}
            onMouseLeave={() => setHover(null)}
            title={`${o.label} view`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: showLabel ? 5 : 0,
              height: 36, padding: showLabel ? '0 12px' : '0 10px',
              border: 'none',
              borderLeft: o.id === 'board' ? 'none' : '1px solid var(--border-default)',
              background: on ? 'var(--tint-pine)' : 'transparent',
              color: on ? 'var(--green-600)' : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
              fontWeight: on ? 600 : 500,
              cursor: 'pointer',
              // Width changes as the label appears; without this the two
              // neighbours jump sideways on every hover.
              transition: 'padding 120ms ease, background 120ms ease'
            }}
          >
            <span className="ms" style={{ fontSize: 18 }}>{o.icon}</span>
            {showLabel && o.label}
          </button>
        )
      })}
    </div>
  )
}
