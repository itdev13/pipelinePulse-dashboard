// Custom-field values fall back to the promoted column.
//
// Run: node --test src/pages/deals/__tests__/promotedFallback.test.mjs
//
// WHY. Five opportunity custom fields are ALSO promoted to their own columns
// (client_type, product_system, product_type, first_contact_method,
// master_initial_enquiry). The deal response therefore carries each value
// TWICE: as a top-level key written from the column, and inside the
// customFields blob.
//
// They normally agree. The blob is empty whenever an upsert rolled back, or
// the deal predates the promotion — and the custom-fields grid read ONLY the
// blob, so the field rendered "Not set" while the value sat in the column the
// deal card above was already showing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../DealEditPanel.jsx', import.meta.url), 'utf8');

test('the blob still wins when it has the value', () => {
  // The blob is what a save writes back, so it must stay first — the fallback
  // is for when it has nothing, not a replacement for it.
  const chain = panel.slice(
    panel.indexOf('value: deal.customFields?.[f.id]'),
    panel.indexOf('?? null')
  );
  assert.ok(
    chain.indexOf('customFields') < chain.indexOf('PROMOTED_FALLBACK'),
    'the promoted column must be the LAST resort'
  );
});

test('the enquiry field reads its promoted column', () => {
  // The reported case: GHL showed "testingss", the grid showed "Not set".
  assert.match(panel, /master_initial_enquiry: \(d\) => d\.initialEnquiry/);
});

test('multi-selects are split back into an array', () => {
  // The server comma-joins these for the card's chips. A multi Select renders
  // a bare string as ONE option, so "Crittall, Smarts" would show as a single
  // invalid choice instead of two.
  assert.match(panel, /const splitMulti = \(v\) =>/);
  assert.match(panel, /product_system: \(d\) => splitMulti\(d\.productSystem\)/);
  assert.match(panel, /client_type: \(d\) => splitMulti\(d\.clientType\)/);
});

test('both spellings of the inconsistent GHL key are covered', () => {
  // The definitions endpoint reports whatever that location has.
  assert.match(panel, /first_contact__method: \(d\) => splitMulti/);
  assert.match(panel, /first_contact_method: \(d\) => splitMulti/);
});

test('single-value fields are NOT split', () => {
  // lead_source_opportunity is TEXT. Splitting it would turn a legitimate
  // "Google Search, Referral" answer into two options it does not have.
  assert.match(panel, /lead_source_opportunity: \(d\) => d\.leadSource/);
});
