import React, { useEffect, useMemo, useState } from 'react'

// A skill's rows, charted — compact under the answer, expandable to full screen.
//
// A skill points at a view whose shape we do not know ahead of time, so this
// infers one: the first text column labels each row, the largest numeric
// column is the bar, and any other numeric columns break that bar into
// segments. That covers the common shape — a label and some counts — without
// anyone configuring a chart per skill.
//
// WHY BARS SCALE TO THE LARGEST ROW, not the column total. A stage with 3 of
// 150 deals is 2% of the total: as a fraction of the total it is an invisible
// sliver, and the chart says nothing about it. Against the biggest row it is a
// short bar you can still see and compare. The percentage of the total is
// printed as a number, where 2% is perfectly legible.
//
// Columns whose name ends `_id`, and any column that is the same on every row
// (a view's per-account totals, repeated by a window function), are dropped:
// neither says anything a chart can show.

const isNum = (v) => v !== null && v !== '' && !Number.isNaN(Number(v))

// A Date, or a string Postgres returned for a date/timestamp column. Number()
// rejects these, so isNum already excludes most — but node-postgres hands back
// real Date objects for DATE columns, and Number(new Date()) is a valid epoch
// integer. Without this a list view charted "created" as a bar of milliseconds
// since 1970: every bar full width, every difference invisible.
const isDateLike = (v) =>
  v instanceof Date ||
  (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v))

// A readable heading from a column name: pct_of_closed -> "Pct of closed".
const humanise = (c) =>
  String(c).replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase())

// A row label. A date renders as "Aug 2026" for a month bucket or "12 Aug" for
// a day — a raw "2026-08-01T00:00:00.000Z" down the side of a chart is
// unreadable and pushes every bar off the right of the card.
const labelOf = (v) => {
  if (v === null || v === undefined || v === '') return '—'
  if (isDateLike(v)) {
    const d = v instanceof Date ? v : new Date(v)
    if (!Number.isNaN(d.getTime())) {
      // LOCAL getters, not UTC. node-postgres turns a Postgres DATE into local
      // midnight, so getUTCDate() is the day BEFORE in any zone behind UTC —
      // at UTC+5:30 every month label read "Jun 30" instead of "Jul 2026",
      // which is both wrong and reads as a daily bucket.
      //
      // A plain date string (2026-07-01, no time) is parsed as UTC midnight by
      // the Date constructor, so that one is read with UTC getters instead.
      // The two cases have to be told apart or one of them is always off by a
      // day.
      const dateOnly = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
      const day = dateOnly ? d.getUTCDate() : d.getDate()
      const opts = dateOnly ? { timeZone: 'UTC' } : {}
      // First of the month = a month bucket; anything else is a real day.
      return day === 1
        ? d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', ...opts })
        : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...opts })
    }
  }
  return String(v)
}

const SEGMENT_COLOURS = [
  'var(--accent-plum-text)',
  'var(--accent-clay)',
  'var(--accent-teal-text)',
  'var(--accent-gold)'
]

// Every k-sized subset, in column order. Column counts here are small (a view
// has a handful of numeric columns), and the search is capped at 4, so this
// never explores more than a few dozen candidates.
function combinations(arr, k) {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [head, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map((c) => [head, ...c]),
    ...combinations(rest, k)
  ]
}

function shapeOf(rows) {
  if (!rows?.length) return null
  const cols = Object.keys(rows[0])

  // Constant across every row = a total repeated by a window function. Real
  // information, but not something a bar chart can express.
  const varying = cols.filter((c) => new Set(rows.map((r) => String(r[c]))).size > 1)
  const usable = varying.filter((c) => !/_id$/.test(c))

  // Dates are excluded from `numeric` before anything else: they pass Number()
  // as an epoch and would otherwise win the "biggest total" contest outright.
  const dates = usable.filter((c) => rows.some((r) => isDateLike(r[c])))
  const numeric = usable.filter(
    (c) => !dates.includes(c) && rows.every((r) => r[c] === null || isNum(r[c]))
  )
  const plainText = usable.filter((c) => !numeric.includes(c) && !dates.includes(c))

  // A date is not a MEASURE, but it is a perfectly good LABEL — and on a
  // month-by-month view it is the only one. Excluding dates from both roles
  // (the first fix for bars of epoch milliseconds) left every time series
  // unchartable, which is backwards: a trend is the shape that most wants a
  // chart. So dates are barred from the bar and allowed as the label.
  //
  // Preferred over a text column when present, because on a view that has
  // both, the date is what the rows are really organised by.
  const text = dates.length ? [dates[0], ...plainText] : plainText
  if (!text.length || !numeric.length) return null

  // The bar is a COUNT, never a percentage.
  //
  // Picking the numeric column with the biggest total looked right until real
  // data: three stages of 48/20/16 deals sum to 84, while their
  // pct_lost_in_stage of 27/70/100 sums to 197 — so the percentage won and the
  // chart drew "share of this stage that was lost" as if it were volume. A
  // percentage is a ratio; bars of ratios beside each other do not compare.
  const isPct = (c) => /^pct|_pct$|percent|_rate$/i.test(c)
  // Money is excluded from the bar for the same reason a percentage is: a
  // value column and a count column are different units, and value totals are
  // thousands of times larger, so value always wins the "biggest total"
  // contest and the chart silently becomes a revenue chart. Value is still
  // printed beside the bar as an extra.
  const isMoney = (c) => /value|revenue|amount|cost|spend/i.test(c)
  // An average or a median is a summary of a distribution, not a quantity of
  // anything. Bars of medians next to each other invite "this bar is twice
  // that one" readings that do not hold, and on the won-by-month view
  // median_days_to_win beat won_deals on raw total and became the chart —
  // drawing "how long deals took" where the question was "how many we won".
  const isStat = (c) => /^(median|avg|average|mean|p\d+)_|_(median|avg|average|mean)$|^median|^avg_/i.test(c)
  const counts = numeric.filter((c) => !isPct(c) && !isMoney(c) && !isStat(c))
  const totalOf = (c) => rows.reduce((n, r) => n + (Number(r[c]) || 0), 0)

  // A column whose name says it is the whole beats one that is a part of it.
  // Real case: the drop-off view returns closed_without_win (10 per stage) and
  // lost (10 per stage) — identical totals, so a plain sort picked whichever
  // came first and charted "lost" as if it were all deaths, hiding the
  // abandoned ones entirely. Totals are the honest default measure.
  const TOTALISH = /^(deals|total|count|leads|enquiries|closed|open_deals|won|notes)/i
  const pool = counts.length ? counts : numeric
  const measure = [...pool].sort((a, b) => {
    const d = totalOf(b) - totalOf(a)
    if (d !== 0) return d
    // Tie: prefer the name that reads as a whole, then the longer name, which
    // is almost always the more specific one (closed_without_win over lost).
    const at = TOTALISH.test(a) ? 1 : 0
    const bt = TOTALISH.test(b) ? 1 : 0
    return bt - at || b.length - a.length
  })[0]

  // Segments must sum to the measure to be worth stacking — lost + abandoned
  // = closed_without_win, but a percentage column does not, and stacking it
  // would draw a bar that means nothing.
  // Any SUBSET of the other counts that sums to the measure, not all of them.
  // The old test required every remaining count to add up, so a view carrying
  // lost + abandoned (which do sum) alongside total_lost (which does not)
  // failed the check and drew a flat bar, losing the split that was the whole
  // point of the chart.
  const others = counts.filter((c) => c !== measure)
  const sumsTo = (cand) => cand.length >= 2 && rows.every(
    (r) => Math.abs(cand.reduce((n, c) => n + (Number(r[c]) || 0), 0) - (Number(r[measure]) || 0)) < 0.5
  )
  // Longest workable subset first: a 3-way split says more than a 2-way one.
  // Capped at 4 segments — beyond that the bars are too thin to read and the
  // legend is longer than the chart.
  let parts = []
  for (let size = Math.min(4, others.length); size >= 2 && !parts.length; size -= 1) {
    for (const cand of combinations(others, size)) {
      if (sumsTo(cand)) { parts = cand; break }
    }
  }
  const sums = parts.length >= 2

  return {
    label: text[0],
    measure,
    segments: sums ? parts : [],
    // Everything else worth printing beside the bar, percentages last since
    // they qualify the count rather than standing alone.
    extras: [...numeric.filter((c) => c !== measure && !isPct(c)),
             ...numeric.filter((c) => c !== measure && isPct(c))]
  }
}

export default function SkillResult({ result }) {
  const [open, setOpen] = useState(false)
  // Memoised: `result?.rows || []` builds a NEW empty array on every render,
  // so shapeOf would re-run each time — and it walks every row of every
  // column to work out the shape.
  const rows = useMemo(() => result?.rows || [], [result])
  const shape = useMemo(() => shapeOf(rows), [rows])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!rows.length) return null

  // No label + measure pair means this view is not chartable — a table is the
  // honest fallback rather than an invented chart.
  const body = shape
    ? <Chart rows={rows} shape={shape} expanded={open} />
    : <Rows rows={rows} expanded={open} />

  return (
    <>
      <section style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 13px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--gray-50)'
        }}>
          <span className="ms" style={{ fontSize: 16, color: 'var(--accent-plum-text)' }}>
            insights
          </span>
          <span style={{
            fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-heading)'
          }}>
            {humanise(result.name)}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Expand"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              border: 'none', background: 'none', cursor: 'pointer',
              padding: 0, color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>open_in_full</span>
            Expand
          </button>
        </header>
        <div style={{ padding: '11px 13px' }}>{body}</div>
      </section>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${humanise(result.name)} — full view`}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 900,
            background: 'rgba(17, 22, 20, 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-4)'
          }}
        >
          <div style={{
            width: 'min(1100px, 100%)', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            background: '#fff', borderRadius: 'var(--radius-md)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden'
          }}>
            <header style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '13px 18px', borderBottom: '1px solid var(--border-default)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600,
                  color: 'var(--text-heading)'
                }}>
                  {humanise(result.name)}
                </h2>
                <p style={{
                  margin: '2px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
                }}>
                  {rows.length} row{rows.length === 1 ? '' : 's'}
                  {result.source ? ` · ${result.source}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  padding: 4, color: 'var(--text-muted)', lineHeight: 1
                }}
              >
                <span className="ms" style={{ fontSize: 22 }}>close</span>
              </button>
            </header>
            <div style={{ padding: 18, overflowY: 'auto' }}>{body}</div>
          </div>
        </div>
      )}
    </>
  )
}

function Chart({ rows, shape, expanded }) {
  const { label, measure, segments, extras } = shape
  // Scaled to the biggest row, not the column total — see the header note.
  const max = Math.max(...rows.map((r) => Number(r[measure]) || 0), 1)
  // Collapsed, show enough to see the shape of the distribution without
  // taking over the answer. Expanded, show everything.
  const shown = expanded ? rows : rows.slice(0, 8)

  return (
    <div style={{ display: 'grid', gap: expanded ? 13 : 9 }}>
      {segments.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {segments.map((c, i) => (
            <span key={c} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
            }}>
              <span style={{
                width: 9, height: 9, borderRadius: 2,
                background: SEGMENT_COLOURS[i % SEGMENT_COLOURS.length]
              }} />
              {humanise(c)}
            </span>
          ))}
        </div>
      )}

      {shown.map((r, i) => {
        const value = Number(r[measure]) || 0
        return (
          <div key={i} style={{ display: 'grid', gap: 4 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              fontSize: expanded ? 'var(--text-base)' : 'var(--text-sm)'
            }}>
              <span style={{
                flex: 1, minWidth: 0, color: 'var(--text-heading)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {labelOf(r[label])}
              </span>
              <span style={{
                color: 'var(--text-body)', fontWeight: 600,
                fontVariantNumeric: 'tabular-nums'
              }}>
                {value}
              </span>
              {extras.map((c) => (
                r[c] === null || r[c] === undefined ? null : (
                  <span key={c} style={{
                    color: 'var(--text-faint)', fontSize: 'var(--text-sm)',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {/^pct|_pct$|percent/i.test(c) ? `${r[c]}%` : `${humanise(c)} ${r[c]}`}
                  </span>
                )
              ))}
            </div>
            <div style={{
              display: 'flex', height: expanded ? 10 : 7,
              borderRadius: 999, overflow: 'hidden', background: 'var(--gray-100)'
            }}>
              {segments.length > 0
                ? segments.map((c, si) => {
                    const part = Number(r[c]) || 0
                    if (!part) return null
                    return (
                      <span
                        key={c}
                        title={`${humanise(c)}: ${part}`}
                        style={{
                          width: `${(part / max) * 100}%`,
                          background: SEGMENT_COLOURS[si % SEGMENT_COLOURS.length]
                        }}
                      />
                    )
                  })
                : (
                  <span style={{
                    width: `${(value / max) * 100}%`,
                    background: 'var(--accent-plum-text)'
                  }} />
                )}
            </div>
          </div>
        )
      })}

      {!expanded && rows.length > shown.length && (
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          {rows.length - shown.length} more — expand to see all
        </p>
      )}
    </div>
  )
}

// Fallback when the rows have no label + number pair to chart. A table is
// honest about what the data is; an invented chart is not.
function Rows({ rows, expanded }) {
  const cols = Object.keys(rows[0])
  const shown = expanded ? rows : rows.slice(0, 6)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={{
                textAlign: 'left', padding: '4px 10px 6px 0',
                borderBottom: '1px solid var(--border-default)',
                fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap'
              }}>
                {humanise(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} style={{
                  padding: '6px 10px 6px 0',
                  borderBottom: '1px solid var(--border-default)',
                  color: 'var(--text-body)', whiteSpace: 'nowrap'
                }}>
                  {labelOf(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!expanded && rows.length > shown.length && (
        <p style={{ margin: '7px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          {rows.length - shown.length} more — expand to see all
        </p>
      )}
    </div>
  )
}
