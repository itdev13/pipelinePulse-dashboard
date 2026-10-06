// The skills editor: what it shows and what it still stores.
//
// Every case here is a real complaint. The editor is a form over 56 saved
// skills, and two of its three problems were about what VANISHED when you
// touched it.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const src = readFileSync(new URL('../SkillsSection.jsx', import.meta.url), 'utf8')

test('editing does not replace the whole list', () => {
  // `editing ? <SkillForm/> : <list/>` emptied the page down to one form, so
  // clicking Edit on one of 56 skills read as though the rest were deleted.
  assert.ok(
    !/\{editing \? \(\s*<SkillForm/.test(src),
    'the form must not be rendered INSTEAD of the list'
  )
  assert.ok(
    /editing\?\.id === s\.id/.test(src),
    'the form should open in place of the row it belongs to'
  )
})

test('Deal AI is offered as a real choice', () => {
  // It was hard-disabled with "not yet", from before Deal AI ran the tool
  // loop. skillToolsFor(locationId, 'deal') has served deal skills since the
  // port, so the only thing stopping one was this pill.
  assert.ok(!/not yet/.test(src), 'the Deal AI option should no longer be disabled')
  assert.ok(!/const unavailable = key === 'deal'/.test(src))
  assert.ok(/\['deal', 'Deal AI'\]/.test(src), 'Deal AI should still be listed')
})

test('Deal AI is not ticked by default', () => {
  // A portfolio skill reads across every deal. Turning that on for a
  // single-deal chat by default would offer the model a tool whose answer is
  // about the wrong scope.
  const blank = src.slice(src.indexOf('const BLANK'), src.indexOf('export default'))
  assert.match(blank, /surfaces: \['portfolio'\]/)
  assert.ok(!/surfaces: \['portfolio', 'deal'\]/.test(blank))
})

test('filters and sort are no longer edited here', () => {
  assert.ok(!/label="Filters the AI can apply"/.test(src))
  assert.ok(!/label="Sort by"/.test(src))
  assert.ok(!/function ParamRow/.test(src), 'the row builder should be gone with it')
})

test('filters and sort are still SAVED', () => {
  // The whole risk of removing the editor: a save that dropped params would
  // silently strip every seeded skill's filters the first time someone opened
  // it to fix a typo. They load via {...BLANK, ...skill} and must go back out.
  assert.match(src, /params: form\.params/)
  assert.match(src, /orderBy: form\.orderBy\?\.trim\(\) \|\| null/)
  assert.match(src, /\{ \.\.\.BLANK, \.\.\.skill \}/)
})
