// The timeline composer — GHL's Conversations composer under the Deal Hub
// timeline.
//
// Run: node --test src/pages/dealhub/__tests__/messageComposer.test.mjs
//
// Source-level, like the other Deal Hub tests: the component needs a browser
// and the API to run. These pin the rules a rep relies on — which channels are
// offered, who can be sent to, and that Reply opens HERE rather than Co-Pilot.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../MessageComposer.jsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../Timeline.jsx', import.meta.url), 'utf8')
const tab = readFileSync(new URL('../../tabs/DealHubTab.jsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../../../api/deals.js', import.meta.url), 'utf8')

test('it sends through the deal route, not a Co-Pilot action', () => {
  assert.match(api, /sendMessage: \(id, payload\) =>\s*\n\s*apiClient\.post\(`\/api\/deals\/\$\{encodeURIComponent\(id\)\}\/messages`/)
  assert.match(src, /dealsAPI\.sendMessage\(dealId,/)
  assert.doesNotMatch(src, /aiAPI|confirmAction/)
})

test('Email is one channel; each SMS/WhatsApp sender is its own', () => {
  // GHL lists "WhatsApp QR", "SMS Android", "iMessage" as channels in their
  // own right, while Email's senders are a From choice.
  assert.match(src, /key: 'Email', channel: 'Email', providerId: null/)
  assert.match(src, /for \(const p of custom\) \{\s*\n\s*out\.push\(\{ key: `\$\{channel\}:\$\{p\.id\}`, channel, providerId: p\.id, label: p\.name/)
  // Native only when GHL has a native sender, or it is the only option.
  assert.match(src, /if \(nativeRow \|\| custom\.length === 0\)/)
})

test('a custom provider goes out as its channel plus its id', () => {
  assert.match(src, /conversationProviderId: isEmail \? \(from\?\.id \?\? null\) : option\.providerId/)
})

test('who cannot be sent to is said before Send, not after', () => {
  assert.match(src, /channel === 'Email' && !person\.email\) return 'This contact has no email address'/)
  assert.match(src, /channel !== 'Email' && !person\.phone\) return 'This contact has no phone number'/)
  assert.match(src, /person\.dnd\?\.all \|\| person\.dnd\?\.channels\?\.\[DND_KEY\[channel\]\]/)
  assert.match(src, /const canSend = !sending && !uploading && !blocked && !bodyEmpty/)
})

test('an email needs a subject; CC and BCC go as address lists', () => {
  assert.match(src, /\(mode === 'comment' \|\| !isEmail \|\| subject\.trim\(\)\)/)
  assert.match(src, /emailCc: splitAddresses\(cc\)/)
  assert.match(src, /emailBcc: splitAddresses\(bcc\)/)
})

test('a reply is sent into its thread', () => {
  assert.match(src, /replyToMessageId: reply\?\.messageId \|\| undefined/)
  assert.match(src, /setSubject\(base \? `Re: \$\{base\}` : ''\)/)
})

test('an internal comment is a deal-linked note, never a send', () => {
  // GHL has no API for its own internal comments.
  const comment = src.slice(src.indexOf("if (mode === 'comment') {"), src.indexOf('} else {', src.indexOf("if (mode === 'comment') {")))
  assert.match(comment, /notesAPI\.create\(\{/)
  assert.match(comment, /opportunityId: dealId/)
  assert.doesNotMatch(comment, /sendMessage/)
})

test('the signature is added once', () => {
  assert.match(src, /isEmail && signature && !bodyHtml\.includes\(signature\)/)
})

test('Reply on a timeline email opens the composer, not Co-Pilot', () => {
  const reply = tab.slice(tab.indexOf('onReplyEmail={(m) => {'), tab.indexOf('footer={'))
  assert.match(reply, /setReplyTarget\(\{/)
  assert.doesNotMatch(reply, /setAskSeed/)
  // To is whoever the email was with.
  assert.match(reply, /m\.direction === 'inbound' \? m\.senderId : \(m\.toIds \|\| \[\]\)\[0\]/)
})

test('the composer sits inside the timeline card, after the empty state', () => {
  assert.match(timeline, /footer = null,/)
  const at = timeline.indexOf('{footer}')
  assert.ok(at > timeline.indexOf('rows.map((m, i) =>'), 'footer must follow the rows')
  assert.ok(at < timeline.indexOf('{viewing && ('), 'footer must sit inside the section')
})

test('channels wear GHL\'s icons and colours', () => {
  assert.match(src, /if \(channel === 'WhatsApp'\) return 'whatsapp'/)
  // iMessage is filed under SMS by GHL, so it is told apart by name.
  assert.match(src, /if \(\/imessage\/i\.test\(label\)\) return 'imessage'/)
  assert.match(src, /<svg className="pp-composer-ico pp-composer-ico-whatsapp"/)
  const css = readFileSync(new URL('../composer.css', import.meta.url), 'utf8')
  assert.match(css, /\.pp-composer-ico-whatsapp \{ color: #25d366; \}/)
  assert.match(css, /\.pp-composer-ico-sms \{ color: #e8a317; \}/)
})

test('attachments upload on pick and go out as urls', () => {
  assert.match(api, /uploadMessageAttachments: \(id, contactId, files\) =>/)
  assert.match(src, /dealsAPI\.uploadMessageAttachments\(dealId, person\.id, list\)/)
  assert.match(src, /attachments: ready\.map\(\(f\) => f\.url\)/)
  // Send waits for an upload in flight; a photo alone is a valid SMS.
  assert.match(src, /const canSend = !sending && !uploading/)
  assert.match(src, /: !text\.trim\(\) && ready\.length === 0/)
  // GHL's accepted types, and none on an internal comment.
  assert.match(src, /const ATTACH_ACCEPT = '\.jpg,\.jpeg,\.png,\.mp4,\.mpeg,\.zip,\.rar,\.pdf,\.doc,\.docx,\.txt,\.mp3,\.wav'/)
  assert.match(src, /const attachable = mode === 'message'/)
})

test('its styles are its own file — no shared rule changes', () => {
  assert.match(src, /import '\.\/composer\.css'/)
  const css = readFileSync(new URL('../composer.css', import.meta.url), 'utf8')
  for (const sel of css.match(/^\[data-dealhub\][^{]+/gm)) {
    assert.match(sel, /\.pp-composer/, `selector outside the composer: ${sel.trim()}`)
  }
})
