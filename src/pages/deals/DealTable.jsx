import React from 'react'
import { formatMoney } from '../../utils/money'

// The deals list as a table — the dense, scannable view.
//
// Fixed columns, matching what the CRM shows: name, contact, stage, value,
// status, owner, tags, created, updated. No column picker: every field here
// is one a rep reads on every row, and a chooser would add persistence and a
// settings surface for a list nobody has asked to trim.
//
// SORTING IS NOT HERE. The server orders by "recently updated" and pages with
// a keyset cursor anchored to that order — re-sorting client-side would sort
// only the page you have, which is worse than not offering it at all. Doing it
// properly means teaching the cursor about other sort keys, which is its own
// change.

const TH = {
  textAlign: 'left',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-sm)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-strong)',
  whiteSpace: 'nowrap',
  background: 'var(--surface-sunken)',
  // The header stays put while the body scrolls: a 20-row page is taller than
  // most screens and a column you cannot name is a column you cannot read.
  position: 'sticky', top: 0, zIndex: 1
}

const TD = {
  padding: 'var(--space-3)',
  fontSize: 'var(--text-md)',
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-default)',
  verticalAlign: 'middle'
}

const STATUS_TONE = {
  open: { bg: 'var(--tint-sky)', fg: 'var(--text-body)' },
  won: { bg: 'var(--tint-pine)', fg: 'var(--green-600)' },
  lost: { bg: 'var(--tint-rose)', fg: 'var(--status-stuck-text)' },
  abandoned: { bg: 'var(--tint-gray)', fg: 'var(--text-muted)' }
}

function Pill({ children, bg, fg, title }) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-block', maxWidth: 200,
        padding: '3px 9px', borderRadius: 'var(--radius-pill)',
        background: bg, color: fg,
        fontSize: 'var(--text-base)', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        verticalAlign: 'middle'
      }}
    >
      {children}
    </span>
  )
}

function shortDate(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DealTable({ deals = [], onOpenDeal, onOpenContact }) {
  if (!deals.length) return null

  return (
    // The table scrolls sideways inside its own box. Without this the page
    // body scrolls horizontally and the nav goes with it.
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: 'var(--font-sans)'
      }}>
        <thead>
          <tr>
            <th style={TH}>Deal</th>
            <th style={TH}>Contact</th>
            <th style={TH}>Stage</th>
            <th style={{ ...TH, textAlign: 'right' }}>Value</th>
            <th style={TH}>Status</th>
            <th style={TH}>Owner</th>
            <th style={TH}>Tags</th>
            <th style={TH}>Created</th>
            <th style={TH}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const value = Number(d.monetaryValue)
            const tone = STATUS_TONE[String(d.status || 'open').toLowerCase()] || STATUS_TONE.open
            const contactName = d.contact
              ? `${d.contact.firstName || ''} ${d.contact.lastName || ''}`.trim()
              : ''
            const tags = Array.isArray(d.tags) ? d.tags : []
            return (
              <tr
                key={d.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenDeal && onOpenDeal(d.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-sunken)'
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...TD, fontWeight: 600, color: 'var(--text-heading)', maxWidth: 260 }}>
                  <span style={{
                    display: 'block',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {d.dealTag || d.opportunityName || 'Untitled deal'}
                  </span>
                </td>

                <td style={{ ...TD, maxWidth: 200 }}>
                  {contactName
                    ? (
                      <button
                        onClick={(e) => {
                          // The row opens the deal; the contact cell opens the
                          // person. Without this the click reaches both.
                          e.stopPropagation()
                          onOpenContact && onOpenContact(d.contact.id)
                        }}
                        style={{
                          border: 'none', background: 'none', padding: 0,
                          fontFamily: 'inherit', fontSize: 'inherit',
                          color: 'var(--text-body)',
                          cursor: onOpenContact ? 'pointer' : 'default',
                          maxWidth: '100%',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}
                      >
                        {contactName}
                      </button>
                    )
                    : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>

                <td style={TD}>
                  {d.stage
                    ? <Pill bg="var(--tint-pine)" fg="var(--green-600)">{d.stage}</Pill>
                    : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>

                {/* Right-aligned and tabular so the column reads as a column
                    of figures. An unpriced deal says so rather than showing
                    £0, which reads as "worth nothing". */}
                <td style={{
                  ...TD, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: value > 0 ? 'var(--text-heading)' : 'var(--text-faint)',
                  fontWeight: value > 0 ? 600 : 400,
                  whiteSpace: 'nowrap'
                }}>
                  {value > 0 ? formatMoney(value, d.currency) : 'Not priced'}
                </td>

                <td style={TD}>
                  <Pill bg={tone.bg} fg={tone.fg}>{d.status || 'open'}</Pill>
                </td>

                <td style={{ ...TD, maxWidth: 160 }}>
                  <span style={{
                    display: 'block', color: d.owner ? 'var(--text-body)' : 'var(--text-faint)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {d.owner || 'Unassigned'}
                  </span>
                </td>

                {/* Two tags, then a count. A deal with a dozen tags would
                    otherwise set the width of the whole column. */}
                <td style={{ ...TD, maxWidth: 180 }}>
                  {tags.length
                    ? (
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {tags.slice(0, 2).map((t) => (
                          <Pill key={t} bg="var(--tint-gray)" fg="var(--text-muted)">{t}</Pill>
                        ))}
                        {tags.length > 2 && (
                          <span
                            title={tags.join(', ')}
                            style={{
                              fontSize: 'var(--text-sm)', fontWeight: 600,
                              color: 'var(--text-muted)'
                            }}
                          >
                            +{tags.length - 2}
                          </span>
                        )}
                      </span>
                    )
                    : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>

                <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                  {shortDate(d.createdAt) || '—'}
                </td>
                <td style={{ ...TD, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                  {shortDate(d.updatedAt) || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
