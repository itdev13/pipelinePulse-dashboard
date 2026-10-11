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

test('an unanswered heading renders as a real textarea', () => {
  // Not a button that becomes one on click. That box looked like a field but
  // was not: a rep who clicked and started typing lost the first keystroke,
  // because the click only opened the editor.
  assert.match(src, /<textarea/)
  assert.match(src, /rows=\{3\}/)
  assert.match(src, /resize: 'vertical'/)
  // No click-to-edit button left behind.
  assert.doesNotMatch(src, /minHeight: 64/)
})

test('the placeholder says the heading is unanswered', () => {
  // "Add answer…", not an empty box: the panel's whole point is which
  // questions have no answer, and a blank field states nothing.
  assert.match(src, /placeholder=\{canEdit \? 'Add answer…' : 'Not filled yet'\}/)
})

test('it is only editable when a saver is wired', () => {
  // readOnly, not disabled: a disabled textarea cannot be focused, so its
  // text cannot be selected or copied — and a rep with no write access still
  // needs to read the answer.
  assert.match(src, /readOnly=\{!canEdit\}/)
  assert.match(src, /if \(!canEdit \|\| editing === q\.fieldKey\) return/)
})

test('the edited row is the one that looks active', () => {
  // Ten identical boxes with no focus state gives no sign which one a save
  // would land on.
  assert.match(src, /editing === q\.fieldKey\s*\n?\s*\? 'var\(--accent-gold-text\)'/)
})

test('Save and Cancel show only on the row being edited', () => {
  // Ten permanent button pairs would be louder than the answers themselves.
  assert.match(src, /\{editing === q\.fieldKey && \(/)
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
  // BOTH buttons take the guard — abandoning mid-write leaves the rep on the
  // old value with a save still landing behind it.
  assert.equal((src.match(/disabled=\{saving\}/g) || []).length, 2)
})

test('blurring a changed box saves it', () => {
  // Focus is what opens the editor now, so clicking from one box into another
  // switches `editing` — without this the first box's typing was discarded
  // silently, which is data loss on a click-through. commit() returns without
  // a request when nothing changed, so a stray click costs nothing.
  assert.match(src, /onBlur=\{\(\) => \{/)
  assert.match(src, /if \(canEdit && editing === q\.fieldKey\) commit\(q\)/)
})

test('Escape does NOT save through that blur', () => {
  // setEditing(null) is queued, but .blur() dispatches onBlur in the same
  // tick — so the handler still reads `editing === q.fieldKey` from this
  // render's closure and would commit the draft the rep just abandoned. Only
  // a ref changes before the blur is dispatched.
  assert.match(src, /const abandoning = useRef\(false\)/)
  assert.match(src, /if \(abandoning\.current\) \{ abandoning\.current = false; return \}/)
  const esc = src.slice(src.indexOf("if (e.key === 'Escape')"))
  const flagAt = esc.indexOf('abandoning.current = true')
  const blurAt = esc.indexOf('.blur()')
  assert.ok(flagAt > -1 && flagAt < blurAt, 'the flag must be set before blur() fires')
})

test('the ref sits above the early return', () => {
  // A hook after a conditional return runs in a different order on the
  // renders that take it.
  assert.ok(
    src.indexOf('const abandoning = useRef(false)') < src.indexOf('if (qualification.length === 0) return null'),
    'useRef is below the early return'
  )
})
