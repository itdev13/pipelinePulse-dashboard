// The Notes tab — the client's October 2026 design: a brown section header,
// a labelled toolbar band, and a card per note.
//
// Run: node --test src/pages/tabs/__tests__/noteCard.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tab = readFileSync(new URL('../NotesTab.jsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../DealHubShell.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../styles/dealhub-tokens.css', import.meta.url), 'utf8');

const card = tab.slice(tab.indexOf('function NoteCard('), tab.indexOf('function NoteRow('));

test('the header is a solid brown band, its own token', () => {
  assert.match(css, /--notes-header: #8b5a2b;/);
  assert.match(tab, /background: 'var\(--notes-header\)'/);
});

test('the toolbar labels its controls and keeps the Author filter', () => {
  assert.match(tab, /<LabelledControl label="Author">/);
  assert.match(tab, /<LabelledControl label="Sort">/);
});

test('the grid renders NoteCard and rows render NoteRow', () => {
  assert.ok(card.length > 0, 'NoteCard not found');
  assert.match(tab, /view === 'grid'\s*\n\s*\? <NoteCard key=\{n\.id\} \{\.\.\.shared\} \/>\s*\n\s*: <NoteRow/);
});

test('the deal pill sits in the card HEADER, View or No', () => {
  const header = card.indexOf('HEADER');
  const body = card.indexOf('BODY');
  const pill = card.indexOf('<DealPill');
  assert.ok(header > 0 && pill > header && pill < body, 'deal pill must sit in the header');
  assert.match(card, /empty=\{!n\.deal\}/);
});

test('linked records use the shared rows and can open a business', () => {
  assert.match(card, /<LinkedRecords\s*\n\s*record=\{n\}/);
  assert.match(card, /onOpenBusiness=\{onOpenBusiness\}/);
  // Handed down from the shell — without it View BUSINESS would be inert.
  assert.match(shell, /<NotesTab[\s\S]{0,120}?onOpenBusiness=\{openBusiness\}/);
});

test('the footer closes the card: when · who, then edit and delete', () => {
  const links = card.indexOf('LINKED RECORDS');
  const footer = card.indexOf('FOOTER');
  assert.ok(links > 0 && footer > links, 'footer must sit under the records');
  const foot = card.slice(footer);
  assert.match(foot, /\{noteMeta\(n\)\}/);
  assert.match(foot, /icon="edit"/);
  assert.match(foot, /icon="close"/);
  // "6 hours ago · by Deal Hub Agent" — time first, then the author.
  assert.match(tab, /\[relativeTime\(n\.createdAt\), n\.author && `by \$\{n\.author\}`\]/);
});

test('the note colour still goes through the normaliser', () => {
  // A raw colour in a style attribute is an injection — see noteColour.
  assert.match(card, /const col = noteColourStyle\(n\.color\)/);
  assert.doesNotMatch(tab, /background: n\.color/);
});
