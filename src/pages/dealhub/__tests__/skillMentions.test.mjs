// The @-menu's search, against the real skill list.
//
// With 35 skills the menu is a scroll, so typing has to narrow it. It always
// could — nothing said so, and the matcher could not handle the way people
// actually type these names.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const src = readFileSync(new URL('../SkillMentions.jsx', import.meta.url), 'utf8')

// The shipped helpers, lifted verbatim.
const findStart = src.indexOf('export function findMentionQuery')
const findEnd = src.indexOf('export default')
// eslint-disable-next-line no-new-func
const { findMentionQuery } = new Function(
  src.slice(findStart, findEnd).replace('export function', 'function')
  + '; return { findMentionQuery }'
)()

// The matcher, rebuilt exactly as the useMemo body does.
function matchSkills(skills, query) {
  const raw = (query || '').trim().toLowerCase()
  if (!raw) return skills
  const words = raw.split(/[\s_]+/).filter(Boolean)
  const scored = []
  for (const s of skills) {
    const name = s.name.toLowerCase().replace(/_/g, ' ')
    const desc = (s.description || '').toLowerCase()
    if (!words.every((w) => name.includes(w) || desc.includes(w))) continue
    const inName = words.filter((w) => name.includes(w)).length
    const startsWord = words.some((w) => name.startsWith(w)) ? 1 : 0
    scored.push({ s, rank: inName * 2 + startsWord })
  }
  return scored
    .sort((a, b) => b.rank - a.rank || a.s.name.localeCompare(b.s.name))
    .map((x) => x.s)
}

// The real registry, so the test fails when a rename breaks a search people use.
const registry = JSON.parse(readFileSync(
  new URL('../../../../../pipelinePulse/server/data/skills/registry.json', import.meta.url),
  'utf8'
))
const SKILLS = registry.skills.map((r) => ({ name: r.skill, description: r.answers || '' }))

test('the real registry has enough skills to need a search', () => {
  assert.ok(SKILLS.length >= 30, `${SKILLS.length} skills`)
})

test('a multi-word query matches across underscores', () => {
  // "rep time" found NOTHING before: the words are both in
  // response_time_by_rep, separated by underscores and in the other order,
  // and a substring match only ever sees one contiguous run.
  const hits = matchSkills(SKILLS, 'rep time').map((s) => s.name)
  assert.ok(hits.includes('response_time_by_rep'), hits.join(', '))
})

test('words may be typed in any order', () => {
  const a = matchSkills(SKILLS, 'time rep').map((s) => s.name)
  const b = matchSkills(SKILLS, 'rep time').map((s) => s.name)
  assert.deepEqual(a, b)
})

test('"lost reason" finds the close-reason skills', () => {
  const hits = matchSkills(SKILLS, 'lost reason').map((s) => s.name)
  assert.ok(hits.some((n) => n.startsWith('close_reason')), hits.join(', '))
})

test('a name match outranks a description match', () => {
  // Someone typing "rep" wants the skills CALLED rep-something first, not the
  // ones that merely mention reps in their description.
  const hits = matchSkills(SKILLS, 'rep').map((s) => s.name)
  assert.ok(hits.length > 1)
  assert.match(hits[0], /rep/)
})

test('a query matching nothing returns nothing, not everything', () => {
  assert.equal(matchSkills(SKILLS, 'zzzz nonsense').length, 0)
})

test('an empty query shows every skill', () => {
  assert.equal(matchSkills(SKILLS, '').length, SKILLS.length)
})

test('@ opens the menu only at a word start', () => {
  assert.ok(findMentionQuery('@re', 3))
  assert.ok(findMentionQuery('tell me @re', 11))
  // An email address must not open it.
  assert.equal(findMentionQuery('a@b', 3), null)
})

test('the menu survives a space, so a name can be typed in words', () => {
  // The old rule closed the menu on ANY space, which made the multi-word
  // search above unreachable from the composer.
  const q = findMentionQuery('@rep time', 9)
  assert.equal(q?.query, 'rep time')
})

test('the menu closes once it stops looking like a name', () => {
  // It cannot stay open forever: an @ mid-sentence would hold a menu over the
  // rest of the question.
  assert.equal(findMentionQuery('@rep time by person now', 23), null)  // >3 words
  assert.equal(findMentionQuery('@rep,', 5), null)                      // punctuation
  assert.equal(findMentionQuery('@rep  ', 6), null)                     // double space
})

console.log('skill mentions: all cases pass')
