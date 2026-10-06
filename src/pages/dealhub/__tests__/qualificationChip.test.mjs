// The empty qualification row has to LOOK clickable.
//
// It read "Not filled yet — click to add" as plain text, so the only hint
// that it was a control was the sentence itself. Now it is a dashed chip,
// matching the deal card's own unset field chips (DealSection's FieldPicker).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const src = readFileSync(new URL('../QualificationSection.jsx', import.meta.url), 'utf8')

test('an unfilled heading renders as a bordered chip', () => {
  assert.match(src, /border: '1px dashed var\(--status-stuck\)'/)
  assert.match(src, /borderRadius: 'var\(--radius-md\)'/)
})

test('it matches the pattern the deal chips already use', () => {
  // Dashed border + tinted fill + pill height is the established "unset,
  // click me" treatment. Inventing a second one would make two things that
  // mean the same look different.
  const chips = readFileSync(new URL('../DealSection.jsx', import.meta.url), 'utf8')
  assert.match(chips, /1px dashed var\(--accent-gold\)/)
})

test('the chip is only drawn when it can actually be clicked', () => {
  // A button that does nothing is worse than a label.
  assert.match(src, /\.\.\.\(canEdit \? \{/)
  assert.match(src, /canEdit \? 'Add answer' : 'Not filled yet'/)
})

test('the label still says the heading is unanswered', () => {
  // "Add" alone names the action but drops the state, and the panel's whole
  // point is which questions have no answer.
  assert.match(src, /'Add answer'/)
})

test('the cursor agrees with what is under it', () => {
  // A text caret over prose being edited; a pointer over the Add chip, which
  // is a control — a caret there contradicts the border saying so.
  assert.match(src, /q\.filled \? 'text' : 'pointer'/)
})
