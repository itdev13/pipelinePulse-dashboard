// Associating a contact with a company, from EITHER side.
//
// Reported: "There is no way to associate a contact to a company. On either
// the company page or on the contact page."
//
// The data model was already right — contacts.business_id is the link
// (migration 056), the Businesses page lists its contacts by it, and a deal
// reaches a business only through it. Nothing in the app could SET it:
//
//   * The contact record's "Business" box is GHL's companyName — free text,
//     a label with no record behind it.
//   * The contact API never even returned business_id, so the UI could not
//     have shown the link let alone changed it.
//   * The company page listed contacts read-only.
//
// So a contact could show a company name while the business record said
// "No contacts linked", and neither page could reconcile them.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const picker   = read('../BusinessPickerModal.jsx')
const contact  = read('../../contacts/ContactDetail.jsx')
const business = read('../../tabs/BusinessesTab.jsx')
const section  = read('../../dealhub/DealSection.jsx')

test('one shared picker serves every surface', () => {
  // Three places now make this link. Three pickers would be three sets of
  // rules about what "linking" means.
  assert.match(picker, /export default function BusinessPickerModal/)
  assert.match(contact, /import BusinessPickerModal from '\.\.\/shared\/BusinessPickerModal'/)
  assert.match(section, /import BusinessPickerModal from '\.\.\/shared\/BusinessPickerModal'/)
  // The deal card's private copy is gone, not merely unused.
  assert.ok(!/function AddBusinessModal/.test(section))
})

test('the contact page can link, change and unlink', () => {
  assert.match(contact, /function BusinessLink\(/)
  assert.match(contact, /Link a business/)
  assert.match(contact, /contactsAPI\.update\(contact\.id, \{ businessId: null \}\)/)
  // RENDERED, not merely defined. An earlier version of this test asserted
  // only that the component existed — deleting the one line that renders it
  // left the page with no way to link a business and the test still passed.
  assert.match(contact, /<BusinessLink contact=\{contact\} onSaved=\{onSaved\} \/>/)
})

test('the link is shown separately from the free-text company name', () => {
  // `business` is companyName, a typed label; `businessId` is the record.
  // Collapsing them would make one silently overwrite the other.
  assert.match(contact, /\['business', 'Business', 'text'\]/)
  assert.match(contact, /Linked business/)
})

test('the company page can link a contact back', () => {
  assert.match(business, /Link a contact/)
  assert.match(business, /contactsAPI\.update\(contactId, \{ businessId \}\)/)
})

test('contacts already linked are not offered again', () => {
  assert.match(business, /exclude=\{contacts\.map\(\(c\) => c\.id\)\}/)
  assert.match(picker, /const alreadyLinked = useMemo\(\(\) => new Set\(excludeIds\), \[excludeIds\]\)/)
})

test('the row comes back from the server, not built at the call site', () => {
  // ContactPicker's onChange emits the ID only — no option object. A row
  // assembled here would be missing the deal count, the role and the initials,
  // and would have to GUESS the avatar accent, which is a server-side hash of
  // the contact id. The whole record is refetched instead.
  assert.match(business, /const reload = useCallback\(\(\) => \{/)
  assert.match(business, /onLinked=\{reload\}/)
  assert.doesNotMatch(business, /await contactsAPI\.get\(contactId\)/)
})

test('a missing deal count never renders as "undefined deals"', () => {
  // The template literal is always truthy, so .filter(Boolean) cannot catch
  // an absent count — it printed "undefined deals" under the contact's name.
  assert.match(business, /Number\.isFinite\(Number\(c\.dealCount\)\)/)
})

test('a failed refetch does not wipe the page', () => {
  // The write succeeded. Clearing `data` on a failed re-read would blank the
  // record the rep is looking at over a link that actually worked.
  assert.match(business, /The write succeeded; the row list is stale/)
})

// ── Unlinking one contact ────────────────────────────────────────────

test('each contact row can be unlinked on its own', () => {
  // businessId: null is a real unlink, and the server treats it as one —
  // it is not the same as omitting the field.
  assert.match(business, /contactsAPI\.update\(contact\.id, \{ businessId: null \}\)/)
})

test('unlinking is confirmed, and says what survives', () => {
  // Next to a person's name "remove" reads like a delete. It deletes nothing:
  // the contact keeps its deals and history.
  assert.match(business, /title="Unlink this contact\?"/)
  assert.match(business, /they just stop /)
})

test('the panel refetches after an unlink as well as a link', () => {
  // The roll-up counts on the panels above move with it; patching the array
  // in place would leave them a link behind.
  assert.match(business, /onUnlinked=\{reload\}/)
})
