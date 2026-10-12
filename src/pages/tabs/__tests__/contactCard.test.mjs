// The Contacts tab — the client's October 2026 design: a blue section header,
// a labelled toolbar band, and a card whose fields read as a ruled table with
// the contact's deals and business beneath.
//
// Run: node --test src/pages/tabs/__tests__/contactCard.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tab = readFileSync(new URL('../ContactsTab.jsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../DealHubShell.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../styles/dealhub-tokens.css', import.meta.url), 'utf8');

const card = tab.slice(tab.indexOf('function ContactCard('), tab.indexOf('const smallBtn'));

test('the header is a solid blue band, its own token', () => {
  assert.match(css, /--contacts-header: #1f69bd;/);
  assert.match(tab, /background: 'var\(--contacts-header\)'/);
});

test('the toolbar labels Search, Owner, Type, Tag and Saved view', () => {
  for (const label of ['Search', 'Owner', 'Type', 'Tag', 'Saved view']) {
    assert.match(tab, new RegExp(`<LabelledControl label="${label}">`), `${label} is not labelled`);
  }
  // The dropdown lists saved views, so the toolbar's own tabs are off.
  assert.match(tab, /showViewTabs=\{false\}/);
});

test('Show on cards offers Deals only until tasks and notes come per contact', () => {
  const opts = tab.slice(tab.indexOf('const SHOW_ON_CARDS'), tab.indexOf('function ShowOnCards'));
  assert.match(opts, /key: 'deals'/);
  assert.doesNotMatch(opts, /key: '(tasks|notes)'/);
  assert.match(card, /if \(showOn\.deals !== false\)/);
});

test('no Add contact button and no selection checkboxes yet', () => {
  // No create-contact endpoint and no bulk action exist — a control that
  // does nothing is worse than no control.
  assert.doesNotMatch(tab, /Add contact/);
  assert.doesNotMatch(card, /type="checkbox"/);
});

test('the card leads with the name and an Open CONTACT pill', () => {
  assert.match(card, /<OpenContactPill onClick=\{onOpen\} \/>/);
});

test('every field row is in the ruled table, Type and Tags included', () => {
  const fields = card.slice(card.indexOf('className="pp-cc-fields"'));
  for (const bit of ['label="Name"', 'label="Email"', 'label="Phone"', '<CardBusinessLink',
    'label="Address"', '<TypeRow', '<TagsRow']) {
    assert.ok(fields.includes(bit), `${bit} missing from the field table`);
  }
  assert.match(css, /\.pp-cc-key \{[\s\S]*?border-right: 1px solid var\(--border-default\);/);
});

test('Type keeps its pencil but explains instead of editing', () => {
  // A GHL custom field — the update endpoint rejects it.
  const type = tab.slice(tab.indexOf('function TypeRow('), tab.indexOf('function TagsRow('));
  assert.match(type, /pp-cc-pencil/);
  assert.doesNotMatch(type, /contactsAPI\.update/);
  assert.match(type, /change it there/);
});

test('tags write through the additive endpoints, never the full update', () => {
  const tags = tab.slice(tab.indexOf('function TagsRow('), tab.indexOf('function RowError('));
  assert.match(tags, /contactsAPI\.addTags\(contact\.id, \[tag\]\)/);
  assert.match(tags, /contactsAPI\.removeTags\(contact\.id, \[tag\]\)/);
  assert.doesNotMatch(tags, /contactsAPI\.update/);
});

test('linked deals and the business can be opened', () => {
  assert.match(card, /onOpenDeal \? \(\) => onOpenDeal\(d\.id\)/);
  assert.match(card, /onOpenBusiness \? \(\) => onOpenBusiness\(c\.businessId\)/);
  assert.match(shell, /<ContactsTab[\s\S]{0,120}?onOpenBusiness=\{openBusiness\}/);
  assert.match(card, /Nothing linked yet/);
});
