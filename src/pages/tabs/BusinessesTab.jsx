import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { businessesAPI } from '../../api/businesses'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import {
  Shell, PageHeader, Panel, Row, Chip, SearchInput, StateMessage,
  SkeletonStyles, Bar, LoadMore, formatDate
} from '../shared/ListChrome'
import { Select } from 'antd'
import { countryOptions } from '../../constants/countries'
import BusinessEditor from '../shared/BusinessEditor'
import ConfirmDialog from '../shared/ConfirmDialog'

// Businesses — the roll-up.
//
// A business is the level above a deal. The thing this page does that no other
// page can: show every conversation with every contact at a company in one
// stream, across all its deals. A message that arrived against no deal at all
// shows up here as "Unassigned" — on the deal-by-deal view it is invisible,
// which is exactly how it goes unanswered.
//
// Company Info comes from GHL's ten Business fields. The bracketed merge key
// sits beside each label so it's obvious which GHL field a value came from.

export default function BusinessesTab({
  onOpenDeal, onOpenContact, openBusinessId, onBusinessViewed,
  // See ContactsTab — opening a card inside this tab is navigation the shell
  // never sees, so it has to be reported for Back to work.
  onNavigate
}) {
  const [q, setQ] = useTabState('businesses', 'q', '')
  const [openId, setOpenId] = useTabState('businesses', 'openId', null)

  // A business link elsewhere in the app (the Deal card) hands us an id to
  // open. Mirrors how ContactsTab handles openContactId.
  useEffect(() => {
    if (openBusinessId) setOpenId(openBusinessId)
  }, [openBusinessId, setOpenId])

  const fetchPage = useCallback(
    ({ cursor }) =>
      businessesAPI.list({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(cursor ? { cursor } : {})
      }),
    [q]
  )

  const { items, error, hasMore, loadingMore, loadMore, reload } = usePagedList({
    fetchPage,
    key: 'businesses',
    deps: [q]
  })

  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })
  const [creating, setCreating] = useState(false)

  if (openId) {
    return (
      <BusinessDetail
        businessId={openId}
        onBack={() => {
          setOpenId(null)
          if (onBusinessViewed) onBusinessViewed()
          // Keep the shell's Back in step — see ContactsTab.
          if (onNavigate) onNavigate({ businessId: null })
        }}
        onOpenDeal={onOpenDeal}
        onOpenContact={onOpenContact}
        onDeleted={reload}
      />
    )
  }

  return (
    <Shell>
      <PageHeader
        title="Businesses"
        subtitle="The roll-up — every conversation, deal and contact at a business in one view"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            onClick={() => setCreating(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              flex: 'none',
              height: 34, padding: '0 15px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--brand-primary)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 17 }}>add</span>
            New business
          </button>
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search businesses"
            width={260}
          />
          </div>
        }
      />

      {creating && (
        <BusinessEditor
          onClose={() => setCreating(false)}
          onSaved={() => {
            // The server already wrote our row from the echo (no webhook
            // exists), so the new business is there to be fetched immediately.
            reload()
          }}
        />
      )}

      {error && <StateMessage error={error} />}

      {/* Bespoke skeleton rather than StateMessage's generic rows — these
          cards have a distinct shape and a mismatched placeholder reads as a
          layout glitch when the real rows land. */}
      {items === null && !error && <ListSkeleton />}

      <StateMessage
        empty={items?.length === 0}
        emptyText={
          q
            ? 'No businesses match that search — try a company name, city, email or website.'
            : 'No businesses yet. Businesses sync once a day, so a newly added one appears after the next sync.'
        }
      />

      {items?.length > 0 && (
        <>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {items.map((b) => (
              <BusinessCard
                key={b.id}
                business={b}
                onOpen={() => {
                  setOpenId(b.id)
                  if (onNavigate) onNavigate({ businessId: b.id })
                }}
              />
            ))}
          </div>
          <LoadMore
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            count={items.length}
            noun="business"
          />
        </>
      )}
    </Shell>
  )
}

// ── List card ─────────────────────────────────────────────────────────

function BusinessCard({ business: b, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '14px var(--space-4)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        fontFamily: 'var(--font-sans)',
        transition: 'border-color 0.15s ease-out, box-shadow 0.15s ease-out'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--brand-primary)'
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span
          className="ms"
          style={{ fontSize: 'var(--text-xl)', color: `var(--accent-${b.accent})`, flex: 'none' }}
        >
          domain
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontSize: 'var(--text-lg)', fontWeight: 600,
              color: b.hasName ? 'var(--text-heading)' : 'var(--text-faint)',
              fontStyle: b.hasName ? 'normal' : 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
          >
            {b.name}
          </span>
          {(b.city || b.description) && (
            <span
              style={{
                display: 'block', marginTop: 2,
                fontSize: 'var(--text-base)', color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              {[b.city, b.description].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>

        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 'none' }}>
          <Chip icon="group">
            {b.contactCount} {b.contactCount === 1 ? 'contact' : 'contacts'}
          </Chip>
          <Chip icon="sell" tone="deal">
            {b.dealCount} {b.dealCount === 1 ? 'deal' : 'deals'}
          </Chip>
          <Chip icon="forum">{b.messageCount}</Chip>
        </span>

        <span className="ms" style={{ fontSize: 18, color: 'var(--text-faint)', flex: 'none' }}>
          arrow_forward
        </span>
      </span>
    </button>
  )
}

// ── Detail ────────────────────────────────────────────────────────────

function BusinessDetail({ businessId, onBack, onOpenDeal, onOpenContact, onDeleted }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    if (deleting) return
    setDeleting(true)
    setConfirmError(null)
    try {
      await businessesAPI.remove(businessId)
      setConfirming(false)
      // Back to the list — the record we were looking at is gone, and leaving
      // its detail page on screen would show something that no longer exists.
      if (onDeleted) onDeleted()
      onBack()
    } catch (err) {
      setConfirmError(err.message || 'Could not delete that business')
    } finally {
      setDeleting(false)
    }
  }

  React.useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    businessesAPI.get(businessId)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err.message || 'Could not load the business'))
    return () => { alive = false }
  }, [businessId])

  return (
    <Shell>
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            height: 32, padding: '0 var(--space-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-pill)',
            background: '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-body)'
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>arrow_back</span>
          All businesses
        </button>
      </div>

      {error && <StateMessage error={error} />}
      {!data && !error && <DetailSkeleton />}

      {data && (
        <div style={{ display: 'grid', gap: 18 }}>
          <CompanyInfoPanel
            business={data.business}
            onSaved={(saved) => {
              // Apply the CRM's echo. No webhook exists for businesses, so the
              // server already wrote our row — this refreshes what's on screen
              // without a refetch, and shows any value GHL normalised.
              if (saved) {
                setData((prev) => prev && {
                  ...prev,
                  business: {
                    ...prev.business,
                    ...pickBusinessFields(saved),
                    companyInfo: mergeCompanyInfo(prev.business.companyInfo, saved)
                  }
                })
              }
            }}
            onDelete={() => { setConfirmError(null); setConfirming(true) }}
          />

          <div
            style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))'
            }}
          >
            <DealsPanel deals={data.deals} onOpenDeal={onOpenDeal} />
            <ContactsPanel contacts={data.contacts} onOpenContact={onOpenContact} />
          </div>

          <ConversationsPanel
            businessId={businessId}
            total={data.business.messageCount}
            dealCount={data.business.dealCount}
            onOpenDeal={onOpenDeal}
          />
        </div>
      )}

      {confirming && data && (
        <ConfirmDialog
          title="Delete this business?"
          message={
            (data.business.contactCount || 0) > 0
              ? `${data.business.contactCount} contact${data.business.contactCount === 1 ? '' : 's'} `
                + 'will stay, but stop being linked to a business.'
              : 'This cannot be undone from here.'
          }
          preview={data.business.name}
          confirmLabel="Delete business"
          busy={deleting}
          error={confirmError}
          onConfirm={remove}
          onCancel={() => { setConfirming(false); setConfirmError(null) }}
        />
      )}
    </Shell>
  )
}

// The panel renders from companyInfo, not from the flat fields, so the echo has
// to be folded into THAT array as well. Missing this was the bug where a saved
// value flicked back to its old text on the next render.
//
// Keyed on the descriptor's own `name`, which the server sets to GHL's field
// name — so this needs no mapping table of its own and can't drift from the
// server's COMPANY_INFO_FIELDS.
function mergeCompanyInfo(companyInfo, echoed) {
  if (!Array.isArray(companyInfo)) return companyInfo
  return companyInfo.map((f) => (
    f.name in echoed ? { ...f, value: echoed[f.name] ?? null } : f
  ))
}

// GHL's echoed business uses its own field names. Map only what the detail view
// renders — spreading the raw echo would put `domainname` beside our
// `domainname` and `postalCode` beside `postalCode` inconsistently.
function pickBusinessFields(b) {
  return {
    name: b.name || 'Unnamed business',
    description: b.description || null,
    website: b.website || null,
    email: b.email || null,
    phone: b.phone || null,
    address: b.address || null,
    city: b.city || null,
    state: b.state || null,
    postalCode: b.postalCode || null,
    country: b.country || null,
    domainname: b.domainname || null
  }
}

// Edited IN PLACE, not in a modal.
//
// A modal would hide the page you were reading and duplicate the field list in a
// second component — two places to keep in step with the server's
// COMPANY_INFO_FIELDS. Here the same grid becomes editable: every box is an
// input, and one Save sends only what changed.
//
// Save is per-panel, not per-field. A rep correcting an address touches three
// boxes; three round trips would be three chances to half-fail, and GHL's update
// endpoint takes a partial body in one call.
function CompanyInfoPanel({ business: b, onSaved, onDelete }) {
  // name → edited value. Absent = untouched, which is what makes the diff
  // exact: '' is a deliberate clear and must be distinguishable from "not
  // edited".
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)
  const [saved, setSaved] = useState(false)

  const valueOf = (f) => (f.name in edits ? edits[f.name] : (f.value ?? ''))

  const changes = useMemo(() => {
    const out = {}
    for (const f of b.companyInfo) {
      if (!(f.name in edits)) continue
      const now = String(edits[f.name] ?? '').trim()
      const was = String(f.value ?? '').trim()
      if (now !== was) out[f.name] = now
    }
    return out
  }, [b.companyInfo, edits])

  const dirty = Object.keys(changes).length > 0

  const setField = (name, v) => {
    setEdits((prev) => ({ ...prev, [name]: v }))
    setError(null)
    setErrorField(null)
    setSaved(false)
  }

  const revert = () => {
    setEdits({})
    setError(null)
    setErrorField(null)
  }

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    setErrorField(null)
    try {
      const res = await businessesAPI.update(b.id, changes)
      // Clear the local edits so the panel reads from the refreshed record —
      // otherwise a value GHL normalised (a trimmed domain, an upper-cased
      // country) would keep showing what was typed.
      setEdits({})
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
      if (onSaved) onSaved(res.business || null)
    } catch (err) {
      setError(err.message || 'Could not save that — try again')
      setErrorField(err.data?.field || null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel
      icon="domain"
      title={b.name}
      accent="sky"
      meta="Company Info"
      toolbar={
        <>
          {dirty && (
            <button
              onClick={revert}
              disabled={saving}
              style={{
                height: 30, padding: '0 13px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-pill)',
                background: '#fff', color: 'var(--text-body)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
                cursor: saving ? 'default' : 'pointer'
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            title={dirty ? 'Save to your CRM' : 'Nothing changed yet'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 30, padding: '0 14px',
              border: 'none', borderRadius: 'var(--radius-pill)',
              background: dirty ? 'var(--brand-primary)' : 'var(--gray-100)',
              color: dirty ? '#fff' : 'var(--text-faint)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
              fontWeight: 600,
              cursor: dirty && !saving ? 'pointer' : 'default'
            }}
          >
            {saving && (
              <span className="ms pp-spin" style={{ fontSize: 15 }}>progress_activity</span>
            )}
            {saving
              ? 'Saving'
              : saved
                ? 'Saved'
                : dirty
                  ? `Save ${Object.keys(changes).length}`
                  : 'Save'}
          </button>
          <button
            onClick={onDelete}
            disabled={saving}
            title="Delete this business"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30,
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: '#fff', color: 'var(--status-stuck)',
              cursor: saving ? 'default' : 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>delete</span>
          </button>
        </>
      }
    >
      <p
        style={{
          margin: 0, padding: '11px var(--space-4)',
          borderTop: '1px solid var(--border-default)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--gray-50)',
          fontSize: 'var(--text-base)', lineHeight: 1.55, color: 'var(--text-muted)'
        }}
      >
        Company Info fields — the bracketed key is the field identity. Edit
        writes straight back to your CRM; the nightly sync reconciles anything
        changed there
        {b.lastSyncedAt ? ` (last synced ${formatDate(b.lastSyncedAt)})` : ''}.
      </p>

      <div
        style={{
          display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          padding: 16
        }}
      >
        {b.companyInfo.map((f) => (
          <div key={f.name} style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'flex', alignItems: 'baseline', gap: 6,
                marginBottom: 5, flexWrap: 'wrap'
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase', color: 'var(--text-muted)'
                }}
              >
                {f.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                  color: 'var(--text-faint)'
                }}
              >
                {f.key}
              </span>
            </span>
            <FieldInput
              field={f}
              value={valueOf(f)}
              onChange={(v) => setField(f.name, v)}
              disabled={saving || f.writable === false}
              invalid={errorField === f.name}
              // Dirty marker per field, so with several edited it's clear which.
              dirty={f.name in changes}
            />
            {errorField === f.name && (
              <span
                style={{
                  display: 'block', marginTop: 4,
                  fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)'
                }}
              >
                {error}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* An error with no field of its own — a permission problem, a rename
          rate-limit, a connection failure. */}
      {error && !errorField && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            margin: '0 16px 16px',
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
    </Panel>
  )
}

// Read-only value, styled as a field so the panel still reads as a record.
// An empty field says "Not set" rather than rendering blank — a blank box looks
// like a loading failure.
// Built once, not per render — 247 options rebuilt on every keystroke made the
// dropdown stutter while typing.
const COUNTRY_OPTIONS = countryOptions()

// One editable field. The whole panel is a form now, so this is an input rather
// than the read-only span it used to be.
//
// The LINK affordance is kept: a website, email or phone still opens, via a
// small button beside the box. Making the value itself a link would mean you
// couldn't click into it to edit — and losing "call this number" to gain
// editing would be a bad trade.
function FieldInput({ field: f, value, onChange, disabled, invalid, dirty }) {
  const empty = value == null || value === ''

  const box = {
    width: '100%', boxSizing: 'border-box',
    minHeight: 38,
    padding: '8px 11px',
    border: `1px solid ${
      invalid ? 'var(--status-stuck)'
        : dirty ? 'var(--brand-primary)'
          : 'var(--border-default)'
    }`,
    borderRadius: 'var(--radius-sm)',
    background: disabled ? 'var(--gray-50)' : '#fff',
    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
    lineHeight: 1.45,
    color: 'var(--text-body)',
    outline: 'none',
    overflowWrap: 'anywhere'
  }

  const linkable = !empty && ['url', 'email', 'phone', 'domain'].includes(f.type)
  const href = !linkable ? null
    : f.type === 'email' ? `mailto:${value}`
      : f.type === 'phone' ? `tel:${String(value).replace(/\s+/g, '')}`
        : withProtocol(value)

  const control = f.type === 'multiline' ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={2}
      placeholder="Not set"
      style={{ ...box, resize: 'vertical' }}
    />
  ) : f.type === 'select' || f.type === 'country' ? (
    // antd's Select, not a <datalist>. The datalist this replaces looked like a
    // plain text box, and the list Chrome showed over it was its own autofill —
    // addresses, "Manage addresses…" — rather than anything we rendered.
    //
    // Full 247-country list, common ones grouped at the top. `label` holds
    // "United Kingdom (GB)" so optionFilterProp="label" matches on the name AND
    // the code without a custom filter.
    <Select
      // pp-dirty-select paints the same green border the text inputs get, via
      // antd's selector element — our `box` style cannot reach inside it.
      className={dirty ? 'pp-dirty-select' : undefined}
      value={value || undefined}
      onChange={(v) => onChange(v || '')}
      options={COUNTRY_OPTIONS}
      placeholder="Not set"
      disabled={disabled}
      showSearch
      allowClear
      optionFilterProp="label"
      status={invalid ? 'error' : undefined}
      style={{ width: '100%' }}
      // The panel scrolls; without this the menu detaches from its box.
      getPopupContainer={(node) => node.parentElement || document.body}
      // 247 rows — virtualise (antd does by default) and cap the height so the
      // list doesn't run off the panel.
      listHeight={280}
      notFoundContent="No country matches that"
    />
  ) : (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={f.type === 'domain' ? 'example.com' : 'Not set'}
      style={box}
    />
  )

  if (!href) return control

  return (
    <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
      <span style={{ minWidth: 0, flex: 1 }}>{control}</span>
      <a
        href={href}
        target={f.type === 'email' || f.type === 'phone' ? undefined : '_blank'}
        rel="noreferrer noopener"
        title={
          f.type === 'email' ? `Email ${value}`
            : f.type === 'phone' ? `Call ${value}`
              : `Open ${value}`
        }
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flex: 'none',
          width: 32, height: 38,
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--gray-25)',
          color: 'var(--accent-sky)',
          textDecoration: 'none'
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>
          {f.type === 'email' ? 'mail' : f.type === 'phone' ? 'call' : 'open_in_new'}
        </span>
      </a>
    </span>
  )
}

// A bare domain in an href resolves relative to the current page, which inside
// the GHL iframe is not the site the user wanted.
function withProtocol(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function DealsPanel({ deals, onOpenDeal }) {
  return (
    <Panel
      icon="sell"
      title="Deals"
      accent="pine"
      meta={`${deals.length} ${deals.length === 1 ? 'deal' : 'deals'}`}
    >
      {deals.length === 0 ? (
        <EmptyLine text="No deals at this business yet." />
      ) : (
        deals.map((d, i) => (
          <Row key={d.id} last={i === deals.length - 1} align="center">
            <span className="ms" style={{ fontSize: 16, color: 'var(--accent-pine)', flex: 'none' }}>
              sell
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block', fontSize: 'var(--text-md)', fontWeight: 600,
                  color: 'var(--text-heading)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {d.name}
              </span>
              {d.stage && (
                <span style={{ display: 'block', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
                  {d.stage}
                </span>
              )}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)',
                color: 'var(--text-heading)', flex: 'none',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {formatMoney(d.value)}
            </span>
            <button
              onClick={() => onOpenDeal?.(d.id)}
              style={ghostBtn}
            >
              Open deal
              <span className="ms" style={{ fontSize: 15 }}>arrow_forward</span>
            </button>
          </Row>
        ))
      )}
    </Panel>
  )
}

function ContactsPanel({ contacts, onOpenContact }) {
  return (
    <Panel
      icon="group"
      title="Contacts"
      accent="clay"
      meta={`${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`}
    >
      {contacts.length === 0 ? (
        <EmptyLine text="No contacts linked to this business." />
      ) : (
        contacts.map((c, i) => (
          <Row key={c.id} last={i === contacts.length - 1} align="center">
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, flex: 'none',
                borderRadius: '50%',
                background: `var(--tint-${c.accent})`,
                color: `var(--accent-${c.accent}-text)`,
                fontSize: 'var(--text-sm)', fontWeight: 600
              }}
            >
              {c.initials}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block', fontSize: 'var(--text-md)', fontWeight: 600,
                  color: 'var(--text-heading)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {c.name}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
                {[
                  c.role,
                  `${c.dealCount} ${c.dealCount === 1 ? 'deal' : 'deals'}`
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button onClick={() => onOpenContact?.(c.id)} style={ghostBtn}>
              Record
              <span className="ms" style={{ fontSize: 15 }}>arrow_forward</span>
            </button>
          </Row>
        ))
      )}
    </Panel>
  )
}

// ── Conversations ─────────────────────────────────────────────────────

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'CALL']

function ConversationsPanel({ businessId, total, dealCount, onOpenDeal }) {
  const [channel, setChannel] = useState(null)

  const fetchPage = useCallback(
    ({ cursor }) =>
      businessesAPI.conversations(businessId, {
        ...(channel ? { channel } : {}),
        ...(cursor ? { cursor } : {})
      }),
    [businessId, channel]
  )

  const { items, error, hasMore, loadingMore, loadMore } = usePagedList({
    fetchPage,
    key: 'messages',
    deps: [businessId, channel]
  })

  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const meta = useMemo(() => {
    if (channel) return `${channel.toLowerCase()} only`
    return `${total} across ${dealCount} ${dealCount === 1 ? 'deal' : 'deals'}`
  }, [channel, total, dealCount])

  return (
    <Panel
      icon="forum"
      title="Conversations"
      accent="teal"
      meta={meta}
      toolbar={
        <>
          <ChannelChip label="All" active={!channel} onClick={() => setChannel(null)} />
          {CHANNELS.map((c) => (
            <ChannelChip
              key={c}
              label={titleCase(c)}
              active={channel === c}
              onClick={() => setChannel(channel === c ? null : c)}
            />
          ))}
        </>
      }
    >
      <p
        style={{
          margin: 0, padding: '11px var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--gray-50)',
          fontSize: 'var(--text-base)', lineHeight: 1.55, color: 'var(--text-muted)'
        }}
      >
        Every conversation with any contact at this business, aggregated across
        all its deals — the deal-by-deal view cannot show this.
      </p>

      {error && <EmptyLine text={error} />}
      {items === null && !error && <ConversationSkeleton />}
      {items?.length === 0 && (
        <EmptyLine
          text={channel ? `No ${titleCase(channel)} messages at this business.` : 'No messages yet.'}
        />
      )}

      {items?.map((m, i) => (
        <MessageRow
          key={m.id}
          message={m}
          last={i === items.length - 1 && !hasMore}
          onOpenDeal={onOpenDeal}
        />
      ))}

      {items?.length > 0 && (
        <div style={{ padding: '0 var(--space-4)' }}>
          <LoadMore
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            count={items.length}
            noun="message"
          />
        </div>
      )}
    </Panel>
  )
}

function MessageRow({ message: m, last, onOpenDeal }) {
  const inbound = m.direction === 'in'
  return (
    <Row last={last}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, flex: 'none',
          border: `1px solid var(--accent-${m.channelAccent})`,
          borderRadius: 'var(--radius-sm)',
          background: `var(--tint-${m.channelAccent})`,
          color: `var(--accent-${m.channelAccent})`
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>{m.channelIcon}</span>
      </span>

      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)',
            flexWrap: 'wrap', marginBottom: 3
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase',
              color: `var(--accent-${m.channelAccent})`
            }}
          >
            {m.channel}
          </span>
          {/* Direction as an arrow as well as a word — at a glance the arrow is
              what separates "they wrote" from "we wrote". */}
          <span
            style={{
              fontSize: 'var(--text-sm)', fontWeight: 600,
              color: inbound ? 'var(--accent-clay)' : 'var(--text-muted)'
            }}
          >
            {inbound ? 'In ←' : '→ Out'}
          </span>
          <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)' }}>
            {m.who}
          </span>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
            {formatDate(m.timestamp)}
          </span>
        </span>

        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-md)', lineHeight: 1.5,
            color: m.body ? 'var(--text-body)' : 'var(--text-faint)',
            fontStyle: m.body ? 'normal' : 'italic'
          }}
        >
          {m.body || 'No content'}
        </span>
      </span>

      {/* An unattributed message is the point of this page — flag it rather
          than leaving a blank space where every other row has a deal. */}
      {m.dealId ? (
        <Chip icon="sell" tone="deal" onClick={() => onOpenDeal?.(m.dealId)}>
          {m.dealName || 'Deal'}
        </Chip>
      ) : (
        <Chip icon="link_off" title="Not attributed to any deal">Unassigned</Chip>
      )}
    </Row>
  )
}

function ChannelChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: 'pointer',
        height: 28, padding: '0 var(--space-3)',
        border: active ? '1px solid var(--brand-primary)' : '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--brand-primary)' : '#fff',
        color: active ? '#fff' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
        fontWeight: active ? 600 : 400
      }}
    >
      {label}
    </button>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────

const ghostBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
  height: 30, padding: '0 11px', flex: 'none',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-pill)',
  background: '#fff',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--text-body)'
}

function EmptyLine({ text }) {
  return (
    <p
      style={{
        margin: 0, padding: '14px var(--space-4)',
        fontSize: 'var(--text-md)', color: 'var(--text-muted)'
      }}
    >
      {text}
    </p>
  )
}

function formatMoney(v) {
  if (v == null) return '—'
  return `£${Number(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}

function titleCase(s) {
  if (s === 'SMS') return 'SMS'
  return s.charAt(0) + s.slice(1).toLowerCase()
}

// ── Skeletons ─────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <>
      <SkeletonStyles />
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '14px var(--space-4)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: '#fff'
            }}
          >
            <Bar w={20} h={20} style={{ flex: 'none' }} />
            <div style={{ flex: 1, display: 'grid', gap: 6 }}>
              <Bar w={`${45 + ((i * 13) % 25)}%`} h={14} />
              <Bar w="30%" h={11} />
            </div>
            <Bar w={78} h={22} r="var(--radius-pill)" style={{ flex: 'none' }} />
            <Bar w={62} h={22} r="var(--radius-pill)" style={{ flex: 'none' }} />
          </div>
        ))}
      </div>
    </>
  )
}

function DetailSkeleton() {
  return (
    <>
      <SkeletonStyles />
      <div style={{ display: 'grid', gap: 18 }}>
        <div
          style={{
            border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-sky-text)',
        ['--panel-tint']: 'var(--tint-sky)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', gap: 9, padding: 'var(--space-3) var(--space-4)', alignItems: 'center' }}>
            <Bar w={20} h={20} style={{ flex: 'none' }} />
            <Bar w={220} h={16} />
          </div>
          <div
            style={{
              display: 'grid', gap: 14,
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              padding: 16
            }}
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gap: 6 }}>
                <Bar w="55%" h={9} />
                <Bar w="100%" h={38} r="var(--radius-sm)" />
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'grid', gap: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))'
          }}
        >
          {['pine', 'clay'].map((a) => (
            <div
              key={a}
              style={{
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-card)',
                borderRadius: 'var(--radius-md)',
                background: '#fff', overflow: 'hidden'
              }}
            >
              <div style={{ display: 'flex', gap: 9, padding: 'var(--space-3) var(--space-4)', alignItems: 'center' }}>
                <Bar w={20} h={20} style={{ flex: 'none' }} />
                <Bar w={110} h={15} />
              </div>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: 'var(--space-3)', alignItems: 'center',
                    padding: '13px var(--space-4)',
                    borderTop: '1px solid var(--border-default)'
                  }}
                >
                  <Bar w={30} h={30} r="50%" style={{ flex: 'none' }} />
                  <div style={{ flex: 1, display: 'grid', gap: 5 }}>
                    <Bar w="60%" h={13} />
                    <Bar w="35%" h={11} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ConversationSkeleton() {
  return (
    <>
      <SkeletonStyles />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', gap: 'var(--space-3)', padding: '13px var(--space-4)',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <Bar w={30} h={30} r="var(--radius-sm)" style={{ flex: 'none' }} />
          <div style={{ flex: 1, display: 'grid', gap: 6 }}>
            <Bar w="42%" h={11} />
            <Bar w={`${70 + ((i * 7) % 25)}%`} h={13} />
          </div>
          <Bar w={92} h={22} r="var(--radius-pill)" style={{ flex: 'none' }} />
        </div>
      ))}
    </>
  )
}
