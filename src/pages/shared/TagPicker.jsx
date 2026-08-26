import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  const [draft, setDraft] = useState('')
  const [catalogue, setCatalogue] = useState([])
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
  useEffect(() => {
    let alive = true
    contactsAPI.tagCatalogue()
      .then((r) => { if (alive) setCatalogue((r.tags || []).map((t) => t.name)) })
      .catch(() => {})   // autocomplete is a convenience, not a requirement
    return () => { alive = false }
  }, [])

  const normalised = normaliseTag(draft)

  const suggestions = useMemo(() => {
    if (!normalised) return []
    const have = new Set(current.map(normaliseTag))
    return catalogue
      .filter((name) => {
        const n = normaliseTag(name)
        return n && n.includes(normalised) && !have.has(n)
      })
      .slice(0, 8)
  }, [catalogue, normalised, current])

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
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        background: 'rgba(23, 33, 46, 0.45)'
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tags"
        style={{
          width: 'min(520px, 100%)',
          borderRadius: 'var(--radius-md)',
          background: '#fff', boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden'
        }}
      >
        <header
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

        <div style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
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
                }}
                placeholder="Type a tag, then press Enter"
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

              {suggestions.length > 0 && (
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    zIndex: 2,
                    maxHeight: 200, overflowY: 'auto',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-md)',
                    background: '#fff', boxShadow: 'var(--shadow-raised)',
                    padding: 4
                  }}
                >
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
          <span className="ms" style={{ fontSize: 13 }}>
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
