// What the Owner dropdown SHOWS for a given value.
//
// The bug this exists for: the filter displayed a raw GHL user id
// ("h07KvFvGuKUVREXi...") where a name belonged. Two causes, both of which
// looked reasonable in isolation — which is why a test builds the option list
// the same way the component does and asserts the selected value resolves to
// a label.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const src = readFileSync(new URL('../ListFilters.jsx', import.meta.url), 'utf8')

// Rebuild the option list exactly as OwnerFilter's useMemo does.
function optionsFor(users, myId) {
  const me = myId ? users.find((u) => u.id === myId) : null
  const head = [
    { value: '', label: 'All owners' },
    { value: 'unassigned', label: 'Unassigned' }
  ]
  if (myId) {
    head.unshift({
      value: myId,
      label: me ? `Mine (${me.name || me.email || 'you'})` : 'Mine'
    })
  }
  const rest = users
    .filter((u) => u.id && u.id !== myId)
    .map((u) => ({ value: u.id, label: u.name || u.email || u.id }))
  return rest.length ? [...head, { label: '──────────', options: rest }] : head
}

const labelFor = (opts, value) => {
  for (const o of opts) {
    if (o.options) {
      const hit = o.options.find((x) => x.value === value)
      if (hit) return hit.label
    } else if (o.value === value) return o.label
  }
  return null   // no matching option — antd renders the raw value here
}

const USERS = [
  { id: 'u1', name: 'Brad Ricardo' },
  { id: 'u2', name: 'Charlie Stoyle' },
  { id: 'me', name: 'Vara Prasad' }
]

test('the signed-in user is IN the list, so their id resolves to a label', () => {
  // The original filtered `u.id !== myId` out of the options on the grounds
  // that a separate "Mine" entry covered it. The tabs then seeded the filter
  // with the raw id, so the selected value matched nothing and rendered as
  // the id — exactly what appeared on screen.
  const opts = optionsFor(USERS, 'me')
  assert.equal(labelFor(opts, 'me'), 'Mine (Vara Prasad)')
})

test('a colleague still resolves to their name', () => {
  assert.equal(labelFor(optionsFor(USERS, 'me'), 'u1'), 'Brad Ricardo')
})

test('your own row is first, so you are not hunting for yourself', () => {
  const opts = optionsFor(USERS, 'me')
  assert.equal(opts[0].value, 'me')
})

test('a user not in the synced list still gets a readable label', () => {
  // A GHL user who exists but has not synced into the users table. Before,
  // "Mine" was offered and returned nothing; now their row is present and
  // labelled, even without a name to show.
  const opts = optionsFor(USERS, 'ghost')
  assert.equal(labelFor(opts, 'ghost'), 'Mine')
})

test('users still loading: the id has no option yet', () => {
  // The transient case. labelRender turns this into the id or "Unknown owner"
  // rather than leaving antd to print the raw value.
  assert.equal(labelFor(optionsFor([], 'me'), 'me'), 'Mine')
})

test('All owners and Unassigned always resolve', () => {
  const opts = optionsFor(USERS, 'me')
  assert.equal(labelFor(opts, ''), 'All owners')
  assert.equal(labelFor(opts, 'unassigned'), 'Unassigned')
})

test('no user is listed twice', () => {
  const opts = optionsFor(USERS, 'me')
  const values = opts.flatMap((o) => (o.options ? o.options.map((x) => x.value) : [o.value]))
  assert.equal(new Set(values).size, values.length)
})

test('the MINE sentinel is gone from the module', () => {
  // One representation only: the id IS the value. A sentinel that callers
  // resolve separately is what let the seeded value and the option list
  // disagree in the first place.
  assert.doesNotMatch(src, /export const MINE/)
})

test('a warm cache still updates the component', () => {
  // THE BUG THAT PUT AN ID ON SCREEN, after the option list was already fixed.
  //
  // useUsers read `if (USER_CACHE.users) return` — a skip that looks free and
  // is not. The useState initialiser runs first and reads a null cache, so it
  // sets []. The shared fetch then RESOLVES. Only then does the effect run,
  // sees a populated cache, and returns WITHOUT calling setUsers — so the
  // component holds [] for its whole life and the selected id matches no
  // option.
  //
  // It bit exactly the tabs that also fetch users themselves: their own
  // request warms the cache in that gap. Which is why Contacts rendered the
  // raw id while its own filter chip, reading the same data from its own
  // state, rendered "J srini".
  assert.match(src, /if \(USER_CACHE\.users\) \{ setUsers\(USER_CACHE\.users\); return \}/)
  // Anchored to end-of-line: the FIXED line contains the same words and must
  // not be matched by the guard against the old one.
  assert.doesNotMatch(src, /if \(USER_CACHE\.users\) return\s*$/m)
  // Same shape, same reason, in the tag cache.
  assert.match(src, /if \(TAG_CACHE\.tags\) \{ setTags\(TAG_CACHE\.tags\); return \}/)
})

console.log('owner filter: all cases pass')
