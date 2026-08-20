import React from 'react'

// Loading skeletons for the Deal Hub.
//
// Switching deals replaces every panel at once. Without a placeholder the
// stale deal stays on screen and then snaps to the new one, which reads as a
// glitch — you can't tell whether you're looking at the deal you just picked
// or the one before it. These render the *shape* of each panel so the layout
// holds still and it's obvious the content is arriving.
//
// Deliberately not a spinner: a spinner says "something is happening
// somewhere", a skeleton says "this panel, this shape, nearly there".

// One shared shimmer keyframe, injected once. Scoped to the class so it
// can't leak into the host page's styles.
const SHIMMER_CSS = `
@keyframes pp-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.pp-sk {
  background: linear-gradient(
    90deg,
    var(--gray-100) 25%,
    var(--gray-50)  37%,
    var(--gray-100) 63%
  );
  background-size: 200% 100%;
  animation: pp-shimmer 1.4s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
@media (prefers-reduced-motion: reduce) {
  .pp-sk { animation: none; }
}
`

export function SkeletonStyles() {
  return <style>{SHIMMER_CSS}</style>
}

// A single shimmering block. Width accepts any CSS length so callers can
// vary line lengths — uniform bars read as a loading *pattern* rather than
// text about to appear.
export function Bar({ w = '100%', h = 12, r, style }) {
  return (
    <span
      className="pp-sk"
      style={{
        display: 'block', width: w, height: h,
        borderRadius: r ?? 'var(--radius-sm)',
        ...style
      }}
    />
  )
}

export function Pill({ w = 90, h = 30 }) {
  return <Bar w={w} h={h} r="var(--radius-pill)" />
}

// Filter bar: two rows of chips on the left, section tabs on the right.
export function FilterBarSkeleton() {
  return (
    <div
      style={{
        padding: '14px 20px 0',
        maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          display: 'flex', flexWrap: 'wrap',
          alignItems: 'flex-start', columnGap: 24, rowGap: 12
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 520px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Bar w={44} h={10} />
            <Pill w={96} />
            <Pill w={78} />
            <Pill w={78} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Pill w={64} />
            <Pill w={112} />
            <Pill w={112} />
            <Pill w={82} />
            <Pill w={70} />
            <Pill w={124} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: '100%' }}>
          {[132, 116, 124, 104, 96, 88].map((w, i) => (
            <Pill key={i} w={w} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Accent-bordered panel shell, matching PeopleSection / DealSection framing
// so the skeleton occupies the same box the real content will.
function PanelShell({ accent, children, titleW = 90 }) {
  return (
    <section
      style={{
        border: `2px solid var(--accent-${accent})`,
        borderRadius: 'var(--radius-md)',
        background: '#fff', overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)'
        }}
      >
        <Bar w={20} h={20} />
        <Bar w={titleW} h={14} />
      </header>
      {children}
    </section>
  )
}

// People / Deal left-rail section.
export function SectionSkeleton({ accent = 'sky', columns = 3 }) {
  return (
    <PanelShell accent={accent}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
        }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            style={{
              padding: '14px 16px',
              borderRight: i < columns - 1 ? '1px solid var(--border-default)' : 'none',
              display: 'grid', gap: 9
            }}
          >
            <Bar w="45%" h={9} />
            <Bar w="80%" h={16} />
            <Bar w="60%" h={11} />
            <Bar w="70%" h={11} />
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

// Timeline: message rows with the channel gutter square + card.
export function TimelineSkeleton({ rows = 4 }) {
  return (
    <PanelShell accent="teal" titleW={104}>
      <div style={{ padding: '12px 14px' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'grid', gridTemplateColumns: '40px 1fr',
              gap: 4, marginBottom: 10
            }}
          >
            <div style={{ display: 'grid', gap: 5, justifyItems: 'center', paddingTop: 11 }}>
              <Bar w={28} h={28} />
              <Bar w={26} h={9} />
            </div>
            <div
              style={{
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Bar w={8} h={8} r="50%" />
                  <Bar w={104} h={12} />
                  <Bar w={54} h={10} />
                </div>
                {/* Varying line widths so it reads as prose, not a table. */}
                <Bar w={i % 2 ? '72%' : '92%'} h={11} />
                <Bar w={i % 2 ? '48%' : '64%'} h={11} />
              </div>
              <div
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '6px 12px',
                  borderTop: '1px solid var(--border-default)',
                  background: 'var(--gray-25)'
                }}
              >
                <Bar w={40} h={9} />
                <span style={{ marginLeft: 'auto' }}>
                  <Pill w={116} h={22} />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

// Right-hand commitments rail.
export function RailSkeleton({ rows = 3 }) {
  return (
    <PanelShell accent="clay" titleW={112}>
      <div style={{ padding: '12px 16px', display: 'grid', gap: 14 }}>
        <Bar w="52%" h={9} />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Bar w={16} h={16} />
            <div style={{ flex: 1, display: 'grid', gap: 6 }}>
              <Bar w={i % 2 ? '74%' : '88%'} h={12} />
              <Bar w="42%" h={10} />
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

// The whole deal body — everything that swaps when the selected deal changes.
export function DealBodySkeleton() {
  return (
    <>
      <SkeletonStyles />
      <div
        style={{
          padding: '14px 20px 0',
          maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <Pill w={92} h={32} />
          <Pill w={76} h={32} />
          <Pill w={84} h={32} />
        </div>
        <SectionSkeleton accent="sky" columns={3} />
      </div>

      <FilterBarSkeleton />

      <div
        style={{
          padding: '14px 20px 24px',
          maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
            gap: 14, alignItems: 'start'
          }}
        >
          <TimelineSkeleton />
          <RailSkeleton />
        </div>
      </div>
    </>
  )
}

// First load, before the deal list exists — there's no header or switcher to
// frame yet, so this stands in for the whole tab.
export function DealHubSkeleton() {
  return (
    <div>
      <SkeletonStyles />
      <div style={{ padding: '14px 20px 0' }}>
        <div
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: '#fff',
            padding: 14,
            maxWidth: 1660, margin: '0 auto', boxSizing: 'border-box',
            display: 'grid', gap: 12
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Bar w={320} h={38} r="var(--radius-md)" />
            <span style={{ marginLeft: 'auto' }}><Bar w={128} h={26} /></span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[104, 118, 96, 110, 88].map((w, i) => <Pill key={i} w={w} h={26} />)}
          </div>
        </div>
      </div>
      <DealBodySkeleton />
    </div>
  )
}
