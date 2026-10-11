// The Co-Pilot sidebar shell, against the client's October 2026 design.
//
// Run: node --test src/pages/shared/__tests__/copilotSidebar.test.mjs
//
// One component serves two callers: the Deal hub's Deal AI panel and the
// portfolio Co-Pilot tab. They differ in what they can actually do, and the
// sidebar has to stop offering what the caller cannot honour.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bar = readFileSync(new URL('../CopilotSidebar.jsx', import.meta.url), 'utf8');
const askDeal = readFileSync(new URL('../../dealhub/AskDeal.jsx', import.meta.url), 'utf8');
const copilot = readFileSync(new URL('../../tabs/CopilotTab.jsx', import.meta.url), 'utf8');

test('the nav icons are the ones the design shows', () => {
  // auto_stories and grid_view read as a magazine and a plain grid — close
  // enough to be wrong rather than obviously different.
  assert.match(bar, /icon: 'menu_book',\s+label: 'Templates'/);
  assert.match(bar, /icon: 'dashboard_customize', label: 'Customize'/);
  assert.match(bar, /icon="edit_note" label="New chat"/);
});

test('RECENTS is a section divider, not another nav row', () => {
  // Uppercase and small, so it reads as a heading over the chat titles rather
  // than as a fifth item under Customize.
  assert.match(bar, /textTransform: 'uppercase'/);
  assert.match(bar, /const RECENTS_LABEL = \{/);
});

test('the chevron only appears where it does something', () => {
  // Deal hub passes a no-op toggle, so its chevron was a control that looked
  // interactive and did nothing — worse than the plain label the design
  // shows. The portfolio tab wires a real toggle and keeps it.
  assert.match(bar, /recentsCollapsible = true,/);
  assert.match(bar, /\{recentsCollapsible \? \(/);
  assert.match(askDeal, /recentsCollapsible=\{false\}/);
  assert.doesNotMatch(copilot, /recentsCollapsible/,
    'the Co-Pilot tab must keep its working chevron (default true)');
});

test('collapsibility is declared, not sniffed from the handler', () => {
  // Reading a function's source to guess whether it is a no-op works in dev
  // and silently flips under minification.
  assert.doesNotMatch(bar, /onToggleRecentsCollapsed\.toString\(\)/);
});
