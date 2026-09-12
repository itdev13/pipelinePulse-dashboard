import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dealsAPI } from '../../api/deals'
import { formatMoney } from '../../utils/money'

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
function DealCard({ deal, onOpen, onDragStart, dragging }) {
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
      {/* 15px, not 13px. A card's title is the one thing scanned down a
          column, and at the body size it carried no more weight than the
          contact line under it. */}
      <h4 style={{
        margin: 0, fontSize: 15, fontWeight: 600,
        color: 'var(--text-heading)', lineHeight: 1.3,
        letterSpacing: '-0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>
        {deal.dealTag || deal.opportunityName || 'Untitled deal'}
      </h4>

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
function Column({ stage, search, status, onOpen, onMoved, registerReload }) {
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
        q: search || undefined
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
  }, [stage.id, search, status])

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
        if (id && from !== stage.id) onMoved(id, from, stage.id)
      }}
      style={{
        flex: 'none', width: 320,
        display: 'flex', flexDirection: 'column',
        // A fixed height, not maxHeight: every column ends at the same line
        // whether it holds ten cards or none, so the board reads as a grid.
        // Without it, an empty column collapsed to its header and the row of
        // headers sat at different depths.
        height: 'calc(100vh - 260px)', minHeight: 380,
        background: over ? 'var(--tint-pine)' : 'var(--gray-50)',
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
        padding: '11px 14px',
        background: 'var(--surface-card)',
        borderBottom: '1px solid var(--border-default)',
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
            dragging={false}
            onDragStart={(e, deal) => {
              e.dataTransfer.setData('text/deal-id', deal.id)
              e.dataTransfer.setData('text/stage-id', stage.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
          />
        ))}
        {!loading && !deals.length && !error && (
          <p style={{
            margin: 0, padding: 'var(--space-3)',
            fontSize: 'var(--text-base)', color: 'var(--text-faint)',
            textAlign: 'center'
          }}>
            Nothing in this stage
          </p>
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

export default function DealBoard({ pipeline, search, status = 'open', onOpenDeal }) {
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

  // Retired stages still hold deals, so they are shown; they are simply not
  // offered as destinations by GHL. Sorted by position, as the pipeline is.
  const stages = useMemo(
    () => [...(pipeline?.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [pipeline]
  )

  if (!pipeline) return null

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
          sideways with it. */}
      <div style={{
        display: 'flex', gap: 'var(--space-3)',
        overflowX: 'auto', overflowY: 'hidden',
        paddingBottom: 'var(--space-2)',
        minHeight: 420
      }}>
        {stages.map((s) => (
          <Column
            key={s.id}
            stage={s}
            search={search}
            status={status}
            onOpen={onOpenDeal}
            onMoved={move}
            registerReload={registerReload}
          />
        ))}
      </div>
    </div>
  )
}
