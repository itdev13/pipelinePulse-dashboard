// What each row in the deal switcher says.
//
// The search matches on the deal name AND the contact's name, email, phone
// and business. But the row only ever showed the deal name, stage and owner —
// so a result found by email appeared with nothing on it explaining why, and
// two deals both default-named after their contact were indistinguishable.
//
// contactLine, mirrored from DealHubTab.
function contactLine(d) {
  const c = d.contact || {};
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  const label = name || c.business || c.email || c.phone || null;
  if (!label) return null;
  if (label.trim().toLowerCase() === String(d.dealTag || '').trim().toLowerCase()) return null;
  if (name && c.email) return `${name} · ${c.email}`;
  return label;
}

import assert from 'node:assert/strict';
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

console.log('what the second line says');

t('the deal from the screenshot shows its contact', () => {
  // Searched "jsm", matched on the contact's email. Nothing on the row
  // explained why it appeared.
  assert.equal(
    contactLine({ dealTag: 'jsmillie', contact: { firstName: 'test', lastName: 'test', email: 'jsmillie13579@gmail.com' } }),
    'test test · jsmillie13579@gmail.com');
});

t('it is SUPPRESSED when it would repeat the deal name', () => {
  // GHL default-names an opportunity after its contact, so most rows would
  // otherwise print the same string twice.
  assert.equal(
    contactLine({ dealTag: 'Alison Smith', contact: { firstName: 'Alison', lastName: 'Smith' } }),
    null);
});

t('case and padding do not defeat the suppression', () => {
  assert.equal(
    contactLine({ dealTag: 'alison smith', contact: { firstName: '  Alison', lastName: 'Smith  ' } }),
    null);
});

t('a nameless contact falls back to business, email, then phone', () => {
  assert.equal(contactLine({ dealTag: 'X', contact: { business: 'Cortec Ltd' } }), 'Cortec Ltd');
  assert.equal(contactLine({ dealTag: 'X', contact: { email: 'a@b.com' } }), 'a@b.com');
  assert.equal(contactLine({ dealTag: 'X', contact: { phone: '+447885909888' } }), '+447885909888');
});

t('a named contact with no email shows just the name', () => {
  assert.equal(contactLine({ dealTag: 'X', contact: { firstName: 'Ed', lastName: 'Rose' } }), 'Ed Rose');
});

t('no contact yields null, not an empty row', () => {
  assert.equal(contactLine({ dealTag: 'Website Lead Form', contact: null }), null);
  assert.equal(contactLine({ dealTag: 'X' }), null);
  assert.equal(contactLine({ dealTag: 'X', contact: {} }), null);
});

t('an untitled deal still shows its contact', () => {
  // dealTag empty: the suppression must not fire on '' === ''.
  assert.equal(contactLine({ dealTag: '', contact: { firstName: 'Ed', lastName: 'Rose' } }), 'Ed Rose');
});

// ── The source still renders it ──────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const hub = readFileSync(join(here, '..', 'DealHubTab.jsx'), 'utf8');

console.log('\nthe row');

t('the deal name leads, in heading weight', () => {
  assert.match(hub, /\{d\.dealTag \|\| 'Untitled deal'\}/,
    'an unnamed deal must not render a blank first line');
  assert.match(hub, /fontWeight: 600, color: 'var\(--text-heading\)'/);
});

t('the contact line is rendered', () => {
  assert.match(hub, /\{contactLine\(d\) && \(/);
  assert.match(hub, /function contactLine\(d\)/);
});

t('stage and owner are still there, quieter', () => {
  assert.match(hub, /\[d\.stage, d\.owner\]\.filter\(Boolean\)\.join\(' · '\)/);
});

console.log(`\n${n} passed`);
