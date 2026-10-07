// "Edit record" must open the DEAL'S OWN PAGE, not the Deals list.
//
// Reported: clicking it "just links to the 'deals' tab". It did carry the
// deal id, but seeded `editingId` — the state that expands a deal's row
// INLINE in the list. So the rep landed on the list with a row quietly open
// somewhere in it and had to go find it.
//
// `openDealId` is the full record page (DealEditPage), and it fetches the
// deal when the loaded page does not contain it — so it works for a deal the
// list has never shown.
//
// Asserted against the source: the destination is a choice of which state a
// prop seeds, which no test of rendered output would distinguish.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const deals   = read('../DealsTab.jsx')
const shell   = read('../../DealHubShell.jsx')
const section = read('../../dealhub/DealSection.jsx')

test('the hub request opens the record page, not an inline row', () => {
  assert.match(deals, /if \(initialEditDealId\) setOpenDealId\(initialEditDealId\)/)
  assert.ok(
    !/if \(initialEditDealId\) setEditingId\(initialEditDealId\)/.test(deals),
    'seeding editingId reopens the inline row in the list — the reported bug'
  )
})

test('openDealId is declared before the effect that seeds it', () => {
  // `const` is not hoisted, and this file has thrown a temporal-dead-zone
  // error on exactly this before.
  assert.ok(
    deals.indexOf("const [openDealId, setOpenDealId]") < deals.indexOf('if (initialEditDealId) setOpenDealId'),
    'the seeding effect must come after the declaration'
  )
})

test('inline row editing still exists for the list itself', () => {
  // The fix redirects one entry point; it must not remove the list's own
  // expand-a-row behaviour.
  assert.match(deals, /const \[editingId, setEditingId\] = useTabState\('deals', 'editingId', null\)/)
  assert.match(deals, /expanded=\{editingId === d\.id\}/)
})

test('the request is still one-shot', () => {
  // Without this, navigating to Deals later for any other reason would
  // reopen the record of a deal the rep had finished with.
  assert.match(shell, /if \(to\.tab !== 'deals'\) setEditDealId\(null\)/)
})

test('the deal id still travels from the hub', () => {
  assert.match(shell, /onEditDealRecord=\{\(id\) => \{ setEditDealId\(id\); navigate\(\{ tab: 'deals' \}\) \}\}/)
  assert.match(deals, /initialEditDealId/)
})

test('the button comment no longer describes the old destination', () => {
  // A comment promising the list behaviour would send the next reader
  // looking for a bug that is not there.
  assert.ok(!/editor already expanded/.test(section))
  assert.match(section, /OWN RECORD PAGE/)
})
