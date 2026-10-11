// The task card's linked records — the client's October 2026 design.
//
// Run: node --test src/pages/tabs/__tests__/taskCardLinks.test.mjs
//
// A task names up to three records: the contact it is filed against, the deal
// it belongs to, and the business behind them. These were two bare pills — a
// ContactChip and a DealPill — which said WHO and WHICH DEAL but never what
// kind of record each was, and the business was not shown at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tab = readFileSync(new URL('../TasksTab.jsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../DealHubShell.jsx', import.meta.url), 'utf8');

test('all three records get a row', () => {
  // The business was missing entirely, though the server has returned
  // `business: { id, name }` on every task all along.
  for (const icon of ['person', 'sell', 'business']) {
    assert.match(tab, new RegExp(`icon="${icon}"`), `no row for ${icon}`);
  }
  assert.match(tab, /business: \{ fill: 'var\(--accent-plum\)', label: 'BUSINESS' \}/);
});

test('a missing record is SHOWN, not hidden', () => {
  // An unattached task is a real state worth seeing — the design draws "No
  // DEAL" in red rather than leaving the row blank.
  assert.match(tab, /emptyText="No contact"/);
  assert.match(tab, /emptyText="No business"/);
  assert.match(tab, /\{present \? 'View' : 'No'\}/);
});

test('the deal row uses the SHARED DealPill', () => {
  // Opening a deal has one treatment across every surface (dealPill.test.mjs
  // pins it). A fourth one here would make a rep learn the control twice.
  assert.match(tab, /<DealPill/);
  assert.match(tab, /DealPill[^}]*\} from '[^']*ListChrome'/);
});

test('the business row can actually open something', () => {
  // The handler existed in the shell and was never passed down, so the row
  // would have rendered a button that did nothing.
  assert.match(tab, /onOpenBusiness/);
  assert.match(shell, /onOpenBusiness=\{openBusiness\}/);
});

test('rows view is three columns, card view is stacked', () => {
  // Left to right the design reads "who and what · when · what to do", and
  // each column keeps its own left edge down the whole list. At a 340px card
  // width the same layout left the title ~40px.
  assert.match(tab, /gridTemplateColumns: 'minmax\(260px, 340px\) minmax\(110px, auto\) minmax\(0, 1fr\)'/);
  assert.match(tab, /order: 3/);
  assert.match(tab, /order: 1/);
});
