import React, { useState } from 'react'

// Deal Hub — Ask this deal panel.
//
// Two-column composition:
//   Left  · a free-text question box scoped to this deal's included messages
//   Right · five curated prompts written for a sales manager reviewing the
//           deal (next step, biggest risk, undelivered promises, missing
//           qualification, coaching the rep on price objections).
//
// Backend wiring lands next — for now the ask box just captures locally and
// the prompt cards echo the pick into the ask box so the manager can edit
// before hitting Ask. `onAsk` is the single seam that will call the LLM
// endpoint once it exists; nothing else in this file cares which model
// answers.
//
// Every prompt has its own accent (pine / rose / clay / gold / plum). The
// accent is applied to the icon chip + a subtle left rule; the card body
// stays neutral so a row of five cards doesn't turn into a rainbow.

const PROMPTS = [
  {
    id: 'next-step',
    icon: 'arrow_forward',
    accent: 'pine',
    label: 'What should I do next?',
    hint: 'Fills the next step and drafts a message'
  },
  {
    id: 'risk',
    icon: 'warning',
    accent: 'rose',
    label: 'What is the biggest risk here?',
    hint: 'Reads the included messages'
  },
  {
    id: 'promises',
    icon: 'handshake',
    accent: 'clay',
    label: 'What have we promised and not delivered?',
    hint: 'Checks commitments against the timeline'
  },
  {
    id: 'qualification',
    icon: 'rule',
    accent: 'gold',
    label: 'What qualification is still missing?',
    hint: 'Against the gate for this stage'
  },
  {
    id: 'coaching',
    icon: 'psychology',
    accent: 'plum',
    label: 'How should the rep handle the price objection?',
    hint: 'Coaching view for the manager'
  }
]

export default function AskDeal({ dealId, chatCount = 0, onAsk }) {
  const [q, setQ] = useState('')

  const submit = () => {
    const value = q.trim()
    if (!value) return
    if (onAsk) onAsk(value)
    // For now, just clear. Once the answer stream lands, we'll keep the
    // question in the transcript and reset the input.
    setQ('')
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
        gap: 14
      }}
    >
      {/* Left — Ask this deal */}
      <section
        style={{
          border: '2px solid var(--accent-teal)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          display: 'flex', flexDirection: 'column'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)' }}>
            forum
          </span>
          <h3
            style={{
              fontSize: 18, fontWeight: 600, color: 'var(--accent-teal)',
              margin: 0, flex: 1
            }}
          >
            Ask this deal
          </h3>
        </header>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p
            style={{
              margin: 0, padding: '10px 12px',
              background: 'var(--surface-sunken)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)'
            }}
          >
            Ask a question about this deal, or pick a prompt on the right.
            Answers read only the included messages.
          </p>

          <div
            style={{
              display: 'flex', alignItems: 'stretch', gap: 8
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="e.g. why has this deal stalled?"
              style={{
                flex: 1, minWidth: 0,
                height: 40, padding: '0 12px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 14,
                color: 'var(--text-body)'
              }}
            />
            <button
              onClick={submit}
              disabled={!q.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: q.trim() ? 'pointer' : 'not-allowed',
                height: 40, padding: '0 20px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: q.trim() ? 'var(--brand-primary)' : 'var(--gray-200)',
                color: '#fff',
                fontFamily: 'var(--font-sans)',
                fontSize: 14, fontWeight: 600,
                transition: 'background 0.15s ease-out'
              }}
            >
              Ask
            </button>
          </div>
        </div>
      </section>

      {/* Right — Prompts */}
      <section
        style={{
          border: '2px solid var(--accent-gold)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          display: 'flex', flexDirection: 'column'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-gold)' }}>
            bolt
          </span>
          <h3
            style={{
              fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)',
              margin: 0, flex: 1
            }}
          >
            Prompts
          </h3>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            For the manager
          </span>
        </header>

        <div
          style={{
            padding: 12, display: 'flex', flexDirection: 'column', gap: 8
          }}
        >
          {PROMPTS.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              onPick={() => setQ(p.label)}
            />
          ))}

          <ChatHistoryFooter count={chatCount} />
        </div>
      </section>
    </div>
  )
}

function PromptCard({ prompt, onPick }) {
  const accent = `var(--accent-${prompt.accent})`
  const tint = `var(--tint-${prompt.accent})`
  return (
    <button
      onClick={onPick}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr',
        gap: 12, alignItems: 'center',
        cursor: 'pointer',
        padding: '10px 12px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        textAlign: 'left',
        transition: 'background 0.15s ease-out, border-color 0.15s ease-out'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = tint
        e.currentTarget.style.borderColor = accent
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#fff'
        e.currentTarget.style.borderColor = 'var(--border-default)'
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32,
          borderRadius: 'var(--radius-sm)',
          background: tint, color: accent
        }}
      >
        <span className="ms" style={{ fontSize: 18 }}>{prompt.icon}</span>
      </span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 14, fontWeight: 600, color: 'var(--text-heading)'
          }}
        >
          {prompt.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {prompt.hint}
        </span>
      </span>
    </button>
  )
}

// Chat history is a placeholder — the transcript store lands with the
// backend wiring. The count is passed through so the footer already
// reflects state even though the drawer itself isn't built yet.
function ChatHistoryFooter({ count }) {
  return (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'pointer',
        padding: '10px 12px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-sunken)',
        fontFamily: 'var(--font-sans)',
        textAlign: 'left'
      }}
    >
      <span className="ms" style={{ fontSize: 17, color: 'var(--text-muted)' }}>history</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-body)', flex: 1 }}>
        Chat history
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {count} {count === 1 ? 'chat' : 'chats'}
      </span>
      <span className="ms" style={{ fontSize: 18, color: 'var(--text-faint)' }}>
        expand_more
      </span>
    </button>
  )
}
