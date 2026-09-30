// What a skill's rows get charted AS.
//
// A skill points at a view whose shape nobody declared, so SkillResult infers
// one. Every case here is a wrong inference caught against real view output —
// each drew a chart that was legible, confident and about the wrong thing,
// which is worse than no chart.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The shipped helpers, lifted verbatim rather than copied, so this tests what
// actually renders.
const src = readFileSync(new URL('../SkillResult.jsx', import.meta.url), 'utf8')
const body = src
  .slice(src.indexOf('const isNum'), src.indexOf('export default'))
  .replace(/const SEGMENT_COLOURS[\s\S]*?\]\n/, '')
// eslint-disable-next-line no-new-func
const { shapeOf, labelOf } = new Function(`${body}; return { shapeOf, labelOf }`)()

test('a date column is never the bar', () => {
  // A list view: the only "big number" is a timestamp. Number(new Date()) is a
  // valid epoch, so this charted milliseconds since 1970 — every bar full
  // width, every difference invisible.
  const rows = [
    { deal: 'A', lost_at: new Date('2026-09-29'), monetary_value: 2000 },
    { deal: 'B', lost_at: new Date('2026-08-01'), monetary_value: 9000 }
  ]
  assert.notEqual(shapeOf(rows).measure, 'lost_at')
})

test('a date IS allowed as the row label', () => {
  // The first fix for the above barred dates from both roles, which left every
  // month-by-month view unchartable — backwards, since a trend is the shape
  // that most wants a chart.
  const rows = [
    { month: new Date('2026-07-01'), won_deals: 7 },
    { month: new Date('2026-08-01'), won_deals: 9 }
  ]
  const s = shapeOf(rows)
  assert.equal(s.label, 'month')
  assert.equal(s.measure, 'won_deals')
})

test('month labels are not off by one in a timezone behind UTC', () => {
  // node-postgres returns a DATE as LOCAL midnight. getUTCDate() is then the
  // previous day anywhere behind UTC: at UTC+5:30 "2026-07-01" read as
  // "Jun 30", which is both wrong and reads as a daily bucket.
  const local = new Date(2026, 6, 1)               // 1 July, local midnight
  assert.match(labelOf(local), /Jul/)
  assert.doesNotMatch(labelOf(local), /Jun/)
  // A plain date string parses as UTC midnight instead — the other direction.
  assert.match(labelOf('2026-07-01'), /Jul/)
})

test('money is never the bar when a count is available', () => {
  // Value totals are thousands of times larger than counts, so value always
  // won the "biggest total" contest and every chart quietly became a revenue
  // chart regardless of the question.
  const rows = [
    { area: 'SW', deals: 40, won: 10, won_value: 270000 },
    { area: 'B', deals: 25, won: 4, won_value: 190000 }
  ]
  assert.equal(shapeOf(rows).measure, 'deals')
})

test('a median or average is never the bar', () => {
  // A median summarises a distribution; it is not a quantity. Bars of medians
  // invite "twice as long" readings that do not hold. On the won-by-month view
  // median_days_to_win beat won_deals on raw total and became the chart.
  const rows = [
    { month: new Date('2026-07-01'), won_deals: 7, median_days_to_win: 40 },
    { month: new Date('2026-08-01'), won_deals: 9, median_days_to_win: 45 }
  ]
  assert.equal(shapeOf(rows).measure, 'won_deals')
})

test('the total wins over a part when their column totals tie', () => {
  // Real case: the drop-off view returns closed_without_win and lost with
  // identical totals. A plain sort took whichever came first and charted
  // "lost" as though it were every death, hiding the abandoned ones.
  const rows = [
    { stage: 'Quote Sent', closed_without_win: 10, lost: 10, abandoned: 0 },
    { stage: 'Negotiation', closed_without_win: 10, lost: 10, abandoned: 0 }
  ]
  // Both constant here, so the view is unchartable — the guard that matters is
  // that `lost` never beats the total when they DO vary.
  // Every column must actually vary, or the constant-column filter drops it
  // before the split is even considered — which is correct behaviour, and was
  // what made the first version of this test fail.
  const varying = [
    { stage: 'A', closed_without_win: 30, lost: 20, abandoned: 10 },
    { stage: 'B', closed_without_win: 15, lost: 5, abandoned: 10 },
    { stage: 'C', closed_without_win: 12, lost: 9, abandoned: 3 }
  ]
  assert.equal(shapeOf(varying).measure, 'closed_without_win')
  assert.deepEqual(shapeOf(varying).segments, ['lost', 'abandoned'])
  assert.equal(shapeOf(rows), null)
})

test('a subset that sums to the measure becomes the split', () => {
  // The old test required EVERY other count to add up, so a view carrying a
  // real split alongside an unrelated total failed and drew a flat bar.
  const rows = [
    { src: 'A', deals: 10, won: 4, lost: 6, total_deals_all_sources: 30 },
    { src: 'B', deals: 20, won: 5, lost: 15, total_deals_all_sources: 30 }
  ]
  const s = shapeOf(rows)
  assert.equal(s.measure, 'deals')
  assert.deepEqual(s.segments, ['won', 'lost'])
})

test('a percentage is never the bar', () => {
  // Bars of ratios side by side do not compare. Three stages of 48/20/16 deals
  // sum to 84 while their percentages sum to 197, so the percentage won.
  const rows = [
    { stage: 'A', deals: 48, pct_lost_in_stage: 27 },
    { stage: 'B', deals: 20, pct_lost_in_stage: 70 }
  ]
  assert.equal(shapeOf(rows).measure, 'deals')
})

test('rows with no numeric column fall back to a table', () => {
  const rows = [{ deal: 'A', owner: 'Rep One' }, { deal: 'B', owner: 'Rep Two' }]
  assert.equal(shapeOf(rows), null)
})

test('a column constant on every row is not charted', () => {
  // Views carry per-account totals repeated by a window function. Real
  // information; nothing a bar chart can say.
  const rows = [
    { stage: 'A', deals: 10, account_total: 30 },
    { stage: 'B', deals: 20, account_total: 30 }
  ]
  const s = shapeOf(rows)
  assert.equal(s.measure, 'deals')
  assert.ok(!s.extras.includes('account_total'))
})

console.log('skill chart shape: all cases pass')
