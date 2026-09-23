import React from 'react'
import { formatMoney } from '../../utils/money'

// The row data behind a Co-Pilot "list of deals" answer, rendered as a real
// table — not text the model has to format itself.
//
// WHY THIS EXISTS. The model was asked (repeatedly, explicitly) to format a
// list of records as a markdown bullet list, and did not reliably comply —
// a bold name followed by a run-on sentence, no real list markers, however
// the prompt worded the instruction. Prompted formatting for tabular data is
// not something a model call can be trusted to get right every time; this
// component makes it structurally impossible to get wrong; the row data
// comes straight from search_deals's own result (askPortfolio.js's
// `dealsTable`), the same facts the model's prose is narrating, not a
// second, independently-fetched copy that could disagree with it.
//
// Deliberately smaller than deals/DealTable.jsx (the full Deals-tab table):
// this sits inside a chat answer, not a page — Deal / Contact / Stage /
// Value / Owner / Days in stage, no Status/Tags/Created/Updated columns and
// no sideways scroll box. A rep who wants the full record set already has
// the Deals tab; this is "what backs this specific answer", read-only.
const TH = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 'var(--text-sm)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-strong)',
  whiteSpace: 'nowrap',
  background: 'var(--surface-sunken)'
}

const TD = {
  padding: '9px 10px',
  fontSize: 'var(--text-md)',
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-default)',
  verticalAlign: 'middle'
}

const TD_LAST = { ...TD, borderBottom: 'none' }

export default function AnswerDealsTable({ deals = [], onOpenDeal }) {
  if (!deals.length) return null

  return (
    <div style={{
      margin: '9px 0 0',
      width: '100%', overflowX: 'auto',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
        <thead>
          <tr>
            <th style={TH}>Deal</th>
            <th style={TH}>Contact</th>
            <th style={TH}>Stage</th>
            <th style={{ ...TH, textAlign: 'right' }}>Value</th>
            <th style={TH}>Owner</th>
            <th style={{ ...TH, textAlign: 'right' }}>Days in stage</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d, i) => {
            const value = Number(d.value)
            const td = i === deals.length - 1 ? TD_LAST : TD
            const clickable = typeof onOpenDeal === 'function' && d.id
            return (
              <tr
                key={d.id || i}
                style={{ cursor: clickable ? 'pointer' : 'default' }}
                onClick={clickable ? () => onOpenDeal(d.id) : undefined}
                onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = 'var(--surface-sunken)' } : undefined}
                onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = 'transparent' } : undefined}
              >
                <td style={{ ...td, fontWeight: 600, color: 'var(--text-heading)', maxWidth: 220 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.name || 'Untitled deal'}
                  </span>
                </td>
                <td style={{ ...td, maxWidth: 160 }}>
                  <span style={{
                    display: 'block', color: d.contact ? 'var(--text-body)' : 'var(--text-faint)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {d.contact || '—'}
                  </span>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {d.stage
                    ? <span style={{
                        display: 'inline-block', padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--tint-pine)', color: 'var(--green-600)',
                        fontSize: 'var(--text-sm)', fontWeight: 500
                      }}>{d.stage}</span>
                    : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>
                <td style={{
                  ...td, textAlign: 'right', whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                  color: value > 0 ? 'var(--text-heading)' : 'var(--text-faint)',
                  fontWeight: value > 0 ? 600 : 400
                }}>
                  {value > 0 ? formatMoney(value) : 'Not priced'}
                </td>
                <td style={{ ...td, maxWidth: 140 }}>
                  <span style={{
                    display: 'block', color: d.owner ? 'var(--text-body)' : 'var(--text-faint)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {d.owner || 'Unassigned'}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                  {d.days_in_stage != null ? d.days_in_stage : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
