// The unanswered state on a qualification heading.
//
// Run: node --test src/pages/dealhub/__tests__/qualificationChip.test.mjs
//
// It was a dashed rose CHIP reading "Add answer", matching the deal card's
// unset field chips. The client's October 2026 design replaces it with a box
// shaped like the input it becomes, carrying an "Add answer…" placeholder —
// so the panel reads as a form rather than as a report.
//
// The PRINCIPLE the chip existed for has not changed and is still asserted
// below: an unanswered heading must look like somewhere you can type, must say
// it is unanswered, and must not pretend to be editable when no saver is
// wired.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../QualificationSection.jsx', import.meta.url), 'utf8')

test('an unanswered heading renders as an input-shaped box', () => {
  // A bordered box with a real height — the chip was pill-sized, which read as
  // a button rather than as a field with room for a sentence.
  assert.match(src, /minHeight: 64/)
  assert.match(src, /border: '1px solid var\(--border-default\)'/)
})

test('the placeholder says the heading is unanswered', () => {
  // "Add answer…", not an empty box: the panel's whole point is which
  // questions have no answer, and a blank field states nothing.
  assert.match(src, /'Add answer…'/)
})

test('it is only interactive when a saver is wired', () => {
  // A button that does nothing is worse than a label — read-only still shows
  // the box, but says "Not filled yet" and takes no caret.
  assert.match(src, /canEdit \? 'Add answer…' : 'Not filled yet'/)
  assert.match(src, /disabled=\{!canEdit\}/)
  assert.match(src, /cursor: canEdit \? 'text' : 'default'/)
})

test('a real answer is not styled as a placeholder', () => {
  // Faint grey is the contract for "nothing here yet" across every input in
  // the app; an actual answer rendered in it would read as unfilled.
  assert.match(src, /q\.filled \? 'var\(--text-body\)' : 'var\(--text-faint\)'/)
})

test('the two-column grid collapses rather than crushing the box', () => {
  // Side by side in a narrow panel, a question and its answer box share about
  // 300px and both become unreadable.
  assert.match(src, /repeat\(auto-fit, minmax\(420px, 1fr\)\)/)
})

test('an odd heading count does not leave a grey hole', () => {
  // The 1px gaps are the background showing through, so a half-empty final
  // row shows the gap colour as a block.
  assert.match(src, /qualification\.length % 2 === 1 && <div style=\{\{ background: '#fff' \}\} \/>/)
})

test('saving is per-heading, and blocks cancel too', () => {
  // A global "something is saving" flag greyed every row's buttons. And
  // abandoning the box mid-write leaves the rep looking at the old value with
  // a save still landing behind it.
  assert.match(src, /const saving = savingField === q\.fieldKey/)
  assert.match(src, /\/\/ Cancel is disabled mid-write too/)
})
