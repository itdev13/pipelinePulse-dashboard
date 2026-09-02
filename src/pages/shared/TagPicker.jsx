import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../../hooks/useModal'
import { contactsAPI } from '../../api/contacts'

// Add and remove tags on a contact.
//
// The two endpoints behind this are ADDITIVE — they append, or remove only
// what's named. That's what makes this safe to offer at all: the general
// contact-update endpoint replaces the whole tag array, so a partial list
// silently deletes the rest. The server refuses tags on that path for exactly
// this reason (see contactPatch.js).
//
// Two things this UI has to be honest about:
//
//   • DEAL-SCOPED TAGS CANNOT BE EDITED HERE. A tag set on the opportunity
//     record isn't a contact tag, and removing it through the contact endpoint
//     would appear to work and change nothing. Those pills stay read-only, with
//     a tooltip saying why.
//
//   • TAGS ARE LOWERCASED. GHL lowercases and trims every tag it stores, so
//     "Hot Lead" becomes "hot lead". Showing the typed casing and then storing
//     something else would be a small lie, so the input previews what will
//     actually be saved.

// Module-level cache for the tag catalogue.
//
// The list is location-wide and refreshed by a DAILY cron, so re-fetching it
// every time the dialog opens was pure latency for data that had not changed.
// `promise` dedupes concurrent first opens; `tags` serves every open after.
//
// Deliberately NOT persisted (no localStorage): a tag created in GHL should
// appear after a reload, and a session-lifetime cache gets that for free
// without a staleness policy to reason about.
const TAG_CACHE = { tags: null, promise: null }

export default function TagPicker({
  contactId,
  // Contact-scoped tags — editable.
  tags = [],
  // Deal-scoped tags — shown but not editable, since they live on the
  // opportunity rather than the contact.
  readOnlyTags = [],
  // Called with the full new tag list after a successful change.
  onChange,
  onClose
}) {
  const [current, setCurrent] = useState(() => [...tags])

  const modalRef = useModal()
  const [draft, setDraft] = useState('')
  const [catalogue, setCatalogue] = useState([])
  // Starts true: the fetch fires on mount, so the very first render is already
  // loading. Defaulting to false made the list render as "empty" for the
  // length of the request, which is exactly why it looked like nothing was
  // happening.
  const [catalogueLoading, setCatalogueLoading] = useState(true)
  const [catalogueError, setCatalogueError] = useState(false)
  const [busy, setBusy] = useState(null)      // the tag mid-flight
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // The location's tag catalogue, so a rep picks "hot-lead" rather than
  // inventing "hot lead" beside it. Read from our own synced table, not GHL
  // per keystroke.
  //
  // CACHED ACROSS MOUNTS. This ran on every dialog open, so opening the tag
  // picker on a second contact re-fetched a list that changes about once a day
  // (it is refreshed by the daily tagsSync). The cache makes every open after
  // the first instant.
  useEffect(() => {
    if (TAG_CACHE.tags) {
      setCatalogue(TAG_CACHE.tags)
      setCatalogueLoading(false)
      return
    }
    let alive = true
    setCatalogueLoading(true)
    // A single in-flight promise shared by every mount, so two pickers opened
    // in quick succession do not both request it.
    TAG_CACHE.promise = TAG_CACHE.promise || contactsAPI.tagCatalogue()
    TAG_CACHE.promise
      .then((r) => {
        const names = (r.tags || []).map((t) => t.name)
        TAG_CACHE.tags = names
        if (alive) setCatalogue(names)
      })
      .catch(() => {
        // Autocomplete is a convenience, not a requirement — typing a new tag
        // still works. Clear the promise so a later open can retry rather
        // than caching the failure forever.
        TAG_CACHE.promise = null
        if (alive) setCatalogueError(true)
      })
      .finally(() => { if (alive) setCatalogueLoading(false) })
    return () => { alive = false }
  }, [])

  const normalised = normaliseTag(draft)

  // Whether the input has focus, so the catalogue can be browsed rather than
  // guessed at.
  const [focused, setFocused] = useState(false)

  // Where to draw the suggestion list, in VIEWPORT coordinates.
  //
  // It used to be position:absolute inside the field. That worked until the
  // modal body became a scroll container (overflow-y:auto, so a long form
  // cannot push the footer off screen) — an absolutely positioned child is
  // clipped by the nearest scrolling ancestor, so the list was cut off at the
  // body's edge and scrolled away with the content instead of floating over
  // the dialog.
  //
  // position:fixed escapes the clip, but fixed coordinates do not follow the
  // element, so they have to be measured and refreshed while it is open.
  const [anchor, setAnchor] = useState(null)

  const suggestions = useMemo(() => {
    const have = new Set(current.map(normaliseTag))
    const available = catalogue.filter((name) => {
      const n = normaliseTag(name)
      return n && !have.has(n)
    })
    // EMPTY INPUT SHOWS THE WHOLE CATALOGUE.
    //
    // This used to `return []` when nothing had been typed, so a rep had to
    // already know a tag existed before the picker would reveal it — the
    // autocomplete could confirm a guess but never answer "what tags do we
    // have?". Existing tags are the thing you want to pick from; inventing a
    // new one is the exception.
    //
    // Cap is higher when browsing than when filtering: a list of everything is
    // worth scrolling, whereas 8 matches for a typed prefix is already plenty.
    if (!normalised) return available.slice(0, 50)
    return available.filter((name) => normaliseTag(name).includes(normalised)).slice(0, 8)
  }, [catalogue, normalised, current])

  // Measure while the list is open, and keep measuring: the modal body scrolls
  // and the window can resize, and a fixed element does not move with either.
  useEffect(() => {
    if (!focused) { setAnchor(null); return }
    const measure = () => {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // Flip above the input when there is not enough room below it — near the
      // bottom of a short viewport a downward list would be cut off by the
      // window, which is the same failure in a different container.
      const below = window.innerHeight - r.bottom
      const flip = below < 240 && r.top > below
      setAnchor({
        left: r.left,
        width: r.width,
        top: flip ? undefined : r.bottom + 5,
        bottom: flip ? window.innerHeight - r.top + 5 : undefined,
        // Never taller than the room available, so it scrolls internally
        // rather than off screen.
        maxHeight: Math.min(220, Math.max(120, flip ? r.top - 12 : below - 12))
      })
    }
    measure()
    // capture:true — the scroll happens on .pp-modal-body, an ancestor, and a
    // non-capturing window listener never sees it.
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
    // catalogueLoading is a dependency because the popover's height changes
    // when the skeleton rows are replaced by real ones — without it the flip
    // decision and maxHeight would be based on the loading state's size.
  }, [focused, suggestions.length, catalogueLoading])

  // Already on the contact? Then Add would be a no-op, so say so rather than
  // firing a request that changes nothing.
  const alreadyThere = !!normalised && current.some((t) => normaliseTag(t) === normalised)

  const add = async (raw) => {
    const tag = normaliseTag(raw)
    if (!tag || busy) return
    if (current.some((t) => normaliseTag(t) === tag)) {
      setDraft('')
      return
    }
    setBusy(tag)
    setError(null)
    try {
      const res = await contactsAPI.addTags(contactId, [tag])
      // Trust the server's post-change list over our own arithmetic — it
      // reflects what GHL actually stored.
      const next = res.tags || [...current, tag]
      setCurrent(next)
      setDraft('')
      onChange?.(next)
    } catch (err) {
      setError(err.message || 'Could not add that tag — try again')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (raw) => {
    const tag = normaliseTag(raw)
    if (!tag || busy) return
    setBusy(tag)
    setError(null)
    try {
      const res = await contactsAPI.removeTags(contactId, [tag])
      const next = res.tags || current.filter((t) => normaliseTag(t) !== tag)
      setCurrent(next)
      onChange?.(next)
    } catch (err) {
      setError(err.message || 'Could not remove that tag — try again')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="pp-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div
        // Scroll lock + focus trap, shared by every dialog. Escape stays
        // with each component: theirs is guarded against mid-save.
        ref={modalRef}
        className="pp-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tags"
        // Narrower than the default: this dialog is one input and a row of
        // pills, and 580px left it looking half-empty.
        style={{ width: 'min(520px, 100%)' }}
      >
        <header
          className="pp-modal-head"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '13px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--tint-pine)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-pine)' }}>
            label
          </span>
          <h2
            style={{
              flex: 1, margin: 0,
              fontSize: 'var(--text-xl)', fontWeight: 600,
              color: 'var(--accent-pine-text)'
            }}
          >
            Tags
          </h2>
          <button
            onClick={onClose}
            disabled={!!busy}
            title="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.7)',
              cursor: busy ? 'default' : 'pointer',
              color: 'var(--text-muted)'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>close</span>
          </button>
        </header>

        <div
          className="pp-modal-body"
          style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}
        >
          {/* Each change saves on its own — there's no Save button, because
              there's no batch: add and remove are separate calls and either can
              fail independently. Showing one Save would imply otherwise. */}
          <div>
            <Label>On this contact</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {current.length === 0 && (
                <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
                  No tags yet.
                </span>
              )}
              {current.map((t) => (
                <Pill
                  key={t}
                  name={t}
                  busy={busy === normaliseTag(t)}
                  onRemove={() => remove(t)}
                />
              ))}
            </div>
          </div>

          {readOnlyTags.length > 0 && (
            <div>
              <Label>On the deal</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {readOnlyTags.map((t) => (
                  <Pill key={t} name={t} locked />
                ))}
              </div>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
                }}
              >
                These are set on the opportunity, not the contact, so they are
                changed on the deal record itself.
              </p>
            </div>
          )}

          <div>
            <Label>Add a tag</Label>
            <div style={{ position: 'relative', marginTop: 6 }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!alreadyThere) add(draft)
                  }
                  // Escape closes the list, not the dialog. Without this the
                  // only way to dismiss an open catalogue was to click away,
                  // and the dialog's own Escape handler would close the whole
                  // thing instead.
                  if (e.key === 'Escape' && focused && suggestions.length > 0) {
                    e.stopPropagation()
                    setFocused(false)
                  }
                }}
                onFocus={() => setFocused(true)}
                // Delayed: the suggestion buttons use onMouseDown, but a plain
                // blur would still tear the list down before a click on a
                // scrollbar or padding could land.
                onBlur={() => window.setTimeout(() => setFocused(false), 120)}
                placeholder="Pick an existing tag or type a new one"
                maxLength={100}
                disabled={!!busy}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  height: 36, padding: '0 11px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                  color: 'var(--text-body)'
                }}
              />

              {/* Open while the input has focus, not only once something is
                  typed — otherwise the catalogue is undiscoverable. */}
              {/* Open while loading as well as when there are options.
                  Gating on suggestions.length alone meant NOTHING rendered
                  until the request came back — the dialog looked inert and the
                  list appeared to take seconds to "open" when it had simply
                  not been drawn yet. */}
              {focused && anchor && (catalogueLoading || catalogueError || suggestions.length > 0) && (
                <div
                  // .pp-pop gives it the same material as the antd menus and
                  // the dialogs — layered shadow, radius-lg, the shared
                  // entrance.
                  className="pp-pop"
                  style={{
                    // FIXED, not absolute, and positioned from the measured
                    // input rect — see the `anchor` effect above. Absolute
                    // meant the modal body's overflow-y:auto clipped this and
                    // scrolled it away with the content.
                    position: 'fixed',
                    left: anchor.left,
                    width: anchor.width,
                    top: anchor.top,
                    bottom: anchor.bottom,
                    // Above .pp-modal (60) and .pp-backdrop, below a confirm
                    // dialog (70) — a popover must not cover a confirmation.
                    zIndex: 65,
                    maxHeight: anchor.maxHeight, overflowY: 'auto',
                    background: '#fff',
                    padding: 5
                  }}
                >
                  {/* Says which list this is. Browsing the catalogue and
                      filtering it look identical otherwise, and "no matches"
                      after typing means something different from an empty
                      catalogue. */}
                  <p
                    style={{
                      margin: '2px 4px 5px',
                      fontSize: 'var(--text-xs)', fontWeight: 600,
                      letterSpacing: 'var(--tracking-label)',
                      textTransform: 'uppercase', color: 'var(--text-faint)'
                    }}
                  >
                    {catalogueLoading
                      ? 'Loading your tags'
                      : normalised ? 'Matching tags' : 'Tags in your CRM'}
                  </p>

                  {/* Skeleton rows rather than a spinner: the list's shape is
                      known, so placeholders in that shape mean the real rows
                      land without the popover resizing. A centred spinner
                      would collapse the box and then jump it open. */}
                  {catalogueLoading && [0, 1, 2, 3].map((i) => (
                    <div key={i} style={{ padding: '7px 9px' }}>
                      <span
                        className="pp-sk"
                        style={{
                          display: 'block', height: 13, borderRadius: 3,
                          // Varied widths so it reads as text, not as bars.
                          width: ['62%', '78%', '48%', '70%'][i]
                        }}
                      />
                    </div>
                  ))}

                  {catalogueError && !catalogueLoading && (
                    <p
                      style={{
                        margin: 0, padding: '8px 9px',
                        fontSize: 'var(--text-md)', color: 'var(--text-muted)'
                      }}
                    >
                      Couldn’t load your tags — type a new one instead.
                    </p>
                  )}
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      onMouseDown={(e) => { e.preventDefault(); add(name) }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '7px 9px',
                        border: 'none', borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                        color: 'var(--text-body)', cursor: 'pointer'
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* What will actually be stored. GHL lowercases and trims, so a rep
                typing "Hot Lead" should see "hot lead" before they commit —
                otherwise the pill they get back looks like a bug. */}
            {normalised && normalised !== draft && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
                }}
              >
                Saved as <strong>{normalised}</strong> — tags are always lowercase.
              </p>
            )}
            {alreadyThere && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 'var(--text-sm)', color: 'var(--accent-gold-text)'
                }}
              >
                Already on this contact.
              </p>
            )}
          </div>

          {error && (
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                padding: '9px 11px',
                border: '1px solid var(--status-stuck)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--tint-rose)',
                fontSize: 'var(--text-md)', color: 'var(--status-stuck-text)'
              }}
            >
              <span className="ms" style={{ fontSize: 16, flex: 'none', marginTop: 1 }}>error</span>
              {error}
            </div>
          )}
        </div>

        <footer
          className="pp-modal-foot"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '11px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--gray-25)'
          }}
        >
          <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {busy ? 'Saving…' : 'Each change saves as you make it'}
          </span>
          <button
            onClick={onClose}
            disabled={!!busy}
            style={{
              height: 32, padding: '0 16px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--brand-primary)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1
            }}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}

function Label({ children }) {
  return (
    <span
      style={{
        display: 'block',
        fontSize: 'var(--text-xs)', fontWeight: 600,
        letterSpacing: 'var(--tracking-label)',
        textTransform: 'uppercase', color: 'var(--text-muted)'
      }}
    >
      {children}
    </span>
  )
}

function Pill({ name, onRemove, busy, locked }) {
  return (
    <span
      title={locked ? 'Set on the opportunity — change it on the deal record' : name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 28, padding: locked ? '0 11px' : '0 5px 0 11px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--green-100)',
        background: locked ? 'var(--gray-50)' : 'var(--tint-pine)',
        color: locked ? 'var(--text-muted)' : 'var(--accent-pine-text)',
        fontSize: 'var(--text-md)', fontWeight: 600,
        opacity: busy ? 0.55 : 1
      }}
    >
      {locked && <span className="ms" style={{ fontSize: 13 }}>lock</span>}
      {name}
      {!locked && (
        <button
          onClick={onRemove}
          disabled={busy}
          title={`Remove ${name}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, padding: 0,
            border: 'none', borderRadius: '50%',
            background: 'rgba(255,255,255,0.75)',
            cursor: busy ? 'progress' : 'pointer',
            color: 'var(--accent-pine-text)'
          }}
        >
          <span
            className={busy ? 'ms pp-spin' : 'ms'}
            style={{ fontSize: 13 }}
          >
            {busy ? 'progress_activity' : 'close'}
          </span>
        </button>
      )}
    </span>
  )
}

// Mirrors the server's normaliseTag. Duplicated deliberately: this is the
// PREVIEW of what will be stored, and it has to agree with the server without
// a round trip to find out.
function normaliseTag(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().toLowerCase()
}
