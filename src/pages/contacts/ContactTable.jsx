import React from 'react'

// The contacts list as a table — the dense, scannable view.
//
// Columns mirror what the CRM shows: name, phone, email, business, type,
// tags, deals and open work. No column picker, for the same reason the deals
// table has none — every field here is read on every row.
//
// SORTING IS NOT HERE. The server orders by "recently updated" and pages with
// a keyset cursor anchored to that order, so a sort control could only
// reorder the page already loaded — which looks like sorting and is not.

const TH = {
  textAlign: 'left',
  padding: '11px var(--space-4)',
  fontSize: 'var(--text-base)', fontWeight: 600,
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
  padding: '14px var(--space-4)',
  fontSize: 'var(--text-lg)',
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-default)',
  verticalAlign: 'middle'
}

// The last row's divider doubles up with the container's own border.
const TD_LAST = { ...TD, borderBottom: 'none' }

const TYPE_TONE = {
  lead: { bg: 'var(--tint-sky)', fg: 'var(--text-body)' },
  customer: { bg: 'var(--tint-pine)', fg: 'var(--green-600)' }
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

// Initials, matching the avatar on the contact card so the same person reads
// the same in both views.
function Avatar({ name }) {
  const initials = String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase()).join('') || '?'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, flex: 'none',
      borderRadius: '50%', background: 'var(--tint-gray)',
      fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-muted)'
    }}>
      {initials}
    </span>
  )
}

export default function ContactTable({ contacts = [], onOpen }) {
  if (!contacts.length) return null

  return (
    // Scrolls sideways inside its own box — without this the page body scrolls
    // and the navigation goes with it.
    <div style={{
      width: '100%', overflowX: 'auto',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-lg)'
    }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontFamily: 'var(--font-sans)'
      }}>
        <thead>
          <tr>
            <th style={TH}>Contact</th>
            <th style={TH}>Phone</th>
            <th style={TH}>Email</th>
            <th style={TH}>Business</th>
            <th style={TH}>Type</th>
            <th style={TH}>Tags</th>
            <th style={{ ...TH, textAlign: 'right' }}>Deals</th>
            <th style={{ ...TH, textAlign: 'right' }}>Open work</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, i) => {
            const td = i === contacts.length - 1 ? TD_LAST : TD
            const tags = Array.isArray(c.tags) ? c.tags : []
            const tone = TYPE_TONE[String(c.contactType || '').toLowerCase()]
            const openWork = (c.openTaskCount || 0)
            return (
              <tr
                key={c.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onOpen && onOpen(c.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-sunken)'
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...td, maxWidth: 260 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                    <Avatar name={c.name} />
                    <span style={{
                      fontWeight: 600, color: 'var(--text-heading)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {c.name || 'Unknown contact'}
                    </span>
                  </span>
                </td>

                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {c.phone || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>

                <td style={{ ...td, maxWidth: 240 }}>
                  <span style={{
                    display: 'block',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {c.email || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </span>
                </td>

                <td style={{ ...td, maxWidth: 180 }}>
                  <span style={{
                    display: 'block',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {c.business || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                  </span>
                </td>

                <td style={td}>
                  {tone
                    ? <Pill bg={tone.bg} fg={tone.fg}>{c.contactType}</Pill>
                    : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>

                {/* Two tags, then a count. A contact with a dozen tags would
                    otherwise set the width of the whole column. */}
                <td style={{ ...td, maxWidth: 200 }}>
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
                              fontSize: 'var(--text-base)', fontWeight: 600,
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

                {/* Counts right-aligned and tabular, so the columns read as
                    columns of figures. A zero is greyed rather than hidden —
                    "none" is information here. */}
                <td style={{
                  ...td, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: c.openDeals ? 'var(--text-heading)' : 'var(--text-faint)',
                  fontWeight: c.openDeals ? 600 : 400
                }}>
                  {c.openDeals || 0}
                </td>
                <td style={{
                  ...td, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: openWork ? 'var(--text-heading)' : 'var(--text-faint)',
                  fontWeight: openWork ? 600 : 400
                }}>
                  {openWork}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
