import React, { useMemo } from 'react'
import CARDS from '../insights/cards.json'
import InsightCard from '../insights/InsightCard'

// Insights — the 24 signed-off insight cards, for THIS sub-account.
//
// ── WHERE THE NUMBERS COME FROM ──────────────────────────────────────
//
// Each chart reads a pre-aggregated view (migration 135) through
// /api/insights/charts/:key. The route scopes every read to the session's own
// location, so switching sub-account switches the figures with no filter to
// set and no way to read another account's.
//
// The prototype this came from read Supabase from the browser with a
// service-role key and decoded a hardcoded brand inside each view. Neither
// survived the port: the key would be a standing grant over every table, and
// the brand decode meant a new sub-account silently returned nothing.
//
// ── WHAT IS NOT HERE ─────────────────────────────────────────────────
//
// The 22 insights the tracker marks Blocked or Not started. They have no
// query, so there is nothing to draw and a placeholder card for each would be
// 22 rows of furniture. Cards that are live but have one missing PART keep
// the design's empty frame — see InsightCard's ghost block.
export default function InsightsTab() {
  // Grouped in the design's own order. Sorted by group number rather than by
  // first appearance so a card added later lands in its section instead of
  // creating a second one with the same name.
  const groups = useMemo(() => {
    const by = new Map()
    for (const c of CARDS) {
      if (!by.has(c.group_number)) {
        by.set(c.group_number, { number: c.group_number, name: c.group_name, cards: [] })
      }
      by.get(c.group_number).cards.push(c)
    }
    return [...by.values()].sort((a, b) => a.number - b.number)
  }, [])

  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <header>
        <h2 style={{
          margin: 0, fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-heading)'
        }}>
          Insights
        </h2>
        <p style={{
          margin: '4px 0 0', maxWidth: 680,
          fontSize: 'var(--text-md)', color: 'var(--text-muted)',
          lineHeight: 'var(--leading-normal)'
        }}>
          {CARDS.length} questions about this sub-account, each answered from its own
          query. Figures are read live, so they move as deals do.
        </p>
      </header>

      {groups.map((g) => (
        <section key={g.number} style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 0 }}>
          <h3 style={{
            margin: 0,
            fontSize: 'var(--text-sm)', fontWeight: 600,
            letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
            color: 'var(--text-muted)'
          }}>
            {g.name}
          </h3>
          {/* Two columns on a wide screen, one on a narrow. A 420px floor
              rather than a fixed 1fr 1fr: these cards are mostly prose, and
              two narrow columns of it read worse than one wide one. */}
          <div style={{
            display: 'grid', gap: 'var(--space-3)',
            gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
            alignItems: 'start'
          }}>
            {g.cards.map((c) => <InsightCard key={c.card_id} card={c} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
