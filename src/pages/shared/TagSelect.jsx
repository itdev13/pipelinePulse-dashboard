import React, { useEffect, useMemo, useState } from 'react'
import { Select } from 'antd'
import { contactsAPI } from '../../api/contacts'
import { TAG_CACHE, normaliseTag } from './tagCatalogue'

// Tags as an INLINE dropdown, not a dialog.
//
// WHY THIS REPLACES THE MODAL. TagPicker opened a full modal for a single
// field. Two problems, one cosmetic and one real:
//
//   • A dialog for one input is disproportionate — it dims the deal, traps
//     focus and needs closing, to edit one row of pills.
//   • Its suggestion list grew taller than the dialog itself, so the popover
//     visibly spilled past the panel that was supposed to contain it. Fixable,
//     but the fix was propping up the wrong shape.
//
// An antd multi-select is the right primitive: it already gives search, pills
// with remove buttons, keyboard navigation and a portaled dropdown that cannot
// be clipped by an ancestor.
//
// EACH CHANGE SAVES ON ITS OWN, as before. Contact tags go through additive
// endpoints — POST /tags and DELETE /tags — so there is no batch to submit and
// no Save button to offer. onChange diffs against what we hold and issues the
// one call that matches.
//
// Deal tags are shown but NOT editable: they live on the opportunity, and the
// contact endpoints cannot touch them. Rendering them as locked pills is
// honest; offering them and silently dropping the change is not.
export default function TagSelect({
  contactId,
  tags = [],
  // Deal-scoped tags — displayed as locked, never sent.
  readOnlyTags = [],
  onChange,
  disabled = false
}) {
  const [current, setCurrent] = useState(() => [...tags])
  const [catalogue, setCatalogue] = useState(TAG_CACHE.tags || [])
  const [loading, setLoading] = useState(!TAG_CACHE.tags)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Re-sync when the parent's list genuinely changes — a refetch, or another
  // control on the same contact.
  //
  // Compared by CONTENT, not identity. `tags` is usually a fresh array on every
  // parent render (deal.contactTags || []), so a plain [tags] dependency fired
  // constantly and would overwrite an in-flight optimistic value with the
  // pre-change list — the pill would appear, then vanish, then come back when
  // the response landed.
  //
  // Skipped entirely while a write is in flight: our own optimistic value is
  // the newer truth until the server answers.
  const tagsKey = tags.map(normaliseTag).sort().join('\u0001')
  useEffect(() => {
    if (busy) return
    setCurrent(tags.map(normaliseTag).filter(Boolean))
    // tagsKey is the content digest of `tags`; depending on it rather than the
    // array avoids the identity churn described above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsKey, busy])

  useEffect(() => {
    if (TAG_CACHE.tags) return
    let alive = true
    TAG_CACHE.promise = TAG_CACHE.promise || contactsAPI.tagCatalogue()
    TAG_CACHE.promise
      .then((r) => {
        const names = (r.tags || []).map((t) => t.name)
        TAG_CACHE.tags = names
        if (alive) setCatalogue(names)
      })
      .catch(() => {
        // Clear so a later mount retries rather than caching the failure.
        TAG_CACHE.promise = null
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const locked = useMemo(
    () => readOnlyTags.map(normaliseTag).filter(Boolean),
    [readOnlyTags]
  )

  const options = useMemo(() => {
    const seen = new Set()
    const out = []
    // Current values first so every selected pill has a matching option —
    // antd renders a bare string for a value with no option, which loses the
    // label formatting.
    for (const t of [...current, ...catalogue]) {
      const n = normaliseTag(t)
      if (!n || seen.has(n)) continue
      seen.add(n)
      out.push({ value: n, label: n })
    }
    // Deal tags are offered as disabled entries so they appear in the list
    // (a rep looking for "why can't I remove this one" finds it) but cannot be
    // picked.
    for (const n of locked) {
      if (seen.has(n)) continue
      seen.add(n)
      out.push({ value: n, label: `${n} (on the deal)`, disabled: true })
    }
    return out
  }, [current, catalogue, locked])

  // One call per change, derived from the diff.
  //
  // antd hands back the whole next array, but the endpoints are additive, so
  // sending that array would be wrong — it would look like "set these" when the
  // API means "add these". Comparing to what we hold gives the single tag that
  // actually changed.
  const apply = async (next) => {
    if (busy) return
    const before = current.map(normaliseTag)
    const after = next.map(normaliseTag).filter(Boolean)

    const added = after.filter((t) => !before.includes(t))
    const removed = before.filter((t) => !after.includes(t))
    if (added.length === 0 && removed.length === 0) return

    // Optimistic: the pill appears immediately and rolls back on failure.
    // Waiting for a round trip made a tag feel like it had not registered.
    setCurrent(after)
    setBusy(true)
    setError(null)
    try {
      const res = added.length
        ? await contactsAPI.addTags(contactId, added)
        : await contactsAPI.removeTags(contactId, removed)
      // Trust the server's post-change list over our arithmetic — it reflects
      // what GHL actually stored, including any normalising it applied.
      //
      // `res.tags.length` guarded, not just `res.tags`: ghlTagWrite returns
      // `data?.tags || []`, so a response where GHL omits the field yields an
      // EMPTY ARRAY — which is truthy, and would have blanked every pill after
      // a successful add. Fall back to our own diff in that case.
      const settled = Array.isArray(res.tags) && res.tags.length ? res.tags : after
      setCurrent(settled)
      onChange?.(settled)
      // A tag the rep just invented belongs in the catalogue, so the next
      // picker offers it instead of inviting a near-duplicate.
      for (const t of added) {
        if (TAG_CACHE.tags && !TAG_CACHE.tags.includes(t)) TAG_CACHE.tags.push(t)
      }
      setCatalogue(TAG_CACHE.tags ? [...TAG_CACHE.tags] : catalogue)
    } catch (err) {
      setCurrent(before)
      setError(err.message || 'Could not save that tag — try again')
      window.setTimeout(() => setError(null), 5000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 240 }}>
      <Select
        mode="tags"
        value={current.map(normaliseTag).filter(Boolean)}
        onChange={apply}
        disabled={disabled || !contactId}
        loading={loading || busy}
        options={options}
        // mode="tags" lets a rep type a value that is not in the list, which is
        // the "or type a new one" half of the old dialog.
        placeholder={loading ? 'Loading tags…' : 'Add a tag'}
        // GHL lowercases and trims, so normalise before it is committed —
        // otherwise the pill that comes back differs from the one typed and
        // looks like a bug.
        tokenSeparators={[',']}
        optionFilterProp="label"
        popupClassName="pp-menu"
        // The popup may exceed the control: tag names like "emailed & waiting
        // for information" do not fit a 240px box.
        popupMatchSelectWidth={false}
        styles={{ popup: { root: { minWidth: 260 } } }}
        notFoundContent={loading ? 'Loading…' : 'Type to create a new tag'}
        style={{ width: '100%' }}
      />
      {error && (
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)' }}>
          {error}
        </span>
      )}
    </span>
  )
}
