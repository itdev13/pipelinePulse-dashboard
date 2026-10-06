// Deal custom-field chips: what they show, and what survives a save.
//
// Two reported problems, one screenshot:
//   1. Clearing Product type showed "Not set", then the OLD value came back
//      — along with every other field the rep had just changed.
//   2. Lead source opportunity rendered as {"{\"{\\\"Webchat\\\"}\"}"}.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const section = readFileSync(new URL('../DealSection.jsx', import.meta.url), 'utf8')
const tab = readFileSync(new URL('../../tabs/DealHubTab.jsx', import.meta.url), 'utf8')

const unwrapNested = (() => {
  const fn = section.slice(section.indexOf('function unwrapNested'), section.indexOf('const FIELD_CHIPS'))
  // eslint-disable-next-line no-new-func
  return new Function(`${fn}; return unwrapNested`)()
})()

test('a repeatedly JSON-encoded value reduces to its text', () => {
  // The exact value from production.
  assert.equal(unwrapNested('{"{\\"{\\\\\\"Webchat\\\\\\"}\\"}"}'), 'Webchat')
})

test('a single Postgres array wrapper is peeled', () => {
  assert.equal(unwrapNested('{"Webchat"}'), 'Webchat')
})

test('an ordinary value is untouched', () => {
  // The unwrapper must never mangle the normal case, which is almost every
  // value — that would be a far worse bug than the one it fixes.
  for (const v of ['Webchat', 'Homeowner', 'Crittall', 'Steel & glass', '']) {
    assert.equal(unwrapNested(v), v)
  }
})

test('non-strings pass through', () => {
  assert.equal(unwrapNested(null), null)
  assert.equal(unwrapNested(undefined), undefined)
  assert.equal(unwrapNested(42), 42)
})

test('the chips render through the unwrapper', () => {
  assert.match(section, /value=\{unwrapNested\(deal\[key\]\)\}/)
})

// ── The revert ───────────────────────────────────────────────────────
test('the reconcile merges rather than replacing the whole deal', () => {
  // `setDeal(fresh)` wholesale put every field back when the 2.5s guess lost
  // its race with GHL's webhook — so a rep cleared one chip and watched the
  // old value return along with anything else changed in those seconds.
  // Scoped to the custom-field branch. The PEOPLE reconcile a few hundred
  // lines down is still a wholesale setDeal and should stay one — a contact
  // link has no locally-applied field to preserve, so there is nothing to
  // pin and merging would only add a way to go wrong.
  const branch = tab.slice(tab.indexOf("if (field === 'customField')"), tab.indexOf("} else if (field === 'status')"))
  assert.ok(
    !/dealsAPI\.get\(dealId\)\.then\(setDeal\)/.test(branch),
    'the custom-field reconcile must not replace the deal wholesale'
  )
  assert.match(branch, /const merged = \{ \.\.\.fresh \}/)
})

test('the field just saved is pinned over a stale refetch', () => {
  assert.match(tab, /if \(pinnedKey && fresh\[pinnedKey\] !== pinnedText\)/)
  assert.match(tab, /q\.fieldId === pinnedId/)
})

// The merge itself — modelled, because the ordering is the fix.
const merge = (fresh, pinnedKey, pinnedText, pinnedId) => {
  const m = { ...fresh }
  if (pinnedKey && fresh[pinnedKey] !== pinnedText) m[pinnedKey] = pinnedText
  if (pinnedId && Array.isArray(fresh.qualification)) {
    m.qualification = fresh.qualification.map((q) => (
      q.fieldId === pinnedId
        ? { ...q, value: pinnedText, filled: !!(pinnedText && String(pinnedText).trim()) }
        : q
    ))
  }
  return m
}

test('a CLEAR survives a server that has not caught up', () => {
  const r = merge({ productType: 'Crittall', clientType: 'Homeowner' }, 'productType', null, null)
  assert.equal(r.productType, null)
  // and nothing else is disturbed
  assert.equal(r.clientType, 'Homeowner')
})

test('untouched fields still come from the server', () => {
  // The point of reconciling at all: a value GHL normalised must win.
  const r = merge({ productType: 'Steel', clientType: 'Trade' }, 'productType', 'Steel', null)
  assert.equal(r.clientType, 'Trade')
  assert.equal(r.productType, 'Steel')
})

test('a cleared qualification row does not disturb its siblings', () => {
  const r = merge(
    { qualification: [{ fieldId: 'f1', value: 'old', filled: true }, { fieldId: 'f2', value: 'keep', filled: true }] },
    null, null, 'f1'
  )
  assert.deepEqual(r.qualification[0], { fieldId: 'f1', value: null, filled: false })
  assert.deepEqual(r.qualification[1], { fieldId: 'f2', value: 'keep', filled: true })
})
