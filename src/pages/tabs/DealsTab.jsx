import React, { useCallback, useMemo, useState } from 'react'
import { DatePicker, Select, Input } from 'antd'
import dayjs from 'dayjs'
import { dealsAPI } from '../../api/deals'
import { usePagedList, useInfiniteScroll } from '../../hooks/usePagedList'
import { useTabState } from '../../hooks/useTabState'
import {
  Shell, PageHeader, SearchInput, StateMessage, DealCardsSkeleton, LoadMore,
  formatDate, initialsFor, nameFor
} from '../shared/ListChrome'

// Deals tab — one card per open deal, each showing the facts a rep scans for
// and the full contact list on the deal.
//
// Value / expected close / stage / owner render as controls per the design.
// /api/deals is read-only (no PATCH route yet), so they hold local state and
// carry a "coming next" title — same convention as PeopleSection's Make
// primary / Remove and the Deal Hub's stage dropdown.

export default function DealsTab({ onOpenDeal }) {
  const [q, setQ] = useTabState('deals', 'q', '')
  // Server-side: filtering only the loaded page would hide matches further
  // down the list.
  const [search, setSearch] = useTabState('deals', 'search', '')

  const fetchPage = useCallback(
    ({ cursor }) => dealsAPI.list({ status: 'open', limit: 20, cursor, q: search || undefined }),
    [search]
  )
  const { items, error, hasMore, loadingMore, loading, loadMore } =
    usePagedList({ fetchPage, key: 'deals', deps: [search] })
  const sentinelRef = useInfiniteScroll(loadMore, { enabled: hasMore && !loadingMore })

  const deals = items || []

  return (
    <Shell maxWidth={1240}>
      <PageHeader
        title="Deals"
        subtitle="Value, expected close, stage and owner are editable inline"
        action={
          <SearchInput
            value={q}
            onChange={setQ}
            onKeyDown={(e) => { if (e.key === 'Enter') setSearch(q.trim()) }}
            onBlur={() => setSearch(q.trim())}
            placeholder="Search deal name — press Enter"
            width={320}
          />
        }
      />

      {/* Cards, not rows — so the loading state mirrors the card shape
          rather than the generic row skeleton. */}
      {loading && <DealCardsSkeleton cards={3} />}

      {(error || (!loading && deals.length === 0)) && (
        <div
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', overflow: 'hidden'
          }}
        >
          <StateMessage
            error={error}
            empty={!loading && deals.length === 0}
            emptyText={
              search
                ? 'No deals match — clear the search to see everything.'
                : 'No open deals in this sub-account.'
            }
          />
        </div>
      )}

      {deals.map((d) => (
        <DealCard key={d.id} deal={d} onOpenDeal={onOpenDeal} />
      ))}

      {!loading && deals.length > 0 && (
        <LoadMore
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          count={deals.length}
          noun="deal"
        />
      )}
    </Shell>
  )
}

function DealCard({ deal, onOpenDeal }) {
  // The RAW number, not deal.value — that is display-formatted ("£26,000") and
  // this input prints its own £ prefix, so binding to it rendered "£ £0". It
  // would also have sent the formatted string back on save.
  const [value, setValue] = useState(
    deal.monetaryValue != null ? String(deal.monetaryValue) : ''
  )
  const [closeDate, setCloseDate] = useState(
    deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : ''
  )
  const [stage, setStage] = useState(deal.stage || '')

  // These controls used to be local state that went nowhere — the card accepted
  // an edit and discarded it on reload. They write now.
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)

  // What actually changed, against the deal as loaded.
  //
  // These used to save on blur with no button. Two problems: nothing told you a
  // write had happened — you typed a value, clicked away, and the card looked
  // identical whether it saved or not — and editing two fields fired two
  // separate requests. One button, one request, one confirmation.
  const wasValue = deal.monetaryValue != null ? String(deal.monetaryValue) : ''
  const wasClose = deal.forecastCloseDate ? toDateInput(deal.forecastCloseDate) : ''

  const changes = useMemo(() => {
    const out = {}
    if (value.trim() !== wasValue) out.value = value.trim() === '' ? null : value.trim()
    if (closeDate !== wasClose) out.expectedCloseDate = closeDate || null
    return out
  }, [value, closeDate, wasValue, wasClose])

  const dirty = Object.keys(changes).length > 0

  const revert = () => {
    setValue(wasValue)
    setCloseDate(wasClose)
    setError(null)
    setErrorField(null)
  }

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    setErrorField(null)
    try {
      const res = await dealsAPI.update(deal.id, changes)
      // Apply what GHL echoed — it truncates the close date to a day and may
      // round the value.
      const o = res?.opportunity
      if (o?.monetaryValue != null) setValue(String(o.monetaryValue))
      if (o?.forecastExpectedCloseDate !== undefined) {
        setCloseDate(o.forecastExpectedCloseDate || '')
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setError(err.message || 'Could not save that — try again')
      setErrorField(err.data?.field || null)
    } finally {
      setSaving(false)
    }
  }

  const people = deal.people || []
  const daysInStage = daysSince(deal.currentStageEnteredAt)

  // The strip under the controls: what it is, where it came from, how long
  // it's sat there. Only facts we actually have — no "—" filler.
  const facts = [
    deal.product,
    deal.leadSource,
    daysInStage != null ? `${daysInStage} ${daysInStage === 1 ? 'day' : 'days'} in stage` : null,
    deal.pipeline
  ].filter(Boolean)

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-pine-text)',
        ['--panel-tint']: 'var(--tint-pine)',
        borderRadius: 'var(--radius-md)',
        background: '#fff', overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
          flexWrap: 'wrap', padding: '14px var(--space-4) 0'
        }}
      >
        <span
          className="ms"
          style={{ fontSize: 'var(--text-xl)', color: 'var(--accent-pine)', marginTop: 2 }}
        >
          sell
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-heading)',
              margin: 0, lineHeight: 1.3
            }}
          >
            {deal.dealTag || '(unnamed deal)'}
          </h2>
          {deal.opportunityName && deal.opportunityName !== deal.dealTag && (
            <p style={{ margin: '3px 0 0', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
              {deal.opportunityName}
            </p>
          )}
        </div>

        <button
          onClick={() => onOpenDeal && onOpenDeal(deal.id)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 34, padding: '0 15px',
            border: 'none', borderRadius: 'var(--radius-md)',
            background: 'var(--green-600)', color: '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
            cursor: 'pointer', flex: 'none'
          }}
        >
          Open deal
          <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
        </button>
      </header>

      {/* Inline-editable fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4) 0'
        }}
      >
        <Field label="Value">
          {/* Prefix rather than "£28,000" as text: the currency is a property
              of the field, not something the user has to type or delete. */}
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            // Commit on blur or Enter, not per keystroke — a write per
            // character would be a request per character.
            onPressEnter={save}
            disabled={saving}
            status={errorField === 'value' ? 'error' : undefined}
            prefix={<span style={{ color: 'var(--text-faint)' }}>£</span>}
            placeholder="Not priced"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </Field>
        <Field label="Expected close">
          {/* A real picker instead of <input type="date">, whose empty state
              renders the browser's "dd/mm/yyyy" — that read as a broken field
              rather than "no date set". */}
          <DatePicker
            value={closeDate ? dayjs(closeDate) : null}
            onChange={(d) => setCloseDate(d ? d.format('YYYY-MM-DD') : '')}
            disabled={saving}
            status={errorField === 'expectedCloseDate' ? 'error' : undefined}
            format="D MMM YYYY"
            placeholder="Set a date"
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Stage">
          {/* The stage list isn't loaded on this page (it's per-pipeline and
              the list route doesn't carry it), so this offers the current value
              only — an option we can't save would invite a dead change. */}
          <Select
            value={stage || undefined}
            onChange={setStage}
            placeholder="No stage"
            style={{ width: '100%' }}
            options={stage ? [{ value: stage, label: stage }] : []}
          />
        </Field>
        <Field label="Owner">
          <Input
            value={deal.owner || ''}
            readOnly
            placeholder="Unassigned"
            title="Reassigning an owner writes back to your CRM — coming next"
          />
        </Field>
      </div>

      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            margin: '10px var(--space-4) 0',
            padding: '8px 10px',
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-base)', color: 'var(--status-stuck-text)'
          }}
        >
          <span className="ms" style={{ fontSize: 15, flex: 'none', marginTop: 1 }}>error</span>
          {error}
        </div>
      )}

      {/* Appears only once something is edited. A permanently visible Save on
          every card in a list of twenty would be twenty controls doing nothing,
          and the card is read far more often than it is edited. */}
      {(dirty || saving || saved) && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            margin: '10px var(--space-4) 0',
            padding: '9px 0 0',
            borderTop: '1px solid var(--border-default)'
          }}
        >
          <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {saving
              ? 'Saving to your CRM…'
              : saved
                ? 'Saved'
                : `${Object.keys(changes).length} unsaved change${Object.keys(changes).length === 1 ? '' : 's'}`}
          </span>
          {dirty && !saving && (
            <button
              onClick={revert}
              style={{
                height: 30, padding: '0 13px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                background: '#fff', color: 'var(--text-body)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 30, padding: '0 14px',
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: saved
                ? 'var(--status-done)'
                : dirty ? 'var(--brand-primary)' : 'var(--gray-200)',
              color: dirty || saved ? '#fff' : 'var(--text-faint)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 600,
              cursor: dirty && !saving ? 'pointer' : 'default'
            }}
          >
            {saving && (
              <span className="ms pp-spin" style={{ fontSize: 14 }}>progress_activity</span>
            )}
            {saved && <span className="ms" style={{ fontSize: 14 }}>check</span>}
            {saving ? 'Saving' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      )}

      {facts.length > 0 && (
        <p
          style={{
            margin: 0, padding: '10px var(--space-4) 0',
            fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 1.5
          }}
        >
          {facts.join(' · ')}
          {deal.lastCustomerContactAt && (
            <> · last contact {formatDate(deal.lastCustomerContactAt)}</>
          )}
        </p>
      )}

      {people.length > 0 && (
        <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)' }}>
          <span
            style={{
              display: 'block', marginBottom: 7,
              fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            {people.length === 1 ? 'Contact on this deal' : 'Contacts on this deal'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {people.map((p) => (
              <PersonPill key={p.id} person={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function PersonPill({ person }) {
  const accent = `var(--accent-${person.accent || 'sky'}-text)`
  const tint = `var(--tint-${person.accent || 'sky'})`
  const name = nameFor(person)

  return (
    <span
      title={person.business || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)',
        maxWidth: 340,
        // Bigger overall: 28px avatar and 6px padding made a pill you had to
        // squint at, and the two on this deal were visually identical.
        padding: '8px 14px 8px 8px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff'
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, flex: 'none',
          borderRadius: '50%',
          background: tint, color: accent,
          fontSize: 'var(--text-md)', fontWeight: 600
        }}
      >
        {initialsFor(person.firstName, person.lastName, name)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-heading)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {name}
        </span>
        {/* Something that distinguishes THIS person.
            The contact type alone ("lead") is identical on every pill, so it's
            the last resort. And whatever nameFor already used as the heading is
            skipped — showing "mark@example.com" twice, once as the name and
            once beneath it, says nothing the first line didn't. */}
        {(() => {
          const detail =
            [person.business, person.email, person.phone, person.contactType]
              .find((v) => v && String(v).trim() && String(v).trim() !== name)
          if (!detail) return null
          return (
            <span
              style={{
                display: 'block', marginTop: 1,
                fontSize: 'var(--text-base)', color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}
            >
              {detail}
            </span>
          )
        })()}
      </span>
      {person.primary && (
        <span
          style={{
            flex: 'none',
            fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 'var(--radius-sm)',
            // Solid: on green-50 (1.13:1 against the white card) the badge
            // was invisible and PRIMARY read as ordinary small text.
            background: 'var(--green-600)', color: '#fff'
          }}
        >
          Primary
        </span>
      )}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span
        style={{
          display: 'block', marginBottom: 5,
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}


function toDateInput(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function daysSince(ts) {
  if (!ts) return null
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / 86400000))
}
