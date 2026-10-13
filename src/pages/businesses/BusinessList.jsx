import React, { useCallback, useEffect, useRef, useState } from 'react'
import { businessesAPI } from '../../api/businesses'
import { formatMoney } from '../../utils/money'
import { DealPill, RecordPill, relativeTime } from '../shared/ListChrome'
import { MenuChip, MenuHeading, MenuNote, MenuFooter, ColumnsMenu } from '../shared/MenuChip'

// The businesses as a LIST — the Figma Businesses List view (Oct 2026):
//
//   6 businesses                                     [Columns · 10 of 10]
//   ☐ NAME | TYPE | LOCATION | CONTACTS | WEBSITE | OWNER | TASKS | NOTES |
//     DEALS · PIPELINE | LAST ACTIVITY
//   ☐ [HR] Harborview Retail… | Commercial | Manchester, UK | [👤 1 contact ▾] | …
//
// The same chips and Columns menu as the Deals List (shared/MenuChip).
// Type, Owner, Tasks and Notes have no API yet: their columns are drawn and
// read "—", and fill in when the list endpoint sends type / owner /
// openTaskCount / noteCount. The Contacts and Deals menus read the business's
// detail the first time one is opened.

const COLUMNS = [
  { key: 'type', label: 'Type' },
  { key: 'location', label: 'Location' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'website', label: 'Website' },
  { key: 'owner', label: 'Owner' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'deals', label: 'Deals · pipeline' },
  { key: 'activity', label: 'Last activity' }
]
const HIDDEN_KEY = 'pp.businesses.listHiddenColumns'

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
  verticalAlign: 'middle',
  whiteSpace: 'nowrap'
}
const DASH = <span style={{ color: 'var(--text-faint)' }}>—</span>

function readHidden() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}

// "Harborview Retail Fit-Out" → "HR". One word → its first two letters.
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The business's contacts and deals, fetched the first time either menu
// opens — and once for both, since one detail read carries the two.
function useDetailOnOpen(id) {
  const [state, setState] = useState({ data: null, error: null })
  const started = useRef(false)
  const load = useCallback(() => {
    if (started.current) return
    started.current = true
    businessesAPI.get(id)
      .then((d) => setState({ data: { contacts: d?.contacts || [], deals: d?.deals || [] }, error: null }))
      .catch((e) => setState({ data: null, error: e.message || 'Could not load' }))
  }, [id])
  return [state, load]
}

// The website, with "…. ✎" to add one in place when it is empty — the only
// cell the design edits inline.
function WebsiteCell({ business: b, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const save = async () => {
    const next = draft.trim()
    if (!next) { setEditing(false); setError(null); return }
    setSaving(true)
    setError(null)
    try {
      await businessesAPI.update(b.id, { website: next })
      setEditing(false)
      onSaved && onSaved({ website: next })
    } catch (e) {
      setError(e.message || 'Could not save that')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <span style={{ display: 'grid', gap: 2 }} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setEditing(false); setError(null) }
          }}
          onBlur={() => { if (!saving) save() }}
          disabled={saving}
          placeholder="www.example.com"
          aria-label="Website"
          style={{
            width: 170, height: 28, padding: '0 8px',
            border: `1px solid ${error ? 'var(--status-stuck)' : 'var(--brand-primary)'}`,
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', outline: 'none'
          }}
        />
        {error && <span role="alert" style={{ fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)' }}>{error}</span>}
      </span>
    )
  }
  if (b.website) {
    return (
      <span title={b.website} style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {b.website}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setDraft(''); setEditing(true) }}
      title="Add a website"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
        border: 'none', background: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-faint)'
      }}
    >
      ….
      <span className="ms" style={{ fontSize: 15, color: 'var(--text-muted)' }}>edit</span>
    </button>
  )
}

function Row({ business: b, hidden, selected, onToggleSelect, onOpen, onOpenContact, onOpenDeal, onSaved }) {
  const [{ data, error }, load] = useDetailOnOpen(b.id)
  const show = (k) => !hidden.has(k)
  const location = [b.city, b.country].filter(Boolean).join(', ')
  const contacts = b.contactCount || 0
  const dealCount = b.dealCount || 0
  // OPEN pipeline when the API sends it; until then every deal's value.
  const pipeline = b.openPipelineValue ?? b.totalValue

  // A chip menu that says one thing and offers the business page.
  const openMenu = (heading, text) => (
    <>
      <MenuHeading>{heading}</MenuHeading>
      <MenuNote>{text}</MenuNote>
      <MenuFooter label="Open business" onClick={onOpen} />
    </>
  )

  const loading = <MenuNote>Loading…</MenuNote>
  const failed = error ? <MenuNote danger>{error}</MenuNote> : null

  return (
    <tr
      onClick={onOpen}
      style={{ cursor: 'pointer', background: selected ? 'var(--tint-plum)' : 'var(--surface-card)' }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--gray-25)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = selected ? 'var(--tint-plum)' : 'var(--surface-card)' }}
    >
      <td style={{ ...TD, width: 44, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(b.id)}
          aria-label={`Select ${b.name}`}
          style={{ width: 17, height: 17, accentColor: 'var(--accent-plum)', cursor: 'pointer' }}
        />
      </td>
      <td style={{ ...TD, maxWidth: 240 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, flex: 'none',
            borderRadius: 'var(--radius-sm)', background: 'var(--tint-plum)',
            fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent-plum-text)'
          }}>
            {initials(b.name)}
          </span>
          <span title={b.name} style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            fontWeight: 600,
            color: b.hasName ? 'var(--accent-plum-text)' : 'var(--text-faint)',
            fontStyle: b.hasName ? 'normal' : 'italic'
          }}>
            {b.name}
          </span>
        </span>
      </td>
      {show('type') && <td style={TD}>{b.type || DASH}</td>}
      {show('location') && <td style={TD}>{location || DASH}</td>}
      {show('contacts') && (
        <td style={TD}>
          {contacts ? (
            <MenuChip
              icon="group"
              tone="contact"
              label={plural(contacts, 'contact', 'contacts')}
              onOpenChange={(o) => { if (o) load() }}
              menu={
                <>
                  <MenuHeading>Contacts</MenuHeading>
                  {!data && !error && loading}
                  {failed}
                  {data && data.contacts.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-md)', color: 'var(--text-heading)' }}>{c.name}</span>
                      <RecordPill kind="CONTACT" name={c.name} onClick={onOpenContact ? () => onOpenContact(c.id) : undefined} />
                    </div>
                  ))}
                </>
              }
            />
          ) : (
            <MenuChip icon="group" tone="muted" label="No contacts"
              menu={openMenu('Contacts', 'No contacts are linked to this business yet.')} />
          )}
        </td>
      )}
      {show('website') && <td style={TD}><WebsiteCell business={b} onSaved={onSaved} /></td>}
      {show('owner') && <td style={TD}>{b.owner || DASH}</td>}
      {/* The design's chips, "No tasks ▾" / "No notes ▾" included. Until the
          list endpoint sends openTaskCount / noteCount there is no count, and
          the grey chip stands in; its menu points to the business page, where
          the Tasks panel lists them. */}
      {show('tasks') && (
        <td style={TD}>
          <MenuChip
            icon="task_alt"
            tone={b.openTaskCount ? 'tasks' : 'muted'}
            label={b.openTaskCount ? plural(b.openTaskCount, 'task', 'tasks') : 'No tasks'}
            menu={openMenu('Tasks', b.openTaskCount
              ? `${plural(b.openTaskCount, 'open task', 'open tasks')} for this business.`
              : 'Open tasks are listed on the business page.')}
          />
        </td>
      )}
      {show('notes') && (
        <td style={TD}>
          <MenuChip
            icon="sticky_note_2"
            tone={b.noteCount ? 'notes' : 'muted'}
            label={b.noteCount ? plural(b.noteCount, 'note', 'notes') : 'No notes'}
            menu={openMenu('Notes', b.noteCount
              ? `${plural(b.noteCount, 'note', 'notes')} for this business.`
              : 'Notes are kept on each contact and deal.')}
          />
        </td>
      )}
      {show('deals') && (
        <td style={TD}>
          {dealCount ? (
            <MenuChip
              icon="sell"
              tone="deals"
              label={`${dealCount} · ${formatMoney(pipeline || 0)}`}
              title={b.openPipelineValue == null ? 'Value of every deal on this business, including closed ones' : undefined}
              onOpenChange={(o) => { if (o) load() }}
              menu={
                <>
                  <MenuHeading>Deals</MenuHeading>
                  {!data && !error && loading}
                  {failed}
                  {data && data.deals.map((d) => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-md)', color: 'var(--text-heading)' }}>{d.name}</span>
                      {d.value ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 600 }}>
                          {formatMoney(d.value)}
                        </span>
                      ) : null}
                      <DealPill compact name={d.name} onClick={onOpenDeal ? () => onOpenDeal(d.id) : undefined} />
                    </div>
                  ))}
                </>
              }
            />
          ) : (
            <MenuChip icon="sell" tone="muted" label="No deals"
              menu={openMenu('Deals', 'No deals at this business yet.')} />
          )}
        </td>
      )}
      {show('activity') && (
        <td style={{ ...TD, borderRight: 'none' }}>
          {(() => {
            const t = relativeTime(b.lastActivityAt)
            return t ? t.charAt(0).toUpperCase() + t.slice(1) : DASH
          })()}
        </td>
      )}
    </tr>
  )
}

export default function BusinessList({
  items = [], selected, onToggleSelect, onSetSelected,
  onOpen, onOpenContact, onOpenDeal, onSaved
}) {
  const [hidden, setHidden] = useState(readHidden)
  useEffect(() => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])) } catch { /* private mode */ }
  }, [hidden])

  const visible = COLUMNS.filter((c) => !hidden.has(c.key))
  const allSelected = items.length > 0 && items.every((b) => selected.has(b.id))
  const someSelected = !allSelected && items.some((b) => selected.has(b.id))

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
          {plural(items.length, 'business', 'businesses')}
          {selected.size > 0 && (
            <span style={{ marginLeft: 10, fontWeight: 600, color: 'var(--accent-plum-text)' }}>
              {selected.size} selected
            </span>
          )}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <ColumnsMenu
            columns={COLUMNS}
            hidden={hidden}
            onToggle={(key) => setHidden((prev) => {
              const next = new Set(prev)
              if (next.has(key)) next.delete(key); else next.add(key)
              return next
            })}
          />
        </span>
      </header>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 44, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  onChange={() => onSetSelected(allSelected ? new Set() : new Set(items.map((b) => b.id)))}
                  aria-label="Select all businesses shown"
                  style={{ width: 17, height: 17, accentColor: 'var(--accent-plum)', cursor: 'pointer' }}
                />
              </th>
              <th style={TH}>Name</th>
              {visible.map((c) => <th key={c.key} style={TH}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <Row
                key={b.id}
                business={b}
                hidden={hidden}
                selected={selected.has(b.id)}
                onToggleSelect={onToggleSelect}
                onOpen={() => onOpen(b.id)}
                onOpenContact={onOpenContact}
                onOpenDeal={onOpenDeal}
                onSaved={(patch) => onSaved(b.id, patch)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
