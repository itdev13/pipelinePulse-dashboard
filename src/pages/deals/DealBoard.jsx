import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dealsAPI } from '../../api/deals'
import { formatMoney } from '../../utils/money'
import { Bar, SkeletonStyles, DealChip } from '../shared/ListChrome'

// The pipeline as a board: one column per stage, deals as cards.
//
// WHY EACH COLUMN FETCHES ITSELF. A pipeline can hold hundreds of deals and
// only a handful are on screen. Fetching everything and grouping client-side
// would mean holding the whole pipeline in memory to render one column, so
// each column asks for its own stage (`stageId`) and pages independently.
// The cost is N requests on load — N being the stage count, single digits in
// practice — which is cheaper than one request returning everything.
//
// DRAG AND DROP is the native HTML5 API, not a library. Moving a card between
// columns is the whole interaction: no sorting within a column, no nesting,
// no touch-drag requirement (the board is a desktop view). A drag library
// would be a dependency earning its keep on one gesture.

const PAGE = 25

// A card's height is fixed so a column of them scans as a list rather than a
// ragged stack. Anything that would overflow is truncated at one line.
function DealCard({ deal, onOpen, onOpenInHub, onDragStart, dragging }) {
  const value = Number(deal.monetaryValue)
  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(e, deal)}
      onClick={() => onOpen && onOpen(deal.id)}
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'grid', gap: 7,
        cursor: 'grab',
        // The card being dragged fades rather than disappears: a gap where a
        // card was reads as "it moved already", which it has not yet.
        opacity: dragging ? 0.4 : 1,
        transition: 'box-shadow 120ms ease, opacity 120ms ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Title and the hub button share the top line. The button sits with the
          card's IDENTITY rather than down beside the value: a rep scanning a
          column reads titles, so the way out of the card belongs where their
          eye already is. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 'var(--space-2)'
      }}>
        {/* 15px, not 13px. A card's title is the one thing scanned down a
            column, and at the body size it carried no more weight than the
            contact line under it. */}
        <h4 style={{
          margin: 0, fontSize: 15, fontWeight: 600,
          color: 'var(--text-heading)', lineHeight: 1.3,
          letterSpacing: '-0.01em',
          // minWidth:0 or the flex item refuses to shrink and the ellipsis
          // never engages — a long title would push the button off the card.
          minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {deal.dealTag || deal.opportunityName || 'Untitled deal'}
        </h4>
        {/* The card body opens the deal's editor. Reaching the deal hub from
            the board needed that editor opened first, so the one screen a rep
            actually works a deal on was two steps behind every card. */}
        {onOpenInHub && (
          /* The same green chip every other surface uses to open a deal —
             Notes, Tasks, the Deals table, Businesses, Contacts. This was a
             26px square icon button, a sixth treatment for one action.

             The two drag guards are NOT optional here: the card is
             draggable, and a button inside a draggable element starts its
             own drag on mousedown, which cancels the click. DealChip
             forwards both for exactly this case. */
          <DealChip
            name="DEAL"
            onClick={(e) => {
              // Without this the card's own onClick fires underneath and the
              // rep lands in the editor they were trying to skip.
              e.stopPropagation()
              onOpenInHub(deal.id)
            }}
            draggable={false}
            onDragStart={(e) => { e.preventDefault(); e.stopPropagation() }}
          />
        )}
      </div>

      {/* The contact, when it is not simply the deal's own name repeated —
          GHL names a new opportunity after its contact, so the two are the
          same string on most rows and printing both wastes the line. */}
      {deal.contact?.firstName
        && `${deal.contact.firstName} ${deal.contact.lastName || ''}`.trim()
           !== (deal.dealTag || '').trim()
        && (
        <p style={{
          margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {`${deal.contact.firstName} ${deal.contact.lastName || ''}`.trim()}
        </p>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'var(--space-2)', marginTop: 2
      }}>
        {/* A priced deal leads with its value; an unpriced one says so rather
            than printing £0, which reads as "worth nothing" instead of
            "not yet quoted". */}
        <span style={{
          fontSize: 'var(--text-lg)', fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: value > 0 ? 'var(--text-heading)' : 'var(--text-faint)'
        }}>
          {value > 0 ? formatMoney(value, deal.currency) : 'Not priced'}
        </span>
        {deal.owner && (
          <span
            title={deal.owner}
            style={{
              fontSize: 'var(--text-base)', color: 'var(--text-faint)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 110
            }}
          >
            {deal.owner}
          </span>
        )}
      </div>
    </article>
  )
}

// One stage. Owns its own deals, count and paging.
function Column({ stage, search, status, tag, assignedTo, onOpen, onOpenInHub, onMoved, registerReload }) {
  const [deals, setDeals] = useState([])
  const [total, setTotal] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [over, setOver] = useState(false)

  const load = useCallback(async (nextCursor = null) => {
    setLoading(true)
    setError(null)
    try {
      const r = await dealsAPI.list({
        stageId: stage.id,
        status,
        limit: PAGE,
        cursor: nextCursor || undefined,
        q: search || undefined,
        // TAG AND OWNER. Both were absent, so the toolbar's pickers did
        // nothing on the board: a rep set Tag to "gone quiet", the count
        // beside the heading dropped to 0 (that query DOES send them — see
        // DealsTab's pipelineCount effect), and the columns underneath went
        // on showing every deal. The two numbers on screen contradicted each
        // other and the filter looked broken because it was.
        //
        // The server has supported both all along (routes/deals.js) — they
        // simply never left the browser on this view.
        tag: tag || undefined,
        assignedTo: assignedTo || undefined
      })
      setDeals((prev) => (nextCursor ? [...prev, ...(r.deals || [])] : (r.deals || [])))
      setCursor(r.nextCursor || null)
      setHasMore(!!r.hasMore)
      if (typeof r.totalCount === 'number') setTotal(r.totalCount)
    } catch (e) {
      setError(e.message || 'Could not load this stage')
    } finally {
      setLoading(false)
    }
  }, [stage.id, search, status, tag, assignedTo])

  useEffect(() => { load(null) }, [load])

  // The parent moves a card optimistically, then tells both affected columns
  // to refetch so the counts and totals come from the server rather than
  // being recomputed in two places.
  useEffect(() => registerReload(stage.id, () => load(null)), [registerReload, stage.id, load])

  // Column value: the sum of what is LOADED, labelled as such when more
  // remains. Printing a partial sum as if it were the stage total would be a
  // number a manager could act on and be wrong about.
  const loadedValue = useMemo(
    () => deals.reduce((n, d) => n + (Number(d.monetaryValue) || 0), 0),
    [deals]
  )

  return (
    <section
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData('text/deal-id')
        const from = e.dataTransfer.getData('text/stage-id')
        const fromPipeline = e.dataTransfer.getData('text/pipeline-id')
        // WHICH stage id this column means for THIS deal. The column is one
        // merged stage name backed by several ids — one per pipeline — and
        // sending the joined list as a stage id would write nonsense to the
        // CRM. stageIdFor resolves it against the deal's own pipeline.
        const to = stage.stageIdFor?.(fromPipeline) ?? stage.id
        if (id && to && from !== to) onMoved(id, from, to)
      }}
      style={{
        flex: 'none', width: 320,
        display: 'flex', flexDirection: 'column',
        // A fixed height, not maxHeight: every column ends at the same line
        // whether it holds ten cards or none, so the board reads as a grid.
        // Without it, an empty column collapsed to its header and the row of
        // headers sat at different depths.
        // A fixed height, not maxHeight: every column ends at the same line
        // whether it holds ten cards or none, so the board reads as a grid.
        // There is only ever ONE grid now — the pipelines are merged into it
        // — so this no longer multiplies into a screen per pipeline.
        height: 'calc(100vh - 260px)', minHeight: 380,
        // gray-100, not gray-50: against a white header and white cards, 50 is
        // a 1.02:1 difference — the header did not read as a header and the
        // cards floated with no visible column behind them.
        background: over ? 'var(--tint-pine)' : 'var(--gray-100)',
        border: `1px ${over ? 'dashed' : 'solid'} ${over ? 'var(--green-300)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'background 120ms ease'
      }}
    >
      {/* Its own band — white against the column's tinted body, the way a
          table header sits above its rows. It used to share the column's
          background and read as the first card. */}
      <header style={{
        flex: 'none',
        padding: '12px 14px',
        background: 'var(--surface-card)',
        // A real edge, not a hairline: this is the line between "what stage
        // is this" and "which deals are in it", and at border-default on a
        // near-white column it was invisible.
        borderBottom: '2px solid var(--border-strong)',
        display: 'grid', gap: 3
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{
            margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600,
            color: 'var(--text-heading)', letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {stage.name}
          </h3>
          {/* A pill, not loose digits: it is a count of the column below it
              and needed a shape to say so. */}
          <span style={{
            flex: 'none',
            minWidth: 22, height: 20, padding: '0 7px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--gray-100)',
            fontSize: 'var(--text-base)', fontWeight: 600,
            fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)'
          }}>
            {total ?? deals.length}
          </span>
        </div>
        <span style={{
          fontSize: 'var(--text-md)', color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums', fontWeight: 500
        }}>
          {loadedValue > 0
            ? `${formatMoney(loadedValue, deals[0]?.currency)}${hasMore ? ' loaded' : ''}`
            : 'No value yet'}
        </span>
      </header>

      <div style={{
        flex: 1, overflowY: 'auto', minHeight: 80,
        padding: 'var(--space-2)', display: 'grid', gap: 'var(--space-2)',
        alignContent: 'start'
      }}>
        {error && (
          <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--status-stuck-text)' }}>
            {error}
          </p>
        )}
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            onOpen={onOpen}
            onOpenInHub={onOpenInHub}
            dragging={false}
            onDragStart={(e, deal) => {
              e.dataTransfer.setData('text/deal-id', deal.id)
              e.dataTransfer.setData('text/stage-id', stage.id)
              // The deal's OWN pipeline. A merged column holds one stage id
              // per pipeline, so the drop target has to pick the right one —
              // and a deal dragged between columns stays in its pipeline.
              e.dataTransfer.setData('text/pipeline-id', deal.pipelineId || '')
              e.dataTransfer.effectAllowed = 'move'
            }}
          />
        ))}
        {/* An empty column is also a DROP TARGET, and the old state said
            nothing about that: one line of grey text pinned to the top of a
            600px void. A dashed outline is the same shape a card would take
            if one were dragged here, so the column reads as "put one here"
            rather than "broken".

            Vertically centred, not top-aligned — text at the top of a tall
            empty box looks like content that failed to load. */}
        {loading && (
          <div style={{ display: 'grid', gap: 8 }}>
            <SkeletonStyles />
            {[0, 1].map((i) => (
              <div
                key={i}
                style={{
                  display: 'grid', gap: 8,
                  padding: 'var(--space-3)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-card)'
                }}
              >
                <Bar w="70%" h={13} />
                <Bar w="45%" h={11} />
              </div>
            ))}
          </div>
        )}

        {!loading && !deals.length && !error && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 8, minHeight: 140, padding: 'var(--space-4)',
            // Answers the drag too. The column already tints on hover, but
            // the placeholder inside it stayed grey — so the one element a
            // rep is aiming at was the one that did not react.
            border: `1px dashed ${over ? 'var(--green-300)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--radius-md)',
            // A shade lighter than the column, so the outline reads as an
            // opening in it rather than another card.
            background: over ? 'transparent' : 'var(--gray-50)',
            transition: 'border-color 120ms ease'
          }}>
            <span className="ms" style={{
              fontSize: 26,
              color: over ? 'var(--green-600)' : 'var(--text-faint)'
            }}>
              {over ? 'move_down' : 'inbox'}
            </span>
            <p style={{
              margin: 0, textAlign: 'center',
              fontSize: 'var(--text-md)', fontWeight: 500,
              color: 'var(--text-muted)'
            }}>
              No deals here
            </p>
            <p style={{
              margin: 0, textAlign: 'center',
              fontSize: 'var(--text-base)', color: 'var(--text-faint)',
              lineHeight: 1.4
            }}>
              Drag a deal across to move it into {stage.name}
            </p>
          </div>
        )}
        {hasMore && (
          <button
            onClick={() => load(cursor)}
            disabled={loading}
            style={{
              height: 30, border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)', background: 'var(--surface-card)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
              color: 'var(--text-body)', cursor: 'pointer'
            }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </section>
  )
}

// One pipeline's columns. Split out of DealBoard so the board can render
// several pipelines stacked when no single one is chosen — each keeps its own
// stage columns rather than merging stage lists, which would not be a board.
// MERGED COLUMNS — the board is ONE grid, whatever the pipeline picker says.
//
// It used to render a separate full-height board per pipeline when no single
// one was chosen. Eight pipelines meant eight grids, each with its own
// horizontal scrollbar, almost all of them reading "No deals here" — the
// board stopped being a board.
//
// Stage NAMES repeat across pipelines: every pipeline here has its own
// "Quote Sent", each with a different stage_id. So the columns are keyed by
// name and a column asks for every id that shares it (the list form of
// stageId, added in routes/deals.js for exactly this). One grid, one scroll,
// and picking a pipeline narrows the same grid instead of changing its shape.
function mergeStages(pipelines) {
  const byName = new Map()
  for (const p of pipelines) {
    for (const st of p.stages || []) {
      const key = (st.name || '').trim().toLowerCase()
      if (!key) continue
      if (!byName.has(key)) {
        byName.set(key, { name: st.name, ids: [], byPipeline: new Map(), position: st.position ?? 0 })
      }
      const slot = byName.get(key)
      slot.ids.push(st.id)
      slot.byPipeline.set(p.id, st.id)
      // The earliest position any pipeline gives this stage. Pipelines order
      // their shared stages the same way in practice, and taking the minimum
      // keeps a stage that is 3rd in one and 4th in another from jumping.
      slot.position = Math.min(slot.position, st.position ?? 0)
    }
  }
  return [...byName.values()]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    // `id` is what Column keys and registers reloaders by; the joined list is
    // also exactly what the query sends, so the two cannot drift.
    .map((s) => ({
      id: s.ids.join(','),
      name: s.name,
      position: s.position,
      // pipelineId -> the stage id this column means in THAT pipeline. A drop
      // writes one real stage id, never the joined list.
      stageIdFor: (pipelineId) => s.byPipeline.get(pipelineId) || (s.ids.length === 1 ? s.ids[0] : null)
    }))
}

export default function DealBoard({ pipeline, pipelines, search, status = 'open', tag, assignedTo, onOpenDeal, onOpenInHub }) {
  const [moveError, setMoveError] = useState(null)
  // stageId -> reload fn, so a move can refresh exactly the two columns it
  // touched rather than the whole board.
  const reloaders = useRef(new Map())

  const registerReload = useCallback((stageId, fn) => {
    reloaders.current.set(stageId, fn)
    return () => reloaders.current.delete(stageId)
  }, [])

  const move = useCallback(async (dealId, fromStage, toStage) => {
    setMoveError(null)
    try {
      await dealsAPI.update(dealId, { pipelineStageId: toStage })
      // Refetch BOTH columns rather than moving the card locally: the stage
      // change also updates the deal's timestamps and its position in the
      // sort, and a locally-inserted card would sit in the wrong place until
      // the next load.
      reloaders.current.get(fromStage)?.()
      reloaders.current.get(toStage)?.()
    } catch (e) {
      setMoveError(e.message || 'That deal could not be moved')
      // Put the card back where it was — the move did not happen.
      reloaders.current.get(fromStage)?.()
    }
  }, [])

  // Every pipeline in scope — the chosen one, or all of them — merged into
  // one set of columns. Built INSIDE the memo: a `list` computed outside is a
  // new array on every render, so the memo would recompute each time and
  // hand Column a new `stage` object, refetching the whole board on any
  // parent re-render.
  const stages = useMemo(
    () => mergeStages(
      Array.isArray(pipelines) && pipelines.length > 0
        ? pipelines
        : (pipeline ? [pipeline] : [])
    ),
    [pipelines, pipeline]
  )

  if (!stages.length) return null

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)', minHeight: 0 }}>
      {moveError && (
        <p style={{
          margin: 0, padding: 'var(--space-2) var(--space-3)',
          background: 'var(--tint-rose)',
          border: '1px solid var(--status-stuck)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-md)', color: 'var(--status-stuck-text)'
        }}>
          {moveError}
        </p>
      )}
      {/* Horizontal scroll lives HERE, not on the page: the board is wider
          than the viewport by design and the rest of the page must not move
          sideways. ONE scrollbar now, not one per pipeline. */}
      <div style={{
        display: 'flex', gap: 'var(--space-3)',
        overflowX: 'auto', overflowY: 'hidden',
        paddingBottom: 'var(--space-2)',
        minHeight: 420
      }}>
        {stages.map((st) => (
          <Column
            key={st.id}
            stage={st}
            search={search}
            status={status}
            tag={tag}
            assignedTo={assignedTo}
            onOpen={onOpenDeal}
            onOpenInHub={onOpenInHub}
            onMoved={move}
            registerReload={registerReload}
          />
        ))}
      </div>
    </div>
  )
}
