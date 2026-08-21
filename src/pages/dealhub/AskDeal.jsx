import React, { useEffect, useMemo, useRef, useState } from 'react'
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

export default function AskDeal({ dealId, onAsk, onJumpToMessage, beforeAsk, messages = [] }) {
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

  // Past chats for this deal, from ai_runs. Loading these is what makes the
  // panel resumable across reloads.
  const [history, setHistory] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [activeChatId, setActiveChatId] = useState(null)
  const [toast, setToast] = useState(null)
  // Per-question channel scope. Transient: narrows this answer only, never
  // changes the stored inclusion state the timeline checkboxes drive.
  const [channels, setChannels] = useState([])
  // Which run's "messages considered" modal is open.
  const [inspectRunId, setInspectRunId] = useState(null)
  // Per-channel counts of what the AI would read right now, derived from the
  // live timeline rows. Deliberately NOT fetched from the server: the
  // inclusion checkbox is optimistic and batched, so a server count would lag
  // behind unflushed ticks — and the stale number is precisely the one the rep
  // is reading while deciding what to ask.
  const scope = useMemo(() => {
    const byChannel = {}
    let readable = 0
    let untranscribedCalls = 0
    let excluded = 0
    let notes = 0
    let total = 0

    for (const m of messages) {
      // Events (opp created, DND enabled, …) aren't evidence and have no
      // checkbox — they're not part of what the AI reads.
      if (m.event) continue
      total++
      if (!m.included) { excluded++; continue }
      if (!m.readable) { untranscribedCalls++; continue }
      if (m.channel === 'NOTE') { notes++; readable++; continue }
      const key = String(m.channel || '').toLowerCase()
      byChannel[key] = (byChannel[key] || 0) + 1
      readable++
    }

    const unreadReasons = []
    if (untranscribedCalls > 0) {
      unreadReasons.push(
        `${untranscribedCalls} call${untranscribedCalls === 1 ? '' : 's'} not transcribed`
      )
    }
    if (excluded > 0) {
      unreadReasons.push(`${excluded} excluded`)
    }

    return {
      readable,
      notes,
      byChannel,
      coverage: { messagesTotal: total, messagesRead: readable, unreadReasons }
    }
  }, [messages])

  const loadHistory = () => {
    if (!dealId) return Promise.resolve()
    return aiAPI.askHistory(dealId)
      .then((r) => setHistory(r.chats || []))
      .catch(() => {})
  }

  // Switching deals clears the live transcript — the thread it was grounded
  // in is gone — and pulls that deal's own history.
  useEffect(() => {
    setTurns([])
    setError(null)
    setQ('')
    setActiveChatId(null)
    setHistory([])
    setChannels([])
    setInspectRunId(null)
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId])

  // Reopen a past chat into the live transcript. It becomes the conversation,
  // so a follow-up carries its context.
  const reopen = (chat) => {
    setTurns([
      { role: 'user', content: chat.question },
      {
        role: 'assistant',
        answerText: chat.answerText,
        citations: chat.citations || [],
        confidence: chat.confidence,
        answered: chat.answered,
        coverage: chat.coverage,
        cached: true,
        runId: chat.id,
        readMessageIds: chat.readMessageIds || []
      }
    ])
    setActiveChatId(chat.id)
    setError(null)
    setToast('Chat reopened')
    window.setTimeout(() => setToast(null), 2200)
  }

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

    // Flush any pending include/exclude ticks first. The server derives the
    // message set itself, so an unsaved checkbox would silently not apply to
    // this question.
    if (beforeAsk) {
      try { await beforeAsk() } catch (err) { /* the toggle rolls itself back */ }
    }

    // Send only prior *answered* turns as history, so a failed attempt
    // doesn't poison the follow-up context.
    const history = turns
      .filter((t) => t.role === 'user' || (t.role === 'assistant' && t.answerText))
      .map((t) => ({
        role: t.role,
        content: t.role === 'user' ? t.content : t.answerText
      }))

    try {
      const res = await aiAPI.ask(dealId, {
        question: value,
        history,
        channels: channels.length ? channels : null
      })
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
          runId: res.runId,
          readMessageIds: res.readMessageIds || [],
          channelScope: res.channelScope || null
        }
      ])
      setActiveChatId(res.runId)
      // The answer is now a resumable chat — pull it into the list.
      loadHistory()
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
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
        gap: 14,
        // Both panels stretch to the taller of the two (grid default), and the
        // Ask panel's inner flex column then pins its composer to the bottom
        // of that height. A floor keeps the composer low even on a deal with no
        // chat history yet, where the Prompts column would otherwise set a
        // short height.
        minHeight: 420,
        alignItems: 'stretch'
      }}
    >
      {inspectRunId && (
        <MessagesConsideredModal
          runId={inspectRunId}
          onClose={() => setInspectRunId(null)}
          onJumpToMessage={onJumpToMessage}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'absolute', right: 0, bottom: -6,
            zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 14px',
            borderRadius: 'var(--radius-md)',
            background: '#fff',
            boxShadow: 'var(--shadow-overlay)',
            fontSize: 13, color: 'var(--text-heading)'
          }}
        >
          <span className="ms" style={{ fontSize: 17, color: 'var(--status-done)' }}>
            check_circle
          </span>
          {toast}
        </div>
      )}
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

        <div
          style={{
            padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
            // Fill the panel: the transcript takes the slack (min-height 0 so
            // it can shrink and scroll), the composer is pinned below it.
            flex: 1, minHeight: 0
          }}
        >
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
                // Takes whatever height is going and scrolls inside itself, so
                // a long conversation never pushes the composer off-panel.
                flex: 1, minHeight: 0, overflowY: 'auto'
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
                  <Answer
                    key={i}
                    turn={t}
                    onJumpToMessage={onJumpToMessage}
                    onInspect={t.runId ? () => setInspectRunId(t.runId) : undefined}
                  />
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

          {/* Composer — pinned to the bottom of the panel. marginTop:auto does
              the pinning when the transcript is empty; once it has content the
              transcript's flex:1 has already claimed the space. */}
          <div style={{ marginTop: 'auto', flex: 'none', display: 'grid', gap: 10 }}>
          <ChannelScope value={channels} onChange={setChannels} scope={scope} />

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

          <ChatHistory
            chats={history}
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
            activeId={activeChatId}
            onReopen={reopen}
            onInspect={setInspectRunId}
          />
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
// Past Q&A for this deal, collapsed by default. Clicking one reopens it into
// the live transcript so a follow-up carries its context.
//
// Server-backed (ai_runs), not session state — that's the whole point: a rep
// who reloads, switches deals and comes back, or picks the deal up tomorrow
// still has the thread of what was already asked.
function ChatHistory({ chats, open, onToggle, activeId, onReopen, onInspect }) {
  if (!chats || chats.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', width: '100%',
          padding: '10px 12px',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-sunken)',
          fontFamily: 'var(--font-sans)', textAlign: 'left'
        }}
      >
        <span className="ms" style={{ fontSize: 17, color: 'var(--text-muted)' }}>history</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-body)' }}>
          Chat history
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
          {chats.length} {chats.length === 1 ? 'chat' : 'chats'}
        </span>
        <span className="ms" style={{ fontSize: 18, color: 'var(--text-faint)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div style={{ display: 'grid', gap: 6 }}>
          {chats.map((c) => {
            const active = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => onReopen(c)}
                title="Reopen this chat"
                style={{
                  display: 'grid', gap: 3,
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                  padding: '10px 12px',
                  border: active
                    ? '1.5px solid var(--brand-primary)'
                    : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: active ? 'var(--surface-selected)' : '#fff',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      flex: 1, minWidth: 0,
                      fontSize: 13, fontWeight: 600, color: 'var(--text-heading)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                  >
                    {c.question}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', flex: 'none' }}>
                    {askedAtLabel(c.askedAt)}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 12, lineHeight: 1.45, color: 'var(--text-muted)',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}
                >
                  {c.answerText}
                </span>
                {c.readMessageIds?.length > 0 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onInspect(c.id) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation(); onInspect(c.id)
                      }
                    }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      marginTop: 2, cursor: 'pointer',
                      fontSize: 11, color: 'var(--text-link)'
                    }}
                  >
                    <span className="ms" style={{ fontSize: 13 }}>visibility</span>
                    {c.readMessageIds.length} message
                    {c.readMessageIds.length === 1 ? '' : 's'} considered · show more
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// "Yesterday · 16:20" near now, an absolute date further back — matching how
// the design words it.
function askedAtLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.round((startOfToday - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return time
  if (days === 1) return `Yesterday · ${time}`
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${time}`
}

// One answer turn: prose, the coverage stamp, and clickable citations.
//
// The coverage stamp is rendered above every AI output per spec §1F — it is
// computed server-side in app code, never asked of the model, so it cannot be
// hallucinated. It's also what makes a thin answer trustworthy: "read 6 of 8,
// 2 calls not transcribed" tells the rep why the answer is thin.
function Answer({ turn, onJumpToMessage, onInspect }) {
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
      {cov && (
        <CoverageStamp
          coverage={cov}
          cached={turn.cached}
          confidence={turn.confidence}
          readMessageIds={turn.readMessageIds}
          channelScope={turn.channelScope}
          onInspect={onInspect}
        />
      )}

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

function CoverageStamp({ coverage, cached, confidence, readMessageIds, channelScope, onInspect }) {
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
      <span
        title={
          readMessageIds?.length
            ? `Message ids read:\n${readMessageIds.join('\n')}`
            : undefined
        }
        style={{ cursor: readMessageIds?.length ? 'help' : 'default' }}
      >
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
      {channelScope?.length > 0 && (
        <span
          title="This answer was scoped to these channels"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '1px 7px', borderRadius: 'var(--radius-pill)',
            background: 'var(--tint-teal)', color: 'var(--accent-teal)',
            fontWeight: 600
          }}
        >
          <span className="ms" style={{ fontSize: 12 }}>filter_alt</span>
          {channelScope.map((c) => c.toUpperCase()).join(' · ')}
        </span>
      )}
      {onInspect && (
        <button
          onClick={onInspect}
          style={{
            border: 'none', background: 'none', padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 11.5,
            color: 'var(--text-link)', textDecoration: 'underline'
          }}
        >
          Show more
        </button>
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

// Per-question channel scope. "Ask about SMS only" without touching the
// standing inclusion state the timeline checkboxes drive — two different
// ideas, so two different controls.
//
// Nothing selected means every channel, which is why there's no explicit
// "All" chip: an empty selection already says it, and an All chip that
// deselects everything else invites the "did I mean none?" confusion.
const SCOPE_CHANNELS = [
  ['email', 'Email', 'mail'],
  ['sms', 'SMS', 'sms'],
  ['whatsapp', 'WhatsApp', 'chat'],
  ['call', 'Calls', 'call'],
  ['note', 'Notes', 'sticky_note_2']
]

function ChannelScope({ value, onChange, scope }) {
  const toggle = (key) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key])

  const counts = scope?.byChannel || {}
  // Notes aren't a message channel in the payload — they're separate evidence
  // — so their count comes from its own field.
  const countFor = (key) => (key === 'note' ? scope?.notes ?? null : counts[key] ?? null)

  // How many messages this question will actually read. Nothing selected means
  // everything, which is the number a rep most wants to see before asking.
  const selectedCount = value.length === 0
    ? scope?.readable ?? null
    : value.reduce((n, k) => n + (countFor(k) || 0), 0)

  // Only offer channels that exist on this deal — a chip reading "Email · 0"
  // is a dead end, and offering it invites an empty answer.
  const available = SCOPE_CHANNELS.filter(([key]) => {
    if (!scope) return true          // pre-load: show all rather than flicker
    return (countFor(key) || 0) > 0
  })

  if (scope && available.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span
        style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2
        }}
      >
        Ask about
      </span>
      {available.map(([key, label, icon]) => {
        const on = value.includes(key)
        const n = countFor(key)
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            title={
              n != null
                ? `${n} ${label} message${n === 1 ? '' : 's'} the AI can read — ` +
                  'excludes unticked rows and calls without a transcript, so this ' +
                  'can be lower than the timeline filter above'
                : undefined
            }
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer',
              height: 26, padding: '0 10px',
              border: on ? '1.5px solid var(--accent-teal)' : '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: on ? 'var(--tint-teal)' : '#fff',
              color: on ? 'var(--accent-teal)' : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 11.5, fontWeight: on ? 600 : 400
            }}
          >
            <span className="ms" style={{ fontSize: 13 }}>{icon}</span>
            {label}
            {n != null && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5,
                  opacity: 0.75
                }}
              >
                {n}
              </span>
            )}
          </button>
        )
      })}

      {/* The number that matters: what this question will read. */}
      {selectedCount != null && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 600,
            color: selectedCount === 0 ? 'var(--status-stuck)' : 'var(--text-muted)'
          }}
        >
          <span className="ms" style={{ fontSize: 13 }}>visibility</span>
          {selectedCount} message{selectedCount === 1 ? '' : 's'}
          {value.length === 0 && ' (all channels)'}
        </span>
      )}

      {value.length > 0 && (
        <button
          onClick={() => onChange([])}
          style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 11,
            color: 'var(--text-link)', textDecoration: 'underline'
          }}
        >
          clear
        </button>
      )}

      {/* Excluded / unreadable messages are worth naming here too, so a low
          count doesn't look like missing data. */}
      {scope?.coverage?.unreadReasons?.length > 0 && (
        <span style={{ fontSize: 10.5, color: 'var(--accent-clay)' }}>
          · {scope.coverage.unreadReasons.join(' · ')}
        </span>
      )}
    </div>
  )
}

// "What did this answer actually read?" — resolved from the ids stored on the
// run, not recomputed from the deal. So an old chat shows what it truly read
// even after the thread has grown or the inclusion state changed.
function MessagesConsideredModal({ runId, onClose, onJumpToMessage }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    aiAPI.runMessages(runId)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setErr(e.message || 'Could not load messages'))
    return () => { alive = false }
  }, [runId])

  // Escape to close — a modal you can only dismiss by aiming at a small × is
  // a modal people fight with.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        background: 'rgba(31, 36, 48, 0.45)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 100%)', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          borderRadius: 'var(--radius-lg)',
          background: '#fff', boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)', marginTop: 1 }}>
            visibility
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              Messages considered
            </h3>
            {data && (
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
                {data.items.length} of {data.messagesTotal} on this deal
                {data.unreadReasons?.length > 0 && ` · ${data.unreadReasons.join(' · ')}`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2
            }}
          >
            <span className="ms" style={{ fontSize: 20 }}>close</span>
          </button>
        </header>

        {data?.question && (
          <p
            style={{
              margin: 0, padding: '10px 16px',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--gray-50)',
              fontSize: 13, color: 'var(--text-body)'
            }}
          >
            <strong style={{ fontWeight: 600 }}>Asked:</strong> {data.question}
          </p>
        )}

        <div style={{ overflowY: 'auto', padding: '8px 0' }}>
          {err && (
            <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--status-stuck)' }}>
              {err}
            </p>
          )}
          {!data && !err && (
            <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              Loading…
            </p>
          )}
          {data?.items?.length === 0 && (
            <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              This answer read no messages — it was based on the deal facts alone.
            </p>
          )}
          {data?.items?.map((m) => (
            <button
              key={`${m.kind}-${m.id}`}
              onClick={() => {
                if (m.kind === 'message' && onJumpToMessage) {
                  onJumpToMessage(m.id)
                  onClose()
                }
              }}
              style={{
                display: 'grid', gap: 3, width: '100%', textAlign: 'left',
                padding: '10px 16px',
                border: 'none',
                borderBottom: '1px solid var(--border-default)',
                background: '#fff',
                cursor: m.kind === 'message' && onJumpToMessage ? 'pointer' : 'default',
                fontFamily: 'var(--font-sans)'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 9.5, fontWeight: 600, letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--gray-100)', color: 'var(--text-muted)'
                  }}
                >
                  {m.channel}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {m.direction === 'in' ? 'In ←' : '→ Out'}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-heading)' }}>
                  {m.who}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
                  {shortDate(m.at)}
                </span>
              </span>
              <span
                style={{
                  fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-body)',
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}
              >
                {m.body || '(no readable text)'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function shortDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
