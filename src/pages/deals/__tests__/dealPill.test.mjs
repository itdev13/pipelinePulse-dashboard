// Reaching the deal hub from the Deals TABLE.
//
// Every other list — Notes, Tasks, Businesses — opens a deal through the same
// green DealPill, sitting beside the thing it belongs to. The Deals table had
// only a small icon at the far right of the row, past six other columns: the
// one list entirely about deals was the hardest place to open one from, and
// the control did not look like the control that does this everywhere else.
//
// These pin the chip, its wiring, and the two things that silently break it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

const table = read('../DealTable.jsx');
const tab = read('../../tabs/DealsTab.jsx');

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('the table opens the hub through the shared chip', () => {
  assert.match(table, /<DealPill/, 'no DealPill in the deals table');
  // Imported, or it is a ReferenceError at render — the component would have
  // looked fine in review and crashed the whole table in the browser.
  assert.match(
    table, /import \{[^}]*DealPill[^}]*\} from '\.\.\/shared\/ListChrome'/,
    'DealPill is used but never imported'
  );
});

t('the chip is wired to the hub, not the editor', () => {
  const at = table.indexOf('<DealPill');
  const chip = table.slice(at, at + 220);
  assert.match(chip, /onOpenInHub/, 'the chip does not call onOpenInHub');
  assert.ok(!/onOpenDeal\(/.test(chip), 'the chip opens the editor instead of the hub');
});

t('clicking the chip does not also fire the row', () => {
  // The ROW opens the editor on click. Without stopPropagation both fire and
  // the editor wins — the chip would look broken while doing exactly what it
  // was told.
  const at = table.indexOf('<DealPill');
  const cell = table.slice(table.lastIndexOf('<td', at), at);
  assert.match(
    cell, /stopPropagation/,
    'the chip cell does not stop the row handler — the editor would open instead'
  );
});

t('the header has a column for it', () => {
  // A <td> with no matching <th> shifts every header one column left, which
  // misaligns the whole table rather than erroring.
  const headerBlock = table.slice(table.indexOf('<th style={TH}>Deal</th>'), table.indexOf('</tr>', table.indexOf('<th style={TH}>Deal</th>')));
  const ths = (headerBlock.match(/<th/g) || []).length;
  assert.ok(ths >= 3, `expected a spacer <th> between Deal and Contact, found ${ths} headers`);
  assert.match(headerBlock, /aria-label="Open on the deal hub"/, 'the spacer header is unlabelled for screen readers');
});

t('the tab actually passes a handler in', () => {
  // The chip renders inert without this — present, styled, does nothing.
  const at = tab.indexOf('<DealTable');
  assert.notEqual(at, -1, 'DealTable is no longer rendered by the tab');
  const props = tab.slice(at, tab.indexOf('/>', at));
  assert.match(props, /onOpenInHub=/, 'DealTable is rendered without onOpenInHub');
});


t('every surface opens a deal the SAME way', () => {
  // Four treatments existed for one action: a green chip (Notes, Tasks), a
  // ghost "Open deal →" (Businesses), and a solid brand button (Contacts).
  // Each was defensible alone; together they meant a rep learned the control
  // three times. Pinned so a new surface does not quietly invent a fourth.
  const surfaces = [
    ['../../tabs/NotesTab.jsx', 'Notes'],
    ['../../tabs/TasksTab.jsx', 'Tasks'],
    ['../../tabs/BusinessesTab.jsx', 'Businesses'],
    ['../../contacts/ContactDetail.jsx', 'Contacts'],
    ['../DealBoard.jsx', 'Deals board'],
  ];
  for (const [rel, label] of surfaces) {
    const src = read(rel);
    assert.match(src, /<DealPill/, `${label} does not use the shared DealPill`);
    assert.match(
      src, /DealPill[^}]*\} from '[^']*ListChrome'/,
      `${label} uses DealPill without importing it`
    );
  }
});

t('the old one-off deal buttons are gone', () => {
  // The exact strings the two converted surfaces used. If either comes back,
  // the inconsistency is back with it.
  for (const rel of ['../../tabs/BusinessesTab.jsx', '../../contacts/ContactDetail.jsx']) {
    const src = read(rel);
    assert.ok(
      !/>\s*Open deal\s*</.test(src),
      `${rel} still renders its own "Open deal" button alongside the chip`
    );
  }
});


t('the board chip does not break card dragging', () => {
  // A button inside a draggable element starts its OWN drag on mousedown,
  // which cancels the click — so the board card's control has always needed
  // draggable={false} and an onDragStart guard. The square icon button it
  // replaced carried both; a bare chip would have silently broken dragging
  // on every card, which no amount of staring at the deal hub would reveal.
  const board = read('../DealBoard.jsx');
  const at = board.indexOf('<DealPill');
  assert.notEqual(at, -1, 'the board has no DealPill');
  const chip = board.slice(at, board.indexOf('/>', at));
  assert.match(chip, /draggable=\{false\}/, 'the board chip can start its own drag');
  assert.match(chip, /onDragStart=/, 'the board chip has no drag guard');
  assert.match(chip, /stopPropagation/, 'the board chip would also open the editor');

  // And the shared component must actually FORWARD them — passing props a
  // component ignores looks right and does nothing.
  const chrome = read('../../shared/ListChrome.jsx');
  const dealChip = chrome.slice(chrome.indexOf('export function DealPill'), chrome.indexOf('export function Chip'));
  assert.match(dealChip, /draggable/, 'DealPill does not accept draggable');
  assert.match(dealChip, /onDragStart/, 'DealPill does not accept onDragStart');
  const plainChip = chrome.slice(chrome.indexOf('export function Chip'));
  assert.match(plainChip, /draggable=\{draggable\}/, 'Chip never forwards draggable to the element');
});


t('the pill has both halves, in both states', () => {
  const chrome = read('../../shared/ListChrome.jsx');
  const pill = chrome.slice(chrome.indexOf('export function DealPill'), chrome.indexOf('export function Chip'));
  // Green "View | DEAL" when linked, red "No | DEAL" when not: the COLOUR
  // carries the state, so both words and both fills must be present.
  assert.match(pill, /'View'/, 'the pill never says View');
  assert.match(pill, /'No'/, 'the pill has no unlinked state');
  assert.match(pill, />\s*DEAL\s*</, 'the white DEAL capsule is gone');
  assert.match(pill, /--green-500/, 'the linked state is not green');
  assert.match(pill, /--status-stuck/, 'the unlinked state is not red');
});

t('an unlinked pill is not clickable', () => {
  const chrome = read('../../shared/ListChrome.jsx');
  const pill = chrome.slice(chrome.indexOf('export function DealPill'), chrome.indexOf('export function Chip'));
  // "No DEAL" must not look or behave like a link to a deal that is not there.
  assert.match(pill, /&& !empty/, 'an empty pill is still rendered as a live button');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (err) { failed++; console.error(`  NOT OK  ${name}\n    ${err.message}`); }
}
console.log(failed ? `\n${failed} failed` : `\n${tests.length} passed`);
process.exit(failed ? 1 : 0);
