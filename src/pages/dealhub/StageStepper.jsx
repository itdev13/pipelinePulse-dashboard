import React from 'react'

// Chevron stage stepper — one segment per stage in the deal's pipeline.
// Past stages fill green-600, current fills gray-800 (dark), future fills
// gray-100. Chevron shape is a clip-path polygon; each segment overlaps
// the next by 14px (the notch depth) so the arrows nest cleanly.
//
// stages: [{ name, isCurrent, isPast }]
export default function StageStepper({ stages, onStageClick }) {
  if (!stages || stages.length === 0) return null

  const notch = 14
  const seg = stages.length

  return (
    <div
      style={{
        display: 'flex',
        borderTop: '1px solid var(--border-default)',
        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
        // Clip only the stepper itself so chevrons don't bleed past the
        // rounded corners. Kept off the parent card so the deal-switcher
        // dropdown can hang below without being clipped.
        overflow: 'hidden'
      }}
    >
      {stages.map((s, i) => {
        const isFirst = i === 0
        const isLast = i === seg - 1
        // The chevron clip-path — each segment ends in a pointed arrow, and
        // (unless first) starts with a notched indent matching the previous
        // segment's tail.
        const clip = isFirst
          ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%)`
          : isLast
          ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${notch}px 50%)`
          : `polygon(0 0, calc(100% - ${notch}px) 0, 100% 50%, calc(100% - ${notch}px) 100%, 0 100%, ${notch}px 50%)`

        // Progression reads left to right: completed stages are a light tint,
        // the current one is solid brand, upcoming ones are grey.
        //
        // Previously "current" was near-black and past stages were solid dark
        // green, which made the stepper the heaviest element on the page — two
        // dark blocks shouting above the deal it describes. Inverting it (tint
        // for done, solid for now) puts the emphasis on where the deal IS.
        const bg = s.isCurrent
          ? 'var(--brand-primary)'
          : s.isPast
          ? 'var(--green-50)'
          : 'var(--gray-50)'
        const fg = s.isCurrent
          ? '#fff'
          : s.isPast
          ? 'var(--green-700)'
          : 'var(--text-muted)'

        return (
          <button
            key={s.name + i}
            onClick={() => onStageClick && onStageClick(s)}
            title={
              s.isCurrent
                ? 'Current stage'
                : onStageClick
                ? `Move deal to ${s.name}`
                : s.name
            }
            style={{
              flex: 1,
              minWidth: 0,
              cursor: onStageClick ? 'pointer' : 'default',
              border: 'none',
              height: 40,
              padding: `0 12px 0 ${isFirst ? 12 : 24}px`,
              marginLeft: isFirst ? 0 : -notch,
              clipPath: clip,
              background: bg,
              color: fg,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-md)',
              fontWeight: s.isCurrent ? 600 : 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'background 0.15s ease-out'
            }}
          >
            {s.name}
          </button>
        )
      })}
    </div>
  )
}
