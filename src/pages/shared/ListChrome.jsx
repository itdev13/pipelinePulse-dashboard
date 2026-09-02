import React, { useState } from 'react'

// Shared chrome for the list tabs (Notes / Tasks / Deals).
//
// All three share a vocabulary: a page header with a subtitle and an optional
// action, an accent-bordered section with a count, contact + deal chips, and
// the same loading/empty/error states. Before this, each tab re-implemented
// all of it with slightly different padding and chip borders.

export function PageHeader({ title, subtitle, action }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        flexWrap: 'wrap', marginBottom: 4
      }}
    >
      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, margin: 0 }}>{title}</h1>
      {subtitle && (
        <p
          style={{
            margin: 0, flex: 1, minWidth: 200,
            fontSize: 'var(--text-md)', color: 'var(--text-muted)'
          }}
        >
          {subtitle}
        </p>
      )}
      {action}
    </div>
  )
}

export function Panel({ icon, title, accent, meta, children, toolbar }) {
  const color = `var(--accent-${accent}-text)`
  const tint = `var(--tint-${accent})`
  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: color,
        ['--panel-tint']: tint,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: 'var(--space-3) var(--space-4)'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color }}>{icon}</span>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color, margin: 0, flex: 1 }}>
          {title}
        </h2>
        {meta != null && (
          <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{meta}</span>
        )}
      </header>

      {toolbar && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--gray-50)'
          }}
        >
          {toolbar}
        </div>
      )}

      {children}
    </section>
  )
}

// A row in a Panel. Last row drops its divider so it doesn't double up with
// the panel's own border.
export function Row({ children, last, align = 'flex-start' }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: align, gap: 'var(--space-3)',
        padding: '13px var(--space-4)',
        borderBottom: last ? 'none' : '1px solid var(--border-default)'
      }}
    >
      {children}
    </div>
  )
}

// ── Chips ─────────────────────────────────────────────────────────────

export function ContactChip({ name, onClick }) {
  return (
    <Chip icon="person" onClick={onClick} title={onClick ? 'Open contact record' : undefined}>
      {name || 'Contact'}
    </Chip>
  )
}

export function DealChip({ name, onClick }) {
  return (
    <Chip
      icon="sell"
      onClick={onClick}
      title={onClick ? 'Open this deal' : undefined}
      tone="deal"
    >
      {name}
    </Chip>
  )
}

export function Chip({ icon, children, onClick, title, tone, danger }) {
  const isDeal = tone === 'deal'
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={!onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        maxWidth: 260,
        height: 30, padding: '0 var(--space-3)',
        border: `1px solid ${
          danger ? 'var(--border-default)'
            : isDeal ? 'var(--green-300)'
            : 'var(--border-default)'
        }`,
        borderRadius: 'var(--radius-pill)',
        // tint-pine, not green-50: these chips have a green-300 border so the
        // shape reads either way, but green-50 is 1.13:1 against a white row.
        background: isDeal ? 'var(--tint-pine)' : '#fff',
        color: danger
          ? 'var(--status-stuck)'
          : isDeal ? 'var(--green-600)' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-base)', fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap'
      }}
    >
      {icon && <span className="ms" style={{ fontSize: 15, flex: 'none' }}>{icon}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </button>
  )
}

// Small square icon button for row-level edit / delete.
// Live when given an onClick, inert without one. It used to render
// `cursor: pointer` either way, so the actions still waiting on a write path
// looked clickable and did nothing.
export function RowAction({ icon, onClick, title, danger }) {
  const live = typeof onClick === 'function'
  return (
    <button
      onClick={onClick}
      disabled={!live}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, flex: 'none',
        border: `1px solid ${live ? 'var(--border-strong)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        // Danger keeps its colour either way — the opacity below carries the
        // disabled state, and a greyed-out red would stop reading as danger.
        color: danger
          ? 'var(--status-stuck)'
          : live ? 'var(--text-muted)' : 'var(--text-faint)',
        cursor: live ? 'pointer' : 'not-allowed',
        opacity: live ? 1 : 0.6
      }}
    >
      <span className="ms" style={{ fontSize: 16 }}>{icon}</span>
    </button>
  )
}

export function PrimaryAction({ children, onClick, icon = 'add' }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: 36, padding: '0 var(--space-4)',
        border: 'none', borderRadius: 'var(--radius-md)',
        background: 'var(--brand-primary)', color: '#fff',
        boxShadow: '0 1px 2px rgba(13, 91, 64, 0.25)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
        cursor: 'pointer'
      }}
    >
      <span className="ms" style={{ fontSize: 18 }}>{icon}</span>
      {children}
    </button>
  )
}

export function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 32, padding: '0 15px',
        border: active
          ? '1.5px solid var(--brand-primary)'
          : '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--brand-primary)' : '#fff',
        color: active ? '#fff' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-md)', fontWeight: active ? 600 : 400,
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )
}

// Search now runs server-side (pagination means filtering the loaded page
// would hide matches further down), so callers commit on Enter/blur rather
// than on every keystroke — hence the extra handlers.
export function SearchInput({ value, onChange, placeholder, width = 300, onKeyDown, onBlur }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      style={{
        width, maxWidth: '100%', height: 36, boxSizing: 'border-box',
        padding: '0 var(--space-3)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', color: 'var(--text-body)'
      }}
    />
  )
}

// Loading / empty / error, so every tab words these the same way.
//
// `loading` renders row skeletons rather than a text line: these panels are
// the page's whole content, so a bare "Loading…" leaves the layout empty and
// then snaps. Pass skeletonRows to match the density of the real rows.
// The empty state takes an icon and tint so a panel can match its own accent
// instead of every empty state in the app being gold with an inbox glyph — a
// teal Timeline panel showing a gold card read as a warning rather than as
// "nothing here yet".
//
// `inline` drops the border, tint and margin for an empty state rendered
// INSIDE an already-bordered panel, where the default card-in-a-card looks
// like a layout bug. It keeps the padding and centring so the panel still has
// deliberate height rather than collapsing to nothing.
//
// `emptyTitle` is the short answer ("No messages yet"); `emptyText` is the
// explanation under it. Title alone is fine — a state nobody needs explaining
// shouldn't be padded out with a sentence.
export function StateMessage({
  loading, error, empty, emptyText, emptyTitle, loadingText, skeletonRows = 4,
  emptyIcon = 'inbox', inline = false, action = null
}) {
  if (error) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
          margin: 'var(--space-2) 0',
          padding: 'var(--space-3) var(--space-4)',
          border: '1px solid var(--status-stuck)',
          borderLeft: '4px solid var(--status-stuck)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--tint-rose)',
          fontSize: 'var(--text-md)', lineHeight: 'var(--leading-normal)',
          color: 'var(--text-heading)'
        }}
      >
        <span className="ms" style={{ fontSize: 18, color: 'var(--status-stuck)', flex: 'none' }}>
          error
        </span>
        <span>{error}</span>
      </div>
    )
  }
  if (loading) {
    return <RowSkeletons rows={skeletonRows} label={loadingText} />
  }
  if (empty) {
    return (
      <div
        style={{
          margin: inline ? 0 : 'var(--space-2) 0',
          padding: inline ? '44px var(--space-5)' : '28px var(--space-5)',
          border: inline ? 'none' : '1px dashed var(--accent-gold)',
          borderRadius: inline ? 0 : 'var(--radius-md)',
          background: inline ? 'transparent' : 'var(--tint-gold)',
          textAlign: 'center'
        }}
      >
        {/* A tinted disc behind the glyph. A bare icon on a white panel reads
            as a stray character; the disc makes it deliberate. */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 46, height: 46, borderRadius: '50%',
            background: inline ? 'var(--panel-tint, var(--gray-50))' : 'transparent'
          }}
        >
          <span
            className="ms"
            style={{
              fontSize: 26,
              color: inline
                ? 'var(--panel-accent, var(--text-faint))'
                : 'var(--accent-gold-text)'
            }}
          >
            {emptyIcon}
          </span>
        </span>
        {emptyTitle && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 'var(--text-lg)', fontWeight: 600,
              color: 'var(--text-heading)'
            }}
          >
            {emptyTitle}
          </p>
        )}
        {emptyText && (
          <p
            style={{
              margin: emptyTitle ? '4px auto 0' : '8px auto 0', maxWidth: 380,
              fontSize: 'var(--text-md)', lineHeight: 'var(--leading-normal)',
              color: 'var(--text-muted)'
            }}
          >
            {emptyText}
          </p>
        )}
        {action && <div style={{ marginTop: 'var(--space-3)' }}>{action}</div>}
      </div>
    )
  }
  return null
}

// ── Skeletons ─────────────────────────────────────────────────────────
//
// Shared with the Deal Hub's shimmer (pages/dealhub/Skeleton.jsx) via the
// same .pp-sk class, so there's one animation definition in the app. This
// module injects it too, since the list tabs render without the Deal Hub
// mounted.

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

// Rows inside a Panel: icon block, two text lines, chips right. Matches the
// shape of a Notes / Tasks row so the layout doesn't jump when data lands.
export function RowSkeletons({ rows = 4, label }) {
  return (
    <>
      <SkeletonStyles />
      {label && (
        <span
          style={{
            position: 'absolute', width: 1, height: 1,
            overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap'
          }}
        >
          {label}
        </span>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
            padding: '13px var(--space-4)',
            borderBottom: i === rows - 1 ? 'none' : '1px solid var(--border-default)'
          }}
        >
          <Bar w={30} h={30} r="var(--radius-md)" style={{ flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 7 }}>
            {/* Widths vary per row so it reads as text arriving, not a table. */}
            <Bar w={i % 2 ? '38%' : '52%'} h={13} />
            <Bar w={i % 3 === 0 ? '78%' : '62%'} h={11} />
            <Bar w={112} h={10} />
          </div>
          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            <Bar w={104} h={30} r="var(--radius-pill)" />
            <Bar w={124} h={30} r="var(--radius-pill)" />
            <Bar w={30} h={30} r="var(--radius-md)" />
          </div>
        </div>
      ))}
    </>
  )
}

// Card-grid skeleton for the Contacts tab.
export function CardGridSkeleton({ cards = 8, minWidth = 260 }) {
  return (
    <>
      <SkeletonStyles />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
          gap: 'var(--space-3)'
        }}
      >
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--border-default)',
              borderTop: '3px solid var(--gray-200)',
              borderRadius: 'var(--radius-md)',
              background: '#fff',
              padding: 14, display: 'grid', gap: 10
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bar w={34} h={34} r="50%" style={{ flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
                <Bar w={i % 2 ? '58%' : '74%'} h={13} />
                <Bar w="40%" h={10} />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <Bar w="86%" h={11} />
              <Bar w="64%" h={11} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// Deal cards on the Deals tab — header, four field controls, contact pills.
export function DealCardsSkeleton({ cards = 3 }) {
  return (
    <>
      <SkeletonStyles />
      {Array.from({ length: cards }).map((_, i) => (
        <section
          key={i}
          style={{
            border: '2px solid var(--gray-200)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-3)', padding: '14px var(--space-4) 0', alignItems: 'flex-start' }}>
            <Bar w={20} h={20} style={{ flex: 'none', marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
              <Bar w={i % 2 ? '32%' : '44%'} h={17} />
              <Bar w="58%" h={11} />
            </div>
            <Bar w={112} h={34} r="var(--radius-md)" style={{ flex: 'none' }} />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4) 0'
            }}
          >
            {[0, 1, 2, 3].map((k) => (
              <div key={k} style={{ display: 'grid', gap: 5 }}>
                <Bar w={72} h={9} />
                <Bar w="100%" h={36} r="var(--radius-md)" />
              </div>
            ))}
          </div>
          <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
            <Bar w="66%" h={11} />
          </div>
          <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)', display: 'grid', gap: 7 }}>
            <Bar w={132} h={9} />
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Bar w={186} h={42} r="var(--radius-pill)" />
              <Bar w={168} h={42} r="var(--radius-pill)" />
            </div>
          </div>
        </section>
      ))}
    </>
  )
}


export function Shell({ children, maxWidth = 1140 }) {
  return (
    <div
      style={{
        maxWidth, width: '100%', boxSizing: 'border-box',
        margin: '0 auto', padding: 'var(--space-1) 20px var(--space-7)',
        display: 'grid', gap: 'var(--space-4)'
      }}
    >
      {children}
    </div>
  )
}

// ── Date helpers, shared so the tabs word dates identically ───────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatDate(iso, withYear = true) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`
}

// Relative phrasing for recent things ("2 days ago"), absolute past a
// fortnight where "23 days ago" stops being easier to read than a date.
export function relativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days <= 14) return `${days} days ago`
  return formatDate(iso)
}

// Due dates read as "due yesterday / today / tomorrow" near now, and as a
// date further out — matching the design's phrasing.
export function formatDue(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDue = new Date(d)
  startOfDue.setHours(0, 0, 0, 0)
  const days = Math.round((startOfDue - startOfToday) / 86400000)
  if (days === 0) return 'due today'
  if (days === -1) return 'due yesterday'
  if (days === 1) return 'due tomorrow'
  if (days < -1 && days >= -14) return `due ${Math.abs(days)} days ago`
  return `due ${formatDate(iso, false)}`
}

export function initialsFor(firstName, lastName, fallback) {
  const a = (firstName || '').trim()
  const b = (lastName || '').trim()
  if (a && b) return (a[0] + b[0]).toUpperCase()
  if (a) return a.slice(0, 2).toUpperCase()
  if (b) return b.slice(0, 2).toUpperCase()
  const f = (fallback || '').trim()
  return f ? f[0].toUpperCase() : '?'
}

export function nameFor(p) {
  const first = (p?.firstName || '').trim()
  const last = (p?.lastName || '').trim()
  if (first && last) return `${first} ${last}`
  if (first || last) return first || last
  // No name on the contact. A business reads as a party you're dealing with;
  // an email at least looks like a person. A raw phone number does not — it
  // goes on the pill's detail line instead, where it reads as a contact method
  // rather than as somebody's name.
  return p?.business || p?.email || 'Unnamed contact'
}

// End-of-list sentinel + status. Render after the rows; the ref goes on the
// element an IntersectionObserver watches, so reaching it loads the next page.
export function LoadMore({ sentinelRef, hasMore, loadingMore, count, noun = 'item' }) {
  return (
    <div
      ref={sentinelRef}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-2)', padding: 'var(--space-4)',
        fontSize: 'var(--text-base)', color: 'var(--text-muted)'
      }}
    >
      {loadingMore ? (
        <>
          <SkeletonStyles />
          <Bar w={16} h={16} r="50%" />
          <span>Loading more…</span>
        </>
      ) : hasMore ? (
        <span>Scroll for more</span>
      ) : count > 0 ? (
        <span>
          {count} {count === 1 ? noun : `${noun}s`} — that's everything
        </span>
      ) : null}
    </div>
  )
}

// Note and task bodies. GHL's editor is rich text, so these are stored as
// markup — render them as HTML rather than showing the user raw tags.
//
// The plain-text toggle is there because markup isn't always wanted: copying a
// note into an email, or reading a body whose formatting is noise rather than
// meaning. Stripping happens here in the browser — no server round trip and
// nothing stored differently.
export function RichBody({
  html, maxWidth = 640, size = 'var(--text-md)',
  // Callers that pair this with a heading need it muted, so the two lines
  // separate by colour as well as size. Defaults to body text.
  color = 'var(--text-body)',
  // Paragraph-length bodies want more air between lines than a one-line
  // caption does. Overridable so a caller sizing the text up can loosen the
  // leading to match — the two have to move together or a bigger font just
  // reads as more crowded.
  leading = 1.5
}) {
  const [plain, setPlain] = useState(false)
  if (!html) return null

  const text = plain ? toPlainText(html) : null
  const base = {
    margin: 0, maxWidth,
    fontSize: size, lineHeight: leading, color
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      {plain ? (
        <p style={{ ...base, whiteSpace: 'pre-line' }}>{text}</p>
      ) : (
        <div
          className="pp-rich"
          style={{ ...base, overflowWrap: 'anywhere' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      {/* Only when stripping would change what you read — not merely when
          markup exists. See hasMeaningfulFormatting. */}
      {hasMeaningfulFormatting(html) && (
        <button
          onClick={() => setPlain((v) => !v)}
          style={{
            justifySelf: 'start',
            border: 'none', background: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--text-link)', textDecoration: 'underline'
          }}
        >
          {plain ? 'Show formatted' : 'Show plain text'}
        </button>
      )}
    </div>
  )
}

// Whether stripping the markup would actually change what you READ.
//
// Every GHL body arrives wrapped in <p style="...">, so hasMarkup() is true for
// all of them and the toggle appeared on every single note and task — a
// permanent line of chrome for an escape hatch almost nobody uses.
//
// This asks the narrower question: is there formatting worth toggling? A single
// wrapper paragraph is not; a list, a link, bold text or several blocks is.
function hasMeaningfulFormatting(html) {
  const raw = String(html || '')
  if (!raw) return false
  if (/<(ul|ol|li|table|a|strong|b|em|i|u|code|pre|blockquote|h[1-6]|img|br)\b/i.test(raw)) {
    return true
  }
  // More than one block element means real paragraph structure.
  const blocks = raw.match(/<(p|div)\b/gi) || []
  return blocks.length > 1
}

// Browser-native parse — no dependency, and the same engine that rendered the
// markup above does the stripping.
function toPlainText(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  doc.querySelectorAll('script, style').forEach((el) => el.remove())
  // Block boundaries become newlines, or every paragraph runs together.
  doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'))
  doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6')
    .forEach((el) => el.append('\n'))
  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Sort control. Square and small — deliberately unlike the pill FilterChips,
// because sorting and filtering do different things and shouldn't look alike.
//
// Not used by Tasks or Notes: the v5 design has no sort on those pages. Kept
// here for the list pages the spec does call for (Deals, Contacts).
export function SortButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 26, padding: '0 9px', cursor: 'pointer',
        border: active
          ? '1px solid var(--brand-primary)'
          : '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--brand-primary)' : '#fff',
        color: active ? '#fff' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-sm)', fontWeight: active ? 600 : 400
      }}
    >
      {label}
    </button>
  )
}

// A note linked to a task or another note (migration 054). Gold, matching the
// Notes accent, so a linked note is recognisable wherever it appears.
export function NoteChip({ label, onClick }) {
  return (
    <span
      title={label}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
        maxWidth: 240,
        padding: '3px 9px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--tint-gold)', color: 'var(--text-body)',
        fontSize: 'var(--text-sm)', fontWeight: 500,
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <span className="ms" style={{ fontSize: 12, color: 'var(--accent-gold)' }}>
        sticky_note_2
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </span>
  )
}
