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

test('rows view is four columns, card view is stacked', () => {
  // Left to right the design reads "who and what · when · what to do", and
  // each column keeps its own left edge down the whole list. At a 340px card
  // width the same layout left the title ~40px.
  // FOUR columns: records · due · title+body · actions. The actions used to
  // live inside the records block, so they stacked under it in column one
  // instead of sitting at the row's right edge.
  assert.match(tab, /gridTemplateColumns: 'minmax\(260px, 340px\) minmax\(110px, auto\) minmax\(0, 1fr\) auto'/);
  for (const n of [1, 2, 3, 4]) {
    assert.match(tab, new RegExp(`order: ${n},`), `column ${n} has no explicit order`);
  }
});

test('the complete toggle is not rendered twice in rows', () => {
  // Rows lead with a labelled "Mark complete" button; a second tick in the
  // actions column would be two ways to do one thing.
  assert.match(tab, /\{view === 'grid' && \(\s*\n\s*<CompleteToggle/);
});

test('the due date is labelled in BOTH views', () => {
  // A bare date says nothing about what it is — "14 Oct" could be when the
  // task was created — and the calendar icon is what the design leads the
  // line with.
  assert.match(tab, /calendar_today<\/span>/);
  assert.match(tab, />\s*Due date\s*</);
  assert.doesNotMatch(tab, /view !== 'grid' && \(\s*\n\s*<span style=\{\{\s*\n\s*display: 'flex', alignItems: 'center', gap: 5,/);
});

test('the card has a footer: due date left, actions right', () => {
  // The actions were absolutely positioned at the top-right, level with the
  // title — where they went to escape trailing a chip row whose height
  // changed per card. The linked records are fixed-height rows now, so the
  // card has a stable footer and the design puts them in it.
  assert.doesNotMatch(tab, /position: 'absolute', top: 12, right: 12/);
  assert.match(tab, /order: 3, width: '100%'/);
  assert.match(tab, /order: 4,/);
  assert.match(tab, /view === 'grid' \? \{ marginLeft: 'auto' \} : \{ alignSelf: 'center' \}/);
  assert.match(tab, /borderTop: '1px solid var\(--border-default\)',\s*\n\s*justifyContent: 'space-between'/);
});
