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
  assert.match(board, /\}, \[stage\.id, search, status, tag, assignedTo\]\)/)
})

test('both filters are threaded down the whole component chain', () => {
  // DealBoard -> PipelineBoard -> Column. A break at any level is invisible:
  // React passes undefined and the query just omits the filter.
  for (const sig of [
    /function Column\(\{ stage, search, status, tag, assignedTo,/,
    /function PipelineBoard\(\{ pipeline, search, status, tag, assignedTo,/,
    /export default function DealBoard\(\{ pipeline, pipelines, search, status = 'open', tag, assignedTo,/
  ]) assert.match(board, sig)
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
