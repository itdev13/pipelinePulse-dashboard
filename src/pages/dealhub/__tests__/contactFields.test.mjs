// The primary contact's details on the Deal hub card.
//
// It used to render four anonymous icon rows — email, phone, a PRE-JOINED
// address, timezone. Two problems with that:
//
//   1. Only an icon said which was which, so a rep hunting for a postcode had
//      to read "14 Priory Lane, Harpenden AL5 2FE" and pick it out.
//   2. The address arrived from the server already flattened into one string,
//      and a flattened string cannot be taken apart again — there is no way to
//      tell the town from the postcode in "Harpenden AL5 2FE".
//
// So the server now sends the parts separately AND keeps the joined line for
// the compact surfaces that still use it. These tests pin both halves of that
// contract, because the two files are connected only by field names and a
// rename on either side fails silently.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

const ui = read('../DealSection.jsx');
const route = read('../../../../../pipelinePulse/server/src/routes/deals.js');

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

// Every field the card labels, and the person key it reads for it.
const FIELDS = [
  ['First Name', 'firstName'],
  ['Second Name', 'lastName'],
  ['Email Address', 'email'],
  ['Telephone', 'phone'],
  ['Street Address', 'address1'],
  ['Town', 'city'],
  ['Postcode', 'postalCode'],
  ['County', 'state'],
  ['Country', 'country'],
];

function contactLines() {
  const at = ui.indexOf('function ContactLines(');
  assert.notEqual(at, -1, 'ContactLines is gone');
  return ui.slice(at, ui.indexOf('// ── Primitives', at));
}

t('the card labels every contact field', () => {
  const body = contactLines();
  for (const [label, key] of FIELDS) {
    assert.ok(body.includes(`'${label}'`), `"${label}" is not shown on the card`);
    assert.ok(body.includes(`person.${key}`), `"${label}" reads no value (person.${key})`);
  }
});

t('the server actually sends each part', () => {
  // The half that breaks silently: the card can label a field perfectly and
  // render an em dash forever because the route never sent it.
  for (const key of ['address1', 'city', 'state', 'postalCode', 'country']) {
    assert.match(
      route, new RegExp(`\\b${key}:`),
      `deals.js does not return ${key} — the card would always show "—"`
    );
  }
});

t('county is SELECTed, not just mapped', () => {
  // state was absent from the SELECT list while every other address column
  // was there, so County alone would have been permanently blank.
  assert.match(
    route, /c\.address1, c\.city, c\.state, c\.postal_code/,
    'contacts.state is not fetched — County would always be empty'
  );
});

t('the joined address line is kept for other surfaces', () => {
  // Deliberately NOT replaced: the compact surfaces render one line, and
  // removing it would empty them while fixing this card.
  assert.match(route, /address: \[/, 'the pre-joined address line was removed');
});

t('an empty field is shown as a gap, not hidden', () => {
  const body = contactLines();
  assert.match(body, /value \|\| '—'/, 'a missing value is not rendered as a gap');
  // Hiding empties would make a half-filled record look complete — the same
  // reasoning as the "Not set" custom-field chips.
  assert.ok(
    !/\.filter\(\(\[, v\]\) => v\)/.test(body),
    'empty fields are filtered out — a missing postcode would be invisible'
  );
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  NOT OK  ${name}\n    ${err.message}`); }
}
console.log(failed ? `\n${failed} failed` : `\n${tests.length} passed`);
process.exit(failed ? 1 : 0);
