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

test('rows view is five columns, card view is stacked', () => {
  // Left to right the design reads "done · who and what · when · what to do ·
  // act on it", and each column keeps its own left edge down the whole list.
  // At a 340px card width the same layout left the title ~40px.
  assert.match(
    tab,
    /gridTemplateColumns: 'auto minmax\(240px, 320px\) minmax\(104px, auto\) minmax\(0, 1fr\) auto'/
  );
});

test('THE DUE DATE IS A SIBLING OF THE TITLE COLUMN, NOT A CHILD', () => {
  // THE BUG THIS FILE EXISTS FOR.
  //
  // The due block was written INSIDE the title column's <div> and carried
  // `order: 2`, which does nothing: `order` sorts SIBLINGS, and its siblings
  // were the title and the description. So the row grid received three items
  // where it declared columns for more, and the date rendered under the title
  // with the edit and delete buttons beside it — exactly what the screenshot
  // showed.
  //
  // It is a `const dueBlock` placed as its own row item now. Asserted
  // structurally, because the markup was VALID and rendered without
  // complaint; only the position was wrong, and no assertion on the elements
  // themselves would have caught it.
  const open = tab.indexOf('const dueBlock = (');
  assert.ok(open > 0, 'the due block must be hoisted out of the title column');

  // The title column opens at `minWidth: 0, flex: 1 }` — the due block must
  // be placed BEFORE it, as a sibling, not inside it.
  const col = tab.indexOf('<div style={{ minWidth: 0, flex: 1 }}>');
  assert.ok(col > 0, 'title column not found');
  const rowsDue = tab.indexOf('{dueBlock}');
  assert.ok(rowsDue > 0, 'rows must render the due block as its own item');
  assert.ok(rowsDue < col, 'the rows due column must precede the title column');
});

test('no `order` is used to place the row grid columns', () => {
  // The columns are written in the order they appear. Reaching for `order`
  // here is what hid the nesting bug above: the style said four columns while
  // the DOM held three, and the two disagreed silently.
  const rows = tab.slice(tab.indexOf('gridTemplateColumns: \'auto minmax'));
  assert.doesNotMatch(
    rows.slice(0, 400),
    /order: [0-9]/,
    'the rows grid must not position its columns with order'
  );
});

test('each view has exactly one complete toggle', () => {
  // Rows show a bare circle in their own leading column. The card shows the
  // stacked "MARK / COMPLETE" one in its footer. Two in either view would be
  // two ways to do one thing.
  const ticks = tab.match(/<CompleteToggle/g) || [];
  assert.equal(ticks.length, 2, 'one toggle per view, no more');
  // [\s\S] rather than [^>]: the props hold arrow functions, whose `=>` would
  // end a [^>] match early.
  assert.match(tab, /<CompleteToggle[\s\S]{0,300}?compact\s*\/>/, 'the rows toggle must be compact');
  assert.match(tab, /<CompleteToggle[\s\S]{0,300}?stacked\s*\/>/, 'the card toggle must be stacked');
  // The design's glyph: a tick in a circle, filled once done.
  assert.match(tab, /className=\{done \? 'ms ms-fill' : 'ms'\}/);
});

test('the due date is labelled in BOTH views', () => {
  // A bare date says nothing about what it is — "14 Oct" could be when the
  // task was created — and the calendar icon is what the design leads the
  // line with.
  assert.match(tab, /calendar_today<\/span>/);
  assert.match(tab, />\s*Due date\s*</);
  // The card: "DUE 18 Sep (overdue)".
  assert.match(tab, /label: 'Due', text: `\$\{date\} \(overdue\)`/);
});

// ── The grid card — October 2026 design ──────────────────────────────────────

const card = tab.slice(tab.indexOf('function TaskCard('), tab.indexOf('function cardDue('));

test('the grid renders TaskCard, not the row markup', () => {
  assert.ok(card.length > 0, 'TaskCard not found');
  assert.match(tab, /if \(view === 'grid'\) \{\s*\n\s*return \(\s*\n\s*<TaskCard/);
});

test('a missing deal is called out in the HEADER', () => {
  // The design draws "No DEAL" beside the title; the deal row only appears
  // when there IS a deal.
  const header = card.indexOf('HEADER');
  const body = card.indexOf('BODY');
  const pill = card.indexOf('<DealPill name="No deal" empty />');
  assert.ok(header > 0 && pill > header && pill < body, 'No DEAL pill must sit in the header');
  assert.match(card, /\{!t\.deal && \(/);
  assert.match(card, /if \(t\.deal\) \{/);
});

test('every linked record on the card can be opened', () => {
  // View CONTACT / DEAL / BUSINESS each route somewhere — a pill that looks
  // like a button and does nothing is worse than no pill.
  assert.match(card, /onOpenContact \? \(\) => onOpenContact\(contact\.id\)/);
  assert.match(card, /onOpenDeal \? \(\) => onOpenDeal\(t\.deal\.id\)/);
  assert.match(card, /onOpenBusiness \? \(\) => onOpenBusiness\(t\.business\.id\)/);
});

test('the card footer sits BELOW the linked records and carries the actions', () => {
  const links = card.indexOf('LINKED RECORDS');
  const footer = card.indexOf('FOOTER');
  assert.ok(links > 0 && footer > links, 'footer must close the card, under the records');
  const foot = card.slice(footer);
  for (const bit of ['<CompleteToggle', 'icon="edit"', 'icon="close"']) {
    assert.ok(foot.includes(bit), `${bit} must be in the footer`);
  }
  // Nothing absolutely positioned at the top-right any more.
  assert.doesNotMatch(tab, /position: 'absolute', top: 12, right: 12/);
});
