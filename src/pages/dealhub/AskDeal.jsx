import React, { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../api/ai'
import { SkeletonStyles, Bar } from '../shared/ListChrome'

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

export default function AskDeal({ dealId, onAsk, onJumpToMessage }) {
  const [q, setQ] = useState('')
  // Transcript of this deal's Q&A. Client-held: it's scratch context for
  // follow-ups, and every question is already persisted server-side in
  // ai_runs for the audit trail.
  const [turns, setTurns] = useState([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [available, setAvailable] = useState(null)
  const scrollRef = useRef(null)

  // Is the AI layer configured at all? Without this the panel would offer a
  // button that always 503s.
  useEffect(() => {
    let alive = true
    aiAPI.status()
      .then((r) => alive && setAvailable(!!r.available))
      .catch(() => alive && setAvailable(false))
    return () => { alive = false }
  }, [])

  // Switching deals resets the conversation — the thread it was grounded in
  // is gone.
  useEffect(() => {
    setTurns([])
    setError(null)
    setQ('')
  }, [dealId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns, pending])

  const submit = async (override) => {
    const value = String(override ?? q).trim()
    if (!value || pending) return
    if (onAsk) onAsk(value)

    setQ('')
    setError(null)
    setPending(true)
    // Show the question immediately; the answer lands under it.
    setTurns((t) => [...t, { role: 'user', content: value }])

    // Send only prior *answered* turns as history, so a failed attempt
    // doesn't poison the follow-up context.
    const history = turns
      .filter((t) => t.role === 'user' || (t.role === 'assistant' && t.answerText))
      .map((t) => ({
        role: t.role,
        content: t.role === 'user' ? t.content : t.answerText
      }))

    try {
      const res = await aiAPI.ask(dealId, { question: value, history })
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          answerText: res.answerText,
          citations: res.citations || [],
          confidence: res.confidence,
          answered: res.answered !== false,
          coverage: res.coverage,
          cached: res.cached,
          runId: res.runId
        }
      ])
    } catch (err) {
      // Named failure states, never a permanent spinner (spec §5).
      const code = err.code
      setError(
        code === 'AI_NOT_CONFIGURED'
          ? 'The AI layer is not configured on the server yet.'
          : code === 'TIMEOUT'
          ? 'The model took too long. Try again — long threads can be slow.'
          : code === 'MALFORMED'
          ? 'The model returned something unreadable. Try rephrasing the question.'
          : code === 'RATE_LIMITED'
          ? 'Rate limited. Wait a moment and try again.'
          : err.message || 'Could not get an answer.'
      )
    } finally {
      setPending(false)
    }
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
          {turns.length === 0 && (
            <p
              style={{
                margin: 0, padding: '10px 12px',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)'
              }}
            >
              Ask a question about this deal, or pick a prompt on the right.
              Answers read only the included messages, and every claim carries a
              quote you can click through to.
            </p>
          )}

          {available === false && (
            <p
              style={{
                margin: 0, padding: '10px 12px',
                borderLeft: '3px solid var(--status-working)',
                background: 'var(--tint-gold)',
                fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-body)'
              }}
            >
              The AI layer is not configured on this server yet — set
              ANTHROPIC_API_KEY to enable it.
            </p>
          )}

          {(turns.length > 0 || pending) && (
            <div
              ref={scrollRef}
              style={{
                display: 'grid', gap: 12,
                maxHeight: 420, overflowY: 'auto'
              }}
            >
              {turns.map((t, i) =>
                t.role === 'user' ? (
                  <p
                    key={i}
                    style={{
                      margin: 0, justifySelf: 'end', maxWidth: '85%',
                      padding: '9px 13px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-selected)',
                      color: 'var(--text-heading)',
                      fontSize: 13.5, lineHeight: 1.5
                    }}
                  >
                    {t.content}
                  </p>
                ) : (
                  <Answer key={i} turn={t} onJumpToMessage={onJumpToMessage} />
                )
              )}
              {pending && <Thinking />}
            </div>
          )}

          {error && (
            <p
              style={{
                margin: 0, padding: '10px 12px',
                borderLeft: '3px solid var(--status-stuck)',
                background: 'var(--tint-rose)',
                fontSize: 12.5, lineHeight: 1.5, color: 'var(--status-stuck)'
              }}
            >
              {error}
            </p>
          )}

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
              disabled={pending || available === false}
              placeholder={
                pending ? 'Reading the thread…' : 'e.g. why has this deal stalled?'
              }
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
            {(() => {
              const ready = !!q.trim() && !pending && available !== false
              return (
                <button
                  onClick={() => submit()}
                  disabled={!ready}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    cursor: ready ? 'pointer' : 'not-allowed',
                    height: 40, padding: '0 20px',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    background: ready ? 'var(--brand-primary)' : 'var(--gray-200)',
                    color: '#fff',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14, fontWeight: 600,
                    transition: 'background 0.15s ease-out'
                  }}
                >
                  {pending ? 'Reading…' : 'Ask'}
                </button>
              )
            })()}
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

// One answer turn: prose, the coverage stamp, and clickable citations.
//
// The coverage stamp is rendered above every AI output per spec §1F — it is
// computed server-side in app code, never asked of the model, so it cannot be
// hallucinated. It's also what makes a thin answer trustworthy: "read 6 of 8,
// 2 calls not transcribed" tells the rep why the answer is thin.
function Answer({ turn, onJumpToMessage }) {
  const cov = turn.coverage
  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--accent-teal)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      {cov && <CoverageStamp coverage={cov} cached={turn.cached} confidence={turn.confidence} />}

      <p
        style={{
          margin: 0, padding: '12px 14px',
          fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-body)',
          whiteSpace: 'pre-line'
        }}
      >
        {turn.answerText}
      </p>

      {turn.citations?.length > 0 && (
        <div
          style={{
            padding: '10px 14px 12px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--gray-25)'
          }}
        >
          <span
            style={{
              display: 'block', marginBottom: 7,
              fontSize: 10, fontWeight: 600, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            {turn.citations.length === 1 ? 'Evidence' : `Evidence · ${turn.citations.length}`}
          </span>
          <div style={{ display: 'grid', gap: 6 }}>
            {turn.citations.map((c, i) => (
              <button
                key={`${c.messageId}-${i}`}
                onClick={() => onJumpToMessage && onJumpToMessage(c.messageId)}
                title={onJumpToMessage ? 'Jump to this message in the timeline' : undefined}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  textAlign: 'left', width: '100%',
                  padding: '7px 9px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  background: '#fff',
                  cursor: onJumpToMessage ? 'pointer' : 'default',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                <span
                  className="ms"
                  style={{ fontSize: 14, color: 'var(--accent-teal)', flex: 'none', marginTop: 1 }}
                >
                  format_quote
                </span>
                <span
                  style={{
                    fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-body)',
                    fontStyle: 'italic'
                  }}
                >
                  {c.quoteText}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* An answer with no citations is either "the thread doesn't say" — a
          valid answer — or a claim we could not verify. Say which. */}
      {turn.citations?.length === 0 && turn.answered && (
        <p
          style={{
            margin: 0, padding: '8px 14px 12px',
            fontSize: 11.5, color: 'var(--text-muted)'
          }}
        >
          No verifiable quote was attached to this answer — treat it with care.
        </p>
      )}
    </div>
  )
}

function CoverageStamp({ coverage, cached, confidence }) {
  const partial =
    coverage.messagesRead != null &&
    coverage.messagesTotal != null &&
    coverage.messagesRead < coverage.messagesTotal

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '7px 14px',
        borderBottom: '1px solid var(--border-default)',
        background: partial ? 'var(--tint-gold)' : 'var(--gray-50)',
        fontSize: 11.5, color: 'var(--text-muted)'
      }}
    >
      <span className="ms" style={{ fontSize: 14 }}>
        {partial ? 'visibility_off' : 'visibility'}
      </span>
      <span>
        Read {coverage.messagesRead} of {coverage.messagesTotal}{' '}
        {coverage.messagesTotal === 1 ? 'message' : 'messages'}
      </span>
      {coverage.unreadReasons?.length > 0 && (
        <span style={{ color: 'var(--accent-clay)' }}>
          · {coverage.unreadReasons.join(' · ')}
        </span>
      )}
      {confidence && confidence !== 'high' && (
        <span
          style={{
            padding: '1px 7px', borderRadius: 'var(--radius-pill)',
            background: confidence === 'low' ? 'var(--tint-rose)' : 'var(--tint-gold)',
            color: confidence === 'low' ? 'var(--status-stuck)' : 'var(--accent-gold)',
            fontWeight: 600
          }}
        >
          {confidence} confidence
        </span>
      )}
      {cached && (
        <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>cached</span>
      )}
    </div>
  )
}

function Thinking() {
  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--accent-teal)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        padding: '12px 14px', display: 'grid', gap: 8
      }}
    >
      <SkeletonStyles />
      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        Reading the thread…
      </span>
      <Bar w="88%" h={11} />
      <Bar w="72%" h={11} />
      <Bar w="54%" h={11} />
    </div>
  )
}
