import React from 'react'
import { Truncate } from '../shared/ListChrome'

// The pipeline as a row of chevrons, across the foot of the deal card.
//
// Replaces nothing — the stage PICKER stays, because it is how a stage is
// chosen from a pipeline of a dozen similarly-named entries. This answers a
// different question: where is this deal, and how far is left? A select shows
// one value and hides the shape of the pipeline around it.
//
// The server already decides what is behind us: /deals/:id/stages returns
// isPast and isCurrent per stage, with the current index resolved against the
// deal's stage NAME and a virtual entry inserted when the pipeline no longer
// holds it. So this renders that answer rather than recomputing it — two
// definitions of "past" would eventually disagree.
//
// CLICKING A CHEVRON MOVES THE DEAL, which is why a stage with no id (the
// virtual entry) is rendered but not clickable: GHL's update endpoint takes
// pipelineStageId and accepts no name, so there is nothing to send.
export default function StageBar({ stages = [], onMove, saving = false }) {
  if (!stages.length) return null

  return (
    <div
      role="list"
      aria-label="Pipeline stages"
      style={{
        display: 'flex',
        overflow: 'hidden',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      {stages.map((s, i) => {
        const first = i === 0
        const last = i === stages.length - 1
        const movable = !!s.id && !s.isCurrent && typeof onMove === 'function'

        // The arrow is cut from the box itself rather than drawn beside it:
        // a border triangle cannot follow a background that changes per state,
        // and an SVG per stage would not stretch with a flexed width.
        //
        // The LAST chevron keeps a flat right edge — a final arrow points out
        // of the card at nothing, which reads as a step that is missing.
        const clip = last
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : first
            ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
            : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)'

        const bg = s.isCurrent
          ? 'var(--panel-head-pine, var(--accent-pine))'
          : s.isPast
            ? 'var(--green-700)'
            : 'var(--gray-100)'
        const fg = s.isCurrent || s.isPast ? '#fff' : 'var(--text-muted)'

        return (
          <Truncate
            as="button"
            key={s.id || `${s.name}-${i}`}
            type="button"
            role="listitem"
            aria-current={s.isCurrent ? 'step' : undefined}
            disabled={!movable || saving}
            onClick={movable ? () => onMove(s.id) : undefined}
            title={s.isCurrent
              ? `${s.name} — current stage`
              : movable ? `Move this deal to ${s.name}` : s.name}
            style={{
              flex: 1, minWidth: 0,
              height: 56,
              // The left inset clears the notch cut into this chevron's own
              // left edge; the first has no notch, so it needs none.
              padding: first ? '0 12px 0 16px' : '0 12px 0 26px',
              // Pulls each chevron back over its neighbour's point, so the
              // arrow sits INSIDE the previous box rather than leaving a gap.
              marginLeft: first ? 0 : -14,
              border: 'none',
              background: bg,
              color: fg,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-md)',
              fontWeight: s.isCurrent ? 600 : 500,
              cursor: movable && !saving ? 'pointer' : 'default',
              clipPath: clip
            }}
          >
            {s.name}
          </Truncate>
        )
      })}
    </div>
  )
}
