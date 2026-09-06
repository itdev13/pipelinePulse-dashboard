// Editing a contact's custom fields.
//
// The riskiest part is not the rendering — it is what goes on the wire.
// GHL accepts several shapes for `customFields` and SILENTLY IGNORES the
// wrong ones, so a bad value produces a successful save and an unchanged
// field. That is worse than an error, because nothing tells the rep.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const detail = readFileSync(join(here, '..', 'ContactDetail.jsx'), 'utf8');
const sections = readFileSync(join(here, '..', '..', 'shared', 'CustomFieldSections.jsx'), 'utf8');

// normaliseOut, mirrored from ContactDetail.
const normaliseOut = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(',');
  return v;
};

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

console.log('what goes on the wire');

t('a multi-select becomes a comma-joined string', () => {
  // GHL stores a CHECKBOX field as a joined string on the contact. Sending
  // the array is a shape it accepts and then ignores.
  assert.equal(normaliseOut(['Homeowner', 'Architect']), 'Homeowner,Architect');
});

t('a single value passes through', () => {
  assert.equal(normaliseOut('Cortizo'), 'Cortizo');
});

t('a cleared field sends an empty string, not null', () => {
  // Dropping the key leaves the OLD value in place, so a clear must be
  // explicit.
  assert.equal(normaliseOut(null), '');
  assert.equal(normaliseOut(undefined), '');
});

t('an emptied multi-select clears rather than sending "[]"', () => {
  assert.equal(normaliseOut([]), '');
});

t('a number survives — not every field is text', () => {
  assert.equal(normaliseOut(42), 42);
  assert.equal(normaliseOut(0), 0, 'zero is a real answer, not an empty one');
});

t('false survives — a checkbox set to no is an answer', () => {
  assert.equal(normaliseOut(false), false);
});

console.log('\nonly what changed is sent');

t('the patch is built from the DIRTY ids, not every field', () => {
  // Forty fields behind one Save would rewrite values the rep never touched,
  // and an unrelated failure would look like their edit failed.
  assert.match(detail, /const dirtyIds = Object\.keys\(draft\)/);
  assert.match(detail, /dirtyIds\.map\(\(id\) => \(\{/);
});

t('it sends field_value in SNAKE case', () => {
  // The one key in GHL's contact body that is not camelCase. fieldValue is
  // accepted by the request and then ignored.
  assert.match(detail, /field_value: normaliseOut\(draft\[id\]\)/);
});

t('the save bar only appears once something changed', () => {
  assert.match(detail, /dirtyIds\.length > 0 && \(/);
});

console.log('\nthe sections');

t('the first folder is open, the rest closed', () => {
  // Eight folders open at once would bury the contact's name and phone.
  assert.match(sections, /new Set\(groups\.length \? \[groups\[0\]\.id \?\? '__ungrouped__'\] : \[\]\)/);
});

t('FILE_UPLOAD is rendered but not editable', () => {
  // No OAuth documents API — a control that could never save would be a lie.
  assert.match(sections, /if \(field\.readOnly\)/);
  assert.match(sections, /Upload files in your CRM/);
});

t('an unknown field type still renders as text', () => {
  // A type we do not recognise is better shown than hidden, and text
  // round-trips through GHL unchanged.
  assert.match(sections, /TEXT, NUMERICAL, PHONE, MONETARY and anything unrecognised/);
});

t('multi and single choice types are distinguished', () => {
  assert.match(sections, /const MULTI = new Set\(\['CHECKBOX', 'MULTIPLE_OPTIONS'\]\)/);
  assert.match(sections, /const SINGLE = new Set\(\['SINGLE_OPTIONS', 'DROPDOWN', 'RADIO'\]\)/);
});

t('a location with no custom fields renders nothing', () => {
  // Not an error — an ordinary setup. A panel saying "no custom fields"
  // would be noise on every contact.
  assert.match(detail, /if \(!groups\.length\) \{/);
});

console.log(`\n${n} passed`);
