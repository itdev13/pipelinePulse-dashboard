// The board must apply the SAME filters the toolbar above it shows.
//
// Reported as "tags not filtering on opportunities pipeline": a rep set
// Tag = "gone quiet", the count beside the heading read 0, and the columns
// underneath went on showing every deal. Two numbers on one screen
// contradicting each other.
//
// The cause was not the query. routes/deals.js has supported `tag` and
// `assignedTo` all along, and DealsTab's own count effect sends both — which
// is exactly why the count dropped to 0 while the board did not. The props
// simply never reached the columns.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const board = readFileSync(new URL('../DealBoard.jsx', import.meta.url), 'utf8')
const tab = readFileSync(new URL('../../tabs/DealsTab.jsx', import.meta.url), 'utf8')

test('a column sends the tag and owner filters with its query', () => {
  const load = board.slice(board.indexOf('const load = useCallback'), board.indexOf('useEffect(() => { load(null) })'))
  assert.match(load, /tag: tag \|\| undefined/)
  assert.match(load, /assignedTo: assignedTo \|\| undefined/)
})

test('a column refetches when either filter changes', () => {
  // Without these in the dependency list the first render would filter and
  // every later change would silently show stale rows — a worse bug than the
  // original, because it looks like it works.
  const deps = board.match(/\}, \[stage\.id, search, status[^\]]*\]\)/)
  assert.ok(deps, "the column's load callback should have a dependency list")
  assert.match(deps[0], /tag/)
  assert.match(deps[0], /assignedTo/)
})

test('both filters are threaded down the whole component chain', () => {
  // DealBoard -> PipelineBoard -> Column. A break at any level is invisible:
  // React passes undefined and the query just omits the filter.
  // Matched on the parameter LIST, not an exact signature: these components
  // gain props over time and a test that pins the full argument order fails
  // on an unrelated addition, which teaches people to edit the test rather
  // than read it.
  for (const name of ['Column', 'PipelineBoard', 'DealBoard']) {
    const sig = board.match(new RegExp(`function ${name}\\(\\{([^}]*)\\}`))
    assert.ok(sig, `${name} should destructure its props`)
    assert.match(sig[1], /\btag\b/, `${name} should accept tag`)
    assert.match(sig[1], /\bassignedTo\b/, `${name} should accept assignedTo`)
  }
  // and actually passed, not just accepted
  assert.ok((board.match(/tag=\{tag\}/g) || []).length >= 2, 'tag must be passed at each level')
  assert.ok((board.match(/assignedTo=\{assignedTo\}/g) || []).length >= 2)
})

test('DealsTab gives the board the same filters it gives the count query', () => {
  // The count effect and the board must agree, or the heading contradicts
  // what is under it.
  assert.match(tab, /tag=\{filters\.tag \|\| undefined\}/)
  assert.match(tab, /assignedTo=\{filters\.assignedTo \|\| undefined\}/)
  assert.match(tab, /tag: filters\.tag \|\| undefined/)
  assert.match(tab, /assignedTo: filters\.assignedTo \|\| undefined/)
})

test('stage is still NOT passed to the board', () => {
  // The board's columns ARE the stages — a stageId would leave one column
  // populated and the rest empty. This is the one filter that must not pass.
  const call = tab.slice(tab.indexOf('<DealBoard'), tab.indexOf('onOpenDeal={setOpenDealId}'))
  assert.ok(!/stageId=/.test(call), 'a stage filter must not reach the board')
})

// ── STACKING EVERY PIPELINE ──────────────────────────────────────────
// With no pipeline picked the board stacks one per pipeline. Each used
// full-height columns (calc(100vh - 260px)), so eight pipelines meant eight
// screens — almost all of them reading "No deals here" — with the one that
// had deals somewhere below the fold.

test('stacked boards use compact columns, a single board does not', () => {
  // The full-height rule is right for ONE board: it makes the columns end on
  // the same line and read as a grid. Stacked, it is what produced the
  // screens of nothing.
  assert.match(board, /const compact = showAll && list\.length > 1/)
  assert.match(board, /height: compact \? 'auto' : 'calc\(100vh - 260px\)'/)
  assert.match(board, /maxHeight: compact \? 'calc\(100vh - 260px\)' : undefined/)
})

test('an empty pipeline collapses only once it has reported zero', () => {
  // `undefined` means its columns have not answered yet. Collapsing on that
  // would hide a pipeline before its deals had a chance to arrive.
  assert.match(board, /const isEmpty = compact && n === 0 && !expanded\.has\(p\.id\)/)
})

test('a pipeline total is only published once every stage has answered', () => {
  // Otherwise the sum is partial and a populated pipeline flickers through
  // "empty" as its columns land one at a time.
  assert.match(board, /Object\.keys\(counts\)\.length >= stages\.length/)
  assert.match(board, /if \(settled\) onTotal/)
})

test('counts are kept per stage, not accumulated', () => {
  // A column refetches on every filter change and on both sides of a drag.
  // A running sum would climb on each one.
  assert.match(board, /setCounts\(\(prev\) => \(prev\[stageId\] === n \? prev : \{ \.\.\.prev, \[stageId\]: n \}\)\)/)
})

test('a collapsed pipeline stays mounted', () => {
  // Unmounting drops its columns' counts, so `totals` loses the zero that
  // collapsed it and it expands again on the next render — a loop. Hidden,
  // it keeps reporting, so a filter change that gives it deals reopens it.
  assert.match(board, /isEmpty \? \{ display: 'none' \} : undefined/)
})

test('a collapsed pipeline can still be opened', () => {
  // An empty pipeline is a real drop target — dragging a deal into it is how
  // it stops being empty — so this must be reversible, not a filter.
  assert.match(board, /Show stages/)
  assert.match(board, /setExpanded\(\(prev\) => new Set\(prev\)\.add\(p\.id\)\)/)
})
