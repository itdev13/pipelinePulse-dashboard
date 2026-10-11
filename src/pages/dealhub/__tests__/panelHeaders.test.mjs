// The Deal hub's solid header bands, and the stage chevron bar.
//
// Run: node --test src/pages/dealhub/__tests__/panelHeaders.test.mjs
//
// The client's October 2026 design turns every Deal hub section header from a
// pale tint with coloured text into a solid band of that accent with white
// text, and adds the pipeline as a row of chevrons across the deal card.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dealhub = join(here, '..');
const read = (f) => readFileSync(join(dealhub, f), 'utf8');
const tokens = readFileSync(join(dealhub, '..', '..', 'styles', 'dealhub-tokens.css'), 'utf8');
const chrome = readFileSync(join(dealhub, '..', 'shared', 'ListChrome.jsx'), 'utf8');

// ---- contrast -------------------------------------------------------------

const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const l1 = lum(a); const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

test('every header band holds its 18px/600 white title at AA-large', () => {
  // 3:1 is the floor for text at 18px/600 and above. Gold is the tight one
  // (3.25:1) — it is the client's colour and it passes, but only just, which
  // is why the smaller subtitle is handled separately below.
  const bands = [...tokens.matchAll(/--panel-head-(\w+): (#[0-9a-f]{6});/g)]
    .filter(([, name]) => !name.endsWith('border'));
  assert.ok(bands.length >= 6, `expected the band tokens, found ${bands.length}`);
  for (const [, name, hex] of bands) {
    const r = ratio(hex, '#ffffff');
    assert.ok(r >= 3, `--panel-head-${name} (${hex}) is ${r.toFixed(2)}:1 against white — below AA-large`);
  }
});

test('the subtitle is not plain 85% white', () => {
  // On clay (4.40:1) and gold (3.25:1) the 13px subtitle misses AA for normal
  // text. The mockup's rgba(255,255,255,0.85) would make it worse, so it
  // renders at 92% instead.
  const head = read('PanelHead.jsx');
  assert.match(head, /rgba\(255,255,255,0\.92\)/);
  assert.doesNotMatch(head, /rgba\(255,\s*255,\s*255,\s*0\.85\)/);
});

// ---- the shared component -------------------------------------------------

test('every Deal hub panel uses the shared header', () => {
  // Seven panels had their own <header> with the same shape. One drifting
  // from the others is how Tasks ended up needing its own token.
  for (const f of ['DealSection.jsx', 'Timeline.jsx', 'DealTasksSection.jsx',
    'QualificationSection.jsx', 'MediaSection.jsx', 'PeopleSection.jsx']) {
    assert.match(read(f), /import PanelHead(,| from)/, `${f} still rolls its own header`);
  }
});

test('no Deal hub panel renders the old pale band', () => {
  // AskDeal's is a MODAL header ("Messages considered"), not a panel band.
  const offenders = readdirSync(dealhub)
    .filter((f) => f.endsWith('.jsx') && f !== 'AskDeal.jsx')
    .filter((f) => /background: 'var\(--panel-tint, var\(--gray-25\)\)'/.test(read(f)));
  assert.deepEqual(offenders, [], `pale headers remain in ${offenders.join(', ')}`);
});

test('the shared Panel keeps the pale band for every OTHER tab', () => {
  // ListChrome's Panel is the chrome for seven tabs. Flipping its default
  // would restyle Businesses, Contacts, Notes and the rest at the same time.
  assert.match(chrome, /solidHeader = false/);
});

test('the loading skeleton wears the same band', () => {
  // A pale skeleton header that turns coloured when data lands reads as the
  // layout shifting, not as the same panel filling in.
  assert.match(read('Skeleton.jsx'), /var\(--panel-head-\$\{accent\}/);
});

// ---- the stage bar --------------------------------------------------------

test('the stage bar renders the server\'s own past/current answer', () => {
  // /deals/:id/stages already resolves the current index against the deal's
  // stage NAME and inserts a virtual entry when the pipeline no longer holds
  // it. Recomputing here would eventually disagree with it.
  const bar = read('StageBar.jsx');
  assert.match(bar, /s\.isCurrent/);
  assert.match(bar, /s\.isPast/);
});

test('a stage with no id is shown but not clickable', () => {
  // The virtual entry has stage_id null — GHL's update endpoint takes
  // pipelineStageId and accepts no name, so there is nothing to send.
  assert.match(read('StageBar.jsx'), /const movable = !!s\.id && !s\.isCurrent/);
});

test('the last chevron has a flat right edge', () => {
  // An arrow on the final stage points out of the card at nothing, which
  // reads as a step that is missing.
  assert.match(read('StageBar.jsx'), /last\s*\n?\s*\? 'polygon\(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%\)'/);
});

test('moving a stage goes through the deal card\'s own saver', () => {
  // onSaveField('pipelineStageId', …) is the same write the stage PICKER
  // makes — two paths would mean two sets of error handling.
  assert.match(read('DealSection.jsx'), /onMove=\{onSaveField \? \(id\) => onSaveField\('pipelineStageId', id\) : undefined\}/);
});

// ---- the bordered field cards --------------------------------------------

test('the customer, deal name and stage facts all use the shared card', () => {
  // Three places wanted the same bordered box with a tinted strip. Three
  // hand-rolled copies would drift on border colour and cell padding.
  const deal = read('DealSection.jsx');
  assert.match(deal, /import \{ FieldCard, FieldGrid, FieldCell \} from '\.\/FieldCard'/);
  assert.match(deal, /<FieldCard[\s\S]*?label="Deal name"/);
  assert.match(deal, /<FieldCard[\s\S]*?label="Customer"/);
});

test('an empty value still renders as a dash', () => {
  // A gap in the customer's record is the thing a rep is meant to notice —
  // hiding it makes a half-filled record look complete.
  assert.match(read('FieldCard.jsx'), /\{empty \? '—' : value\}/);
});

test('the odd field count does not leave a grey hole', () => {
  // Nine fields in a two-column grid leaves half a row. Without a filler the
  // grid's gap colour shows through where a tenth cell would be.
  assert.match(read('DealSection.jsx'), /fields\.length % 2 === 1 && <div style=\{\{ background: '#fff' \}\} \/>/);
});

test('the stale-contact warning survived the move into cells', () => {
  // 14 days of silence on an open deal is a signal the date alone cannot
  // give. It was a Row prop before these became FieldCells.
  assert.match(read('FieldCard.jsx'), /tone === 'danger'/);
  assert.match(read('DealSection.jsx'), /tone=\{stale \? 'danger' : undefined\}/);
});

test('the owner sits IN the facts grid, with its picker intact', () => {
  // The design shows Owner as the first of four facts, not as a row above
  // them. It still cannot BE a FieldCell — that renders a value and a pencil,
  // while this swaps the whole value for a searchable Select — so it renders
  // its own cell with the same shape.
  const deal = read('DealSection.jsx');
  const grid = deal.slice(deal.indexOf('<FieldGrid style={{'), deal.indexOf('</FieldGrid>'));
  assert.match(grid, /<OwnerRow/, 'Owner is not inside the facts grid');
  assert.match(deal, /showSearch/, 'the user picker was lost in the move');
  // The cell shape FieldCell uses, so the five cells line up.
  assert.match(deal, /const cell = \{ minWidth: 0, padding: '8px 12px', background: '#fff' \}/);
});

test('the stage select is a green outline, not a green block', () => {
  // A tinted fill made it the only coloured control in a column of white
  // ones, which read as a selected state rather than as the field that
  // matters most.
  assert.match(tokens, /border: 1\.5px solid var\(--brand-primary\) !important/);
  assert.doesNotMatch(tokens, /background: var\(--tint-pine\) !important/);
});

test('the deal badge does not claim to open anything', () => {
  // The mockup's pill reads "Open DEAL" and sits beside "Edit record", which
  // opens the same editor. A pill that says Open and does nothing is worse
  // than either, so it is a badge.
  const deal = read('DealSection.jsx');
  assert.doesNotMatch(deal, />\s*Open\s*<span[\s\S]{0,400}?DEAL/);
});

test('Qualification is a full-width section, not a rail item', () => {
  // It used to sit in the 320px right column under Notes, where ten long
  // free-text headings each wrapped to four or five lines. Full width it is a
  // row per heading — and it is where the design puts it, between the rail
  // and Co-Pilot.
  const tab = readFileSync(join(dealhub, '..', 'tabs', 'DealHubTab.jsx'), 'utf8');
  const railEnd = tab.indexOf('<DealNotesSection');
  const qual = tab.indexOf('<QualificationSection');
  const copilot = tab.indexOf('<AskDeal');
  assert.ok(qual > railEnd, 'Qualification is still inside the rail');
  assert.ok(qual < copilot, 'Qualification must sit above Co-Pilot');
});
