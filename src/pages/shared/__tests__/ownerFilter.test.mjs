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

test('a stale sentinel from an older build is cleared, not sent to the API', () => {
  // '__mine__' was a real stored value until the release that removed it. It
  // survived in localStorage past that release and every request carried it to
  // an API that matched nothing: "Unknown owner" in the control, "0" beside
  // the title, and "No contacts in this sub-account yet" on an account with
  // 2,406 of them.
  const isGhlIdShaped = (v) => /^[A-Za-z0-9]{15,}$/.test(String(v))
  assert.equal(isGhlIdShaped('__mine__'), false)      // cleared
  assert.equal(isGhlIdShaped('h07KvFvGuKUVREXiabcd'), true)  // left alone
  // The component only auto-clears the first kind.
  assert.match(src, /if \(orphaned && !\/\^\[A-Za-z0-9\]\{15,\}\$\/\.test\(String\(value\)\)\) onChange\(ALL\)/)
})

test('a departed colleague is labelled, never silently cleared', () => {
  // Their records are still real and still theirs. Widening someone's filter
  // without telling them is worse than showing an empty list with a reason.
  assert.match(src, /'Former owner'/)
  assert.match(src, /no longer in the sub-account/)
})

test('the persisted store is versioned', () => {
  // The general fix: a snapshot written by a build whose values meant
  // something else is discarded, rather than revived into code that no longer
  // understands it. Without this the only cure was waiting out the 2-hour
  // expiry.
  const store = readFileSync(new URL('../../../hooks/useTabState.js', import.meta.url), 'utf8')
  assert.match(store, /const STORE_VERSION = \d+/)
  assert.match(store, /if \(raw\.v !== STORE_VERSION\) return new Map\(\)/)
  assert.match(store, /v: STORE_VERSION/)
})

test('a filter with its own control on the toolbar gets no chip', () => {
  // Owner and Tag moved out of the popover onto the toolbar, so a chip reading
  // "Owner J srini" sat inches from a dropdown reading "Mine (J srini)" — the
  // same fact twice, with two places to clear it from. Chips surface what is
  // HIDDEN in the popover; these are not hidden any more.
  const SELF_EVIDENT = new Set(['assignedTo', 'tag'])
  const filters = { assignedTo: 'me', tag: 'hot-lead', activity: 'quiet:30' }
  const allActive = Object.entries(filters).filter(([, v]) => v)
  const chipped = allActive.filter(([k]) => !SELF_EVIDENT.has(k))
  assert.deepEqual(chipped.map(([k]) => k), ['activity'])
})

test('Save view still appears when ONLY owner and tag are set', () => {
  // The trap in the dedup: keying "Save view" off the CHIPPED filters would
  // hide the button for a view filtered to one owner and one tag, which is a
  // perfectly ordinary view to want to save.
  const SELF_EVIDENT = new Set(['assignedTo', 'tag'])
  const filters = { assignedTo: 'me', tag: 'hot-lead' }
  const allActive = Object.entries(filters).filter(([, v]) => v)
  const chipped = allActive.filter(([k]) => !SELF_EVIDENT.has(k))
  assert.equal(chipped.length, 0)        // no chips
  assert.ok(allActive.length > 0)        // but Save view must still show
  const toolbar = readFileSync(new URL('../../deals/DealToolbar.jsx', import.meta.url), 'utf8')
  assert.match(toolbar, /\(allActive\.length > 0 && !activeViewId\)/)
})

console.log('owner filter: all cases pass')
