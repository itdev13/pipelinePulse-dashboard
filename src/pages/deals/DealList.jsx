import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Popover } from 'antd'
import { dealsAPI } from '../../api/deals'
import { tasksAPI } from '../../api/tasks'
import { notesAPI } from '../../api/notes'
import { formatMoney } from '../../utils/money'
import { RecordPill, relativeTime, formatDate, formatDue } from '../shared/ListChrome'

// The deals as a LIST, grouped by stage — the Figma List view (Oct 2026):
//
//   8 deals · £121,100 open                  [Collapse all] [Columns · 10 of 10]
//   ☐ DEAL | STAGE | VALUE | CONTACT | BUSINESS | OWNER | PRODUCT | TASKS | NOTES | UPDATED
//   ▾ Marketing Qualified (1)                                        TOTAL £9,750
//   ☐ 🏷 New Build Curtain Walling | … | [👤 Casey ▾] | [🏢 Cedarstone ▾] | …
//
// EACH STAGE GROUP LOADS ITS OWN DEALS, the way a board column does. One
// paged list sorted by "last updated" would scatter every page across every
// group, so the groups would grow and reshuffle as the rep scrolled. Per
// group, a stage shows its own deals and its own "Load more".
//
// The ▾ chips open a small menu with the detail behind them rather than
// navigating straight away — the row is for scanning, the menu for the one
// question ("which tasks?", "who else is on it?") before deciding to leave.

const PAGE = 25

// Every column but Deal can be hidden from the Columns menu.
const COLUMNS = [
  { key: 'stage', label: 'Stage' },
  { key: 'value', label: 'Value', align: 'right' },
  { key: 'contact', label: 'Contact' },
  { key: 'business', label: 'Business' },
  { key: 'owner', label: 'Owner' },
  { key: 'product', label: 'Product / details' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'updated', label: 'Updated', align: 'right' }
]
const HIDDEN_KEY = 'pp.deals.listHiddenColumns'

const TH = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 'var(--text-sm)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-strong)',
  background: 'var(--gray-25)',
  whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 1
}
const TD = {
  padding: '9px 12px',
  fontSize: 'var(--text-md)',
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-default)',
  borderRight: '1px solid var(--border-default)',
  verticalAlign: 'middle'
}

// Chip colours, by what the chip is. Tasks and Notes carry a STATE: no open
// tasks on an open deal is the thing to notice, so it is red.
const TONES = {
  contact:  { border: 'var(--accent-sky)', fg: 'var(--accent-sky-text)', bg: 'var(--surface-card)' },
  business: { border: 'var(--accent-plum)', fg: 'var(--accent-plum-text)', bg: 'var(--surface-card)' },
  neutral:  { border: 'var(--border-strong)', fg: 'var(--text-body)', bg: 'var(--surface-card)' },
  tasks:    { border: 'var(--accent-clay)', fg: 'var(--accent-clay-text)', bg: 'var(--tint-clay)' },
  noTasks:  { border: 'var(--status-stuck)', fg: 'var(--status-stuck-text)', bg: 'var(--surface-card)' },
  notes:    { border: 'var(--accent-gold)', fg: 'var(--accent-gold-text)', bg: 'var(--tint-gold)' },
  muted:    { border: 'var(--border-strong)', fg: 'var(--text-muted)', bg: 'var(--surface-card)' }
}

function readHidden() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}

const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// A chip with a ▾ that opens `menu`. The row behind it opens the deal, so a
// click here must not reach it.
function MenuChip({ icon, tone = 'neutral', label, title, menu, onOpenChange, maxWidth = 150 }) {
  const t = TONES[tone] || TONES.neutral
  const chip = (
    <button
      type="button"
      onClick={(e) => e.stopPropagation()}
      title={title || label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        maxWidth, height: 26, padding: '0 6px 0 9px',
        border: `1px solid ${t.border}`, borderRadius: 'var(--radius-pill)',
        background: t.bg, color: t.fg,
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 500,
        cursor: menu ? 'pointer' : 'default', whiteSpace: 'nowrap'
      }}
    >
      <span className="ms" style={{ fontSize: 15, flex: 'none' }}>{icon}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {menu && <span className="ms" style={{ fontSize: 16, flex: 'none' }}>expand_more</span>}
    </button>
  )
  if (!menu) return chip
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      // .pp-portal: the popover renders at the document root, outside
      // [data-dealhub], and without this class every token in it is unset.
      rootClassName="pp-portal"
      content={<div onClick={(e) => e.stopPropagation()} style={{ minWidth: 220, maxWidth: 300 }}>{menu}</div>}
      onOpenChange={onOpenChange}
    >
      {chip}
    </Popover>
  )
}

function MenuHeading({ children }) {
  return (
    <div className="pp-label" style={{ marginBottom: 6 }}>{children}</div>
  )
}

function MenuFooter({ label, onClick }) {
  if (!onClick) return null
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%',
        marginTop: 8, paddingTop: 8, border: 'none',
        borderTop: '1px solid var(--border-default)', background: 'none',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
        color: 'var(--text-link)', cursor: 'pointer'
      }}
    >
      {label}
      <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
    </button>
  )
}

// The deal's open tasks or its notes, fetched the first time the menu opens —
// a list of 25 rows should not cost 50 requests on load for menus nobody
// opened.
function useLazyList(fetcher) {
  const [state, setState] = useState({ items: null, error: null })
  const started = useRef(false)
  const load = useCallback(() => {
    if (started.current) return
    started.current = true
    fetcher()
      .then((items) => setState({ items, error: null }))
      .catch((e) => setState({ items: [], error: e.message || 'Could not load' }))
  }, [fetcher])
  return [state, load]
}

function TasksChip({ deal, onOpenInHub }) {
  const n = deal.openTaskCount ?? 0
  const fetcher = useCallback(
    () => tasksAPI.list({ dealId: deal.id, status: 'open', limit: 5 }).then((r) => r?.tasks || []),
    [deal.id]
  )
  const [{ items, error }, load] = useLazyList(fetcher)
  return (
    <MenuChip
      icon={n ? 'task_alt' : 'error'}
      tone={n ? 'tasks' : 'noTasks'}
      label={`${n} ${n === 1 ? 'task' : 'tasks'}`}
      title={n ? `${n} open ${n === 1 ? 'task' : 'tasks'}` : 'No open tasks on this deal'}
      onOpenChange={(o) => { if (o) load() }}
      menu={
        <>
          <MenuHeading>Open tasks</MenuHeading>
          {items === null && !error && <MenuNote>Loading…</MenuNote>}
          {error && <MenuNote danger>{error}</MenuNote>}
          {items && !error && items.length === 0 && <MenuNote>No open tasks.</MenuNote>}
          {items && items.map((t) => (
            <div key={t.id} style={{ display: 'grid', gap: 1, padding: '4px 0' }}>
              <span style={{ fontSize: 'var(--text-md)', fontWeight: 500, color: 'var(--text-heading)' }}>
                {t.title || 'Untitled task'}
              </span>
              {t.dueAt && (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{formatDue(t.dueAt)}</span>
              )}
            </div>
          ))}
          <MenuFooter label="Open in Deal hub" onClick={onOpenInHub ? () => onOpenInHub(deal.id) : null} />
        </>
      }
    />
  )
}

function NotesChip({ deal, onOpenInHub }) {
  const n = deal.noteCount ?? 0
  const fetcher = useCallback(
    () => notesAPI.list({ dealId: deal.id, limit: 5 }).then((r) => r?.notes || []),
    [deal.id]
  )
  const [{ items, error }, load] = useLazyList(fetcher)
  return (
    <MenuChip
      icon="sticky_note_2"
      tone={n ? 'notes' : 'muted'}
      label={`${n} ${n === 1 ? 'note' : 'notes'}`}
      onOpenChange={(o) => { if (o) load() }}
      menu={
        <>
          <MenuHeading>Notes</MenuHeading>
          {items === null && !error && <MenuNote>Loading…</MenuNote>}
          {error && <MenuNote danger>{error}</MenuNote>}
          {items && !error && items.length === 0 && <MenuNote>No notes yet.</MenuNote>}
          {items && items.map((note) => (
            <div key={note.id} style={{ display: 'grid', gap: 1, padding: '4px 0' }}>
              <span style={{
                fontSize: 'var(--text-md)', fontWeight: 500, color: 'var(--text-heading)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {note.title || stripHtml(note.body) || '(empty note)'}
              </span>
              {note.createdAt && (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{formatDate(note.createdAt)}</span>
              )}
            </div>
          ))}
          <MenuFooter label="Open in Deal hub" onClick={onOpenInHub ? () => onOpenInHub(deal.id) : null} />
        </>
      }
    />
  )
}

function MenuNote({ children, danger }) {
  return (
    <p style={{
      margin: '2px 0', fontSize: 'var(--text-md)',
      color: danger ? 'var(--status-stuck-text)' : 'var(--text-muted)'
    }}>
      {children}
    </p>
  )
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function Row({ deal, hidden, selected, onToggleSelect, onOpenDeal, onOpenInHub, onOpenContact, onOpenBusiness }) {
  const name = deal.dealTag || deal.opportunityName || 'Untitled deal'
  const value = Number(deal.monetaryValue)
  const contactName = deal.contact
    ? `${deal.contact.firstName || ''} ${deal.contact.lastName || ''}`.trim()
    : ''
  const businessName = deal.businessName || deal.contact?.business || ''
  const people = deal.people?.length ? deal.people : (deal.contact ? [{ ...deal.contact, primary: true }] : [])
  const show = (k) => !hidden.has(k)
  const faint = <span style={{ color: 'var(--text-faint)' }}>—</span>

  return (
    <tr
      onClick={() => onOpenDeal && onOpenDeal(deal.id)}
      style={{ cursor: 'pointer', background: selected ? 'var(--tint-pine)' : 'var(--surface-card)' }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--gray-25)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = selected ? 'var(--tint-pine)' : 'var(--surface-card)' }}
    >
      <td style={{ ...TD, width: 44, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(deal.id)}
          aria-label={`Select ${name}`}
          style={{ width: 17, height: 17, accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
        />
      </td>
      <td style={{ ...TD, minWidth: 200, maxWidth: 260 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, flex: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--tint-pine)'
          }}>
            <span className="ms" style={{ fontSize: 17, color: 'var(--green-600)' }}>sell</span>
          </span>
          {/* Two lines, then an ellipsis: a deal name is what a rep reads down
              the column, and one line cut most of them off mid-word. */}
          <span title={name} style={{
            fontWeight: 600, color: 'var(--text-heading)', lineHeight: 1.3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {name}
          </span>
        </span>
      </td>
      {show('stage') && (
        <td style={{ ...TD, maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={deal.stage || ''}>
          {deal.stage || faint}
        </td>
      )}
      {show('value') && (
        <td style={{
          ...TD, textAlign: 'right', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: value > 0 ? 'var(--text-heading)' : 'var(--text-faint)'
        }}>
          {value > 0 ? formatMoney(value, deal.currency) : '—'}
        </td>
      )}
      {show('contact') && (
        <td style={TD}>
          {contactName ? (
            <MenuChip
              icon="person"
              tone="contact"
              label={contactName}
              menu={
                <>
                  <MenuHeading>{people.length === 1 ? 'Contact on this deal' : 'Contacts on this deal'}</MenuHeading>
                  {people.map((p) => {
                    const pn = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Unnamed contact'
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-md)', color: 'var(--text-heading)' }}>
                          {pn}
                          {p.primary && (
                            <span style={{ marginLeft: 6, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Primary</span>
                          )}
                        </span>
                        <RecordPill kind="CONTACT" name={pn} onClick={onOpenContact ? () => onOpenContact(p.id) : undefined} />
                      </div>
                    )
                  })}
                </>
              }
            />
          ) : faint}
        </td>
      )}
      {show('business') && (
        <td style={TD}>
          {businessName ? (
            <MenuChip
              icon="domain"
              tone="business"
              label={businessName}
              menu={
                <>
                  <MenuHeading>Business</MenuHeading>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-md)', color: 'var(--text-heading)' }}>
                      {businessName}
                    </span>
                    {/* Only a real business RECORD opens; the free-text company
                        on the contact has nowhere to go. */}
                    <RecordPill
                      kind="BUSINESS"
                      name={businessName}
                      onClick={onOpenBusiness && deal.businessId ? () => onOpenBusiness(deal.businessId) : undefined}
                    />
                  </div>
                </>
              }
            />
          ) : faint}
        </td>
      )}
      {show('owner') && (
        <td style={{ ...TD, maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={deal.owner || ''}>
          {deal.owner || <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>}
        </td>
      )}
      {show('product') && (
        <td style={TD}>
          {deal.product ? (
            <MenuChip
              icon="category"
              label={deal.product}
              maxWidth={160}
              menu={
                <>
                  <MenuHeading>Product</MenuHeading>
                  <MenuNote>System: <b style={{ color: 'var(--text-heading)' }}>{deal.productSystem || 'Not set'}</b></MenuNote>
                  <MenuNote>Type: <b style={{ color: 'var(--text-heading)' }}>{deal.productType || 'Not set'}</b></MenuNote>
                </>
              }
            />
          ) : faint}
        </td>
      )}
      {show('tasks') && (
        <td style={TD}><TasksChip deal={deal} onOpenInHub={onOpenInHub} /></td>
      )}
      {show('notes') && (
        <td style={TD}><NotesChip deal={deal} onOpenInHub={onOpenInHub} /></td>
      )}
      {show('updated') && (
        <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-body)', borderRight: 'none' }}>
          {capitalise(relativeTime(deal.updatedAt)) || '—'}
        </td>
      )}
    </tr>
  )
}

// One stage: its header row and its deals. Owns its own fetch and paging.
function StageGroup({
  stage, colSpan, collapsed, onToggle, stats, query, hidden,
  selected, onToggleSelect, onLoaded, rowHandlers
}) {
  const [deals, setDeals] = useState([])
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [total, setTotal] = useState(null)
  const [totalValue, setTotalValue] = useState(null)

  const load = useCallback(async (next = null) => {
    setLoading(true)
    setError(null)
    try {
      const r = await dealsAPI.list({
        stageId: stage.id,
        limit: PAGE,
        cursor: next || undefined,
        ...query
      })
      setDeals((prev) => (next ? [...prev, ...(r.deals || [])] : (r.deals || [])))
      setCursor(r.nextCursor || null)
      setHasMore(!!r.hasMore)
      if (typeof r.totalCount === 'number') setTotal(r.totalCount)
      if (typeof r.totalValue === 'number') setTotalValue(r.totalValue)
    } catch (e) {
      setError(e.message || 'Could not load this stage')
    } finally {
      setLoading(false)
    }
  // `query` is memoised by the caller; its identity changes only when a
  // filter does.
  }, [stage.id, query])

  useEffect(() => { load(null) }, [load])

  // The ids on screen, for the header's select-all.
  useEffect(() => { onLoaded(stage.id, deals.map((d) => d.id)) }, [onLoaded, stage.id, deals])

  const count = stats?.count ?? total ?? deals.length
  const value = stats?.value ?? totalValue ?? deals.reduce((n, d) => n + (Number(d.monetaryValue) || 0), 0)
  const currency = stats?.currency || deals[0]?.currency

  // A stage with nothing in it under these filters is not drawn. With every
  // pipeline in scope there are dozens of stages, and a header per empty one
  // buried the few that held deals.
  if (!loading && !error && count === 0) return null

  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} style={{
          padding: 0, background: 'var(--gray-50)',
          borderBottom: '1px solid var(--border-default)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${stage.name}` : `Collapse ${stage.name}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)'
              }}
            >
              <span className="ms" style={{ fontSize: 20, color: 'var(--text-muted)' }}>
                {collapsed ? 'chevron_right' : 'expand_more'}
              </span>
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-heading)' }}>
                {stage.name}
              </span>
            </button>
            <span style={{
              minWidth: 20, height: 20, padding: '0 6px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-pill)', background: 'var(--gray-100)',
              fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)'
            }}>
              {count}
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
              <span className="pp-label" style={{ marginBottom: 0 }}>Total</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 600,
                fontVariantNumeric: 'tabular-nums', color: 'var(--text-heading)'
              }}>
                {formatMoney(value || 0, currency)}
              </span>
            </span>
          </div>
        </td>
      </tr>

      {!collapsed && deals.map((d) => (
        <Row
          key={d.id}
          deal={d}
          hidden={hidden}
          selected={selected.has(d.id)}
          onToggleSelect={onToggleSelect}
          {...rowHandlers}
        />
      ))}

      {!collapsed && (loading || error || hasMore) && (
        <tr>
          <td colSpan={colSpan} style={{
            padding: '8px 12px', textAlign: 'center',
            borderBottom: '1px solid var(--border-default)', background: 'var(--surface-card)'
          }}>
            {error ? (
              <span style={{ fontSize: 'var(--text-md)', color: 'var(--status-stuck-text)' }}>{error}</span>
            ) : loading ? (
              <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Loading…</span>
            ) : (
              <button
                type="button"
                onClick={() => load(cursor)}
                style={{
                  height: 28, padding: '0 12px',
                  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-card)', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-body)'
                }}
              >
                Load more in {stage.name}
              </button>
            )}
          </td>
        </tr>
      )}
    </tbody>
  )
}

export default function DealList({
  // The board's merged columns: one per stage NAME in the pipelines in scope.
  stages = [],
  // stageId -> { count, value, currency } from ?summary=stages, or null.
  stats = null,
  // Filters, sent with every group's request.
  search, status = 'open', tag, assignedTo, sort, dir,
  // A stage id from the toolbar's Stage field — only its group is shown.
  focusStage,
  onOpenDeal, onOpenInHub, onOpenContact, onOpenBusiness
}) {
  const [hidden, setHidden] = useState(readHidden)
  useEffect(() => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])) } catch { /* private mode */ }
  }, [hidden])

  const [collapsed, setCollapsed] = useState(() => new Set())
  const [selected, setSelected] = useState(() => new Set())
  // stageId -> ids loaded in that group, for select-all.
  const [loadedIds, setLoadedIds] = useState({})
  const onLoaded = useCallback((id, ids) => {
    setLoadedIds((prev) => {
      const was = prev[id] || []
      if (was.length === ids.length && was.every((x, i) => x === ids[i])) return prev
      return { ...prev, [id]: ids }
    })
  }, [])

  // The stages to draw. One, if the toolbar picked one. And none the server's
  // totals already say are empty — they would render nothing anyway, and
  // skipping them saves a request per empty stage.
  const groups = useMemo(
    () => stages.filter((st) => (!focusStage || st.id.split(',').includes(focusStage))
      && !(stats && (stats[st.id]?.count ?? 0) === 0)),
    [stages, focusStage, stats]
  )

  const query = useMemo(() => ({
    status,
    q: search || undefined,
    tag: tag || undefined,
    assignedTo: assignedTo || undefined,
    sort: sort || undefined,
    dir: sort ? (dir || 'desc') : undefined
  }), [status, search, tag, assignedTo, sort, dir])

  const visibleCols = COLUMNS.filter((c) => !hidden.has(c.key))
  // Checkbox + Deal + the visible optional columns.
  const colSpan = 2 + visibleCols.length

  const allIds = groups.flatMap((g) => loadedIds[g.id] || [])
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const someSelected = !allSelected && allIds.some((id) => selected.has(id))

  const totals = stats
    ? groups.reduce((acc, g) => {
      const s = stats[g.id]
      if (s) { acc.count += s.count; acc.value += s.value; acc.currency = acc.currency || s.currency }
      return acc
    }, { count: 0, value: 0, currency: null })
    : null

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.id))

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const rowHandlers = { onOpenDeal, onOpenInHub, onOpenContact, onOpenBusiness }

  return (
    <section style={{
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
        padding: '10px 14px', borderBottom: '1px solid var(--border-default)'
      }}>
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
          {totals
            ? `${totals.count} ${totals.count === 1 ? 'deal' : 'deals'} · ${formatMoney(totals.value, totals.currency)} ${status === 'all' ? '' : status}`.trim()
            : `${groups.length} ${groups.length === 1 ? 'stage' : 'stages'}`}
          {selected.size > 0 && (
            <span style={{ marginLeft: 10, fontWeight: 600, color: 'var(--green-600)' }}>
              {selected.size} selected
            </span>
          )}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.id)))}
            style={TOOL_BUTTON}
          >
            <span className="ms" style={{ fontSize: 17 }}>{allCollapsed ? 'unfold_more' : 'unfold_less'}</span>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
          <Popover
            trigger="click"
            placement="bottomRight"
            rootClassName="pp-portal"
            content={
              <div style={{ display: 'grid', gap: 4, minWidth: 190 }}>
                <MenuHeading>Show columns</MenuHeading>
                {COLUMNS.map((c) => (
                  <label key={c.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                    fontSize: 'var(--text-md)', color: 'var(--text-body)', cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.key)}
                      onChange={() => setHidden((prev) => {
                        const next = new Set(prev)
                        if (next.has(c.key)) next.delete(c.key); else next.add(c.key)
                        return next
                      })}
                      style={{ accentColor: 'var(--brand-primary)' }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            }
          >
            <button type="button" style={TOOL_BUTTON}>
              <span className="ms" style={{ fontSize: 17 }}>view_column</span>
              {/* +1 for Deal, which is always shown. */}
              Columns · {visibleCols.length + 1} of {COLUMNS.length + 1}
              <span className="ms" style={{ fontSize: 17 }}>expand_more</span>
            </button>
          </Popover>
        </span>
      </header>

      {/* Scrolls sideways inside its own box; the page must not. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 44, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))}
                  aria-label="Select all deals shown"
                  style={{ width: 17, height: 17, accentColor: 'var(--brand-primary)', cursor: 'pointer' }}
                />
              </th>
              <th style={TH}>Deal</th>
              {visibleCols.map((c) => (
                <th key={c.key} style={{ ...TH, textAlign: c.align || 'left' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <StageGroup
              key={g.id}
              stage={g}
              colSpan={colSpan}
              collapsed={collapsed.has(g.id)}
              onToggle={() => setCollapsed((prev) => {
                const next = new Set(prev)
                if (next.has(g.id)) next.delete(g.id); else next.add(g.id)
                return next
              })}
              stats={stats ? (stats[g.id] || { count: 0, value: 0 }) : null}
              query={query}
              hidden={hidden}
              selected={selected}
              onToggleSelect={toggleSelect}
              onLoaded={onLoaded}
              rowHandlers={rowHandlers}
            />
          ))}
        </table>
      </div>
    </section>
  )
}

const TOOL_BUTTON = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-pill)',
  background: 'var(--surface-card)', color: 'var(--text-body)',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
  cursor: 'pointer'
}
