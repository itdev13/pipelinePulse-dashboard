import React, { useEffect, useMemo, useRef, useState } from 'react'
import { aiAPI } from '../../api/ai'
import { SkeletonStyles, Bar } from '../shared/ListChrome'

// Deal Hub — Co-Pilot panel.
//
// Two-column composition:
//   Left  · chat history — past questions on this deal, server-backed
//   Right · Co-Pilot: starter chips, the transcript, and the composer
//
// The five starters are written for a sales manager reviewing the deal (next
// step, biggest risk, undelivered promises, missing qualification, coaching the
// rep on price objections). They were cards in the left rail; as chips in the
// Co-Pilot header they sit where the question actually gets asked.
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
  // `label` is the full question — it's what lands in the composer when picked.
  // `chipLabel` is the two-or-three-word form the chip shows; the full question
  // and the hint are both in the chip's tooltip.
  {
    id: 'next-step',
    icon: 'arrow_forward',
    accent: 'pine',
    chipLabel: 'Next step',
    label: 'What should I do next?',
    hint: 'Fills the next step and drafts a message'
  },
  {
    id: 'risk',
    icon: 'warning',
    accent: 'rose',
    chipLabel: 'Biggest risk',
    label: 'What is the biggest risk here?',
    hint: "Reads this deal's messages"
  },
  {
    id: 'promises',
    icon: 'handshake',
    accent: 'clay',
    chipLabel: 'Undelivered promises',
    label: 'What have we promised and not delivered?',
    hint: 'Checks commitments against the timeline'
  },
  {
    id: 'qualification',
    icon: 'rule',
    accent: 'gold',
    chipLabel: 'Missing qualification',
    label: 'What qualification is still missing?',
    hint: 'Against the gate for this stage'
  },
  {
    id: 'coaching',
    icon: 'psychology',
    accent: 'plum',
    chipLabel: 'Coach the rep',
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
  const [activeChatId, setActiveChatId] = useState(null)
  const [toast, setToast] = useState(null)
  // Per-question channel scope. Transient: narrows this answer only.
  const [channels, setChannels] = useState([])
  // Which run's "messages considered" modal is open.
  const [inspectRunId, setInspectRunId] = useState(null)
  // Per-channel counts of what the AI would read right now, derived from the
  // live timeline rows rather than fetched — the server count would lag a
  // channel toggle, and the stale number is precisely the one the rep is
  // reading while deciding what to ask.
  const scope = useMemo(() => {
    const byChannel = {}
    let readable = 0
    let untranscribedCalls = 0
    let notes = 0
    let total = 0

    for (const m of messages) {
      // Events (opp created, DND enabled, …) aren't evidence.
      if (m.event) continue
      // Tasks share the timeline but aren't conversation evidence, so they
      // don't belong in a message count. Notes DO count — they're written
      // context the agent reads.
      if (m.kind === 'task') continue
      total++
      if (!m.readable) { untranscribedCalls++; continue }
      if (m.channel === 'NOTE' || m.kind === 'note') { notes++; readable++; continue }
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
        // Chat history is the narrow rail, Co-Pilot the wide panel — the
        // conversation is the work, the history is navigation.
        gridTemplateColumns: 'minmax(240px, 0.9fr) minmax(0, 3fr)',
        gap: 14,
        // Both panels stretch to the taller of the two (grid default), and
        // Co-Pilot's inner flex column then pins its composer to the bottom of
        // that height. A floor keeps the composer low on a deal with no chat
        // history yet, where the rail would otherwise set a short height.
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
            fontSize: 'var(--text-md)', color: 'var(--text-heading)'
          }}
        >
          <span className="ms" style={{ fontSize: 17, color: 'var(--status-done)' }}>
            check_circle
          </span>
          {toast}
        </div>
      )}
      {/* Left rail — Chat history. Server-backed (ai_runs), so a rep who
          reloads or comes back tomorrow still has the thread of what was
          asked. */}
      <section
        style={{
          border: '2px solid var(--brand-primary)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          // The grid stretches both panels to the taller one, so without a cap
          // a long history would set the row height and never scroll — it would
          // just push Co-Pilot's composer further down the page. The cap is what
          // makes the overflow actually engage.
          maxHeight: 650
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 19, color: 'var(--brand-primary)' }}>
            history
          </span>
          <h3
            style={{
              fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--brand-primary)',
              margin: 0, flex: 1
            }}
          >
            Chat history
          </h3>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
            {history.length} {history.length === 1 ? 'chat' : 'chats'}
          </span>
        </header>

        {/* flex:1 + minHeight:0 lets the list shrink below its content height.
            Without the minHeight override a flex item refuses to shrink past
            its content and the overflow silently never engages. */}
        <div
          style={{
            // The whole rail is the history now that the starters have moved
            // into Co-Pilot's header as chips.
            flex: 1, minHeight: 0, overflowY: 'auto',
            padding: 12
          }}
        >
          <ChatHistory
            chats={history}
            activeId={activeChatId}
            onReopen={reopen}
            onInspect={setInspectRunId}
          />
        </div>

      </section>

      {/* Co-Pilot — the wide panel. */}
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
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)' }}>
            forum
          </span>
          <h3
            style={{
              fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--accent-teal)',
              margin: 0, flex: 1
            }}
          >
            Co-Pilot
          </h3>
        </header>

        {/* Starter chips. Moved out of the left rail — as full cards they took
            ~600px there and left the chat history one row tall. As chips they
            sit where the question gets asked, which is also where you'd reach
            for one. */}
        <div
          style={{
            display: 'flex', gap: 6, flexWrap: 'wrap',
            padding: '10px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--surface-sunken)'
          }}
        >
          {PROMPTS.map((p) => (
            <PromptChip key={p.id} prompt={p} onPick={() => setQ(p.label)} />
          ))}
        </div>

        <div
          style={{
            padding: 16, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
            // Fill the panel: the transcript takes the slack (min-height 0 so
            // it can shrink and scroll), the composer is pinned below it.
            flex: 1, minHeight: 0
          }}
        >
          {turns.length === 0 && (
            <p
              style={{
                margin: 0, padding: '10px var(--space-3)',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-md)', lineHeight: 1.5, color: 'var(--text-muted)'
              }}
            >
              Ask a question about this deal, or pick a prompt on the right.
              Answers read this deal's messages, and every claim carries a
              quote you can click through to.
            </p>
          )}

          {available === false && (
            <p
              style={{
                margin: 0, padding: '10px var(--space-3)',
                borderLeft: '3px solid var(--status-working)',
                background: 'var(--tint-gold)',
                fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-body)'
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
                display: 'grid', gap: 'var(--space-3)',
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
                      fontSize: 'var(--text-md)', lineHeight: 1.5
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
                margin: 0, padding: '10px var(--space-3)',
                borderLeft: '3px solid var(--status-stuck)',
                background: 'var(--tint-rose)',
                fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--status-stuck)'
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
              display: 'flex', alignItems: 'stretch', gap: 'var(--space-2)'
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
                height: 40, padding: '0 var(--space-3)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                background: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
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
                    fontSize: 'var(--text-lg)', fontWeight: 600,
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

    </div>
  )
}

// A starter as a chip: icon + short label, with the hint on hover.
//
// The old card carried a title and a description on two lines; a chip has room
// for neither, so `chipLabel` is the shortened form and the full question still
// goes into the composer when picked.
function PromptChip({ prompt, onPick }) {
  const accent = `var(--accent-${prompt.accent})`
  const tint = `var(--tint-${prompt.accent})`
  return (
    <button
      onClick={onPick}
      title={`${prompt.label} — ${prompt.hint}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: 'pointer',
        height: 30, padding: '0 11px 0 var(--space-2)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
        color: 'var(--text-body)',
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
      <span className="ms" style={{ fontSize: 16, color: accent }}>{prompt.icon}</span>
      {prompt.chipLabel || prompt.label}
    </button>
  )
}

function ChatHistory({ chats, activeId, onReopen, onInspect }) {
  if (!chats || chats.length === 0) {
    return (
      <p
        style={{
          margin: 0, padding: '10px var(--space-3)',
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-muted)'
        }}
      >
        No chats yet. Questions you ask are kept here, so you can pick the
        thread back up later.
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
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
                  padding: '10px var(--space-3)',
                  border: active
                    ? '1.5px solid var(--brand-primary)'
                    : '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  background: active ? 'var(--surface-selected)' : '#fff',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      flex: 1, minWidth: 0,
                      fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                  >
                    {c.question}
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)', flex: 'none' }}>
                    {askedAtLabel(c.askedAt)}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-base)', lineHeight: 1.45, color: 'var(--text-muted)',
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
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                      marginTop: 2, cursor: 'pointer',
                      fontSize: 'var(--text-sm)', color: 'var(--text-link)'
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
          margin: 0, padding: 'var(--space-3) 14px',
          fontSize: 'var(--text-md)', lineHeight: 1.6, color: 'var(--text-body)',
          whiteSpace: 'pre-line'
        }}
      >
        {turn.answerText}
      </p>

      {/* Quote attributions, inline under the prose — the mockup reads them
          as part of the answer, not as a separate evidence list. */}
      {turn.citations?.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'grid', gap: 6 }}>
          {turn.citations.map((c, i) => (
            <button
              key={`${c.messageId}-${i}`}
              onClick={() => onJumpToMessage && onJumpToMessage(c.messageId)}
              title={onJumpToMessage ? 'Jump to this message in the timeline' : undefined}
              style={{
                display: 'block', textAlign: 'left', width: '100%',
                padding: 0, border: 'none', background: 'none',
                cursor: onJumpToMessage ? 'pointer' : 'default',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-md)', lineHeight: 1.55, color: 'var(--text-body)'
              }}
            >
              <span style={{ fontStyle: 'italic' }}>&ldquo;{c.quoteText}&rdquo;</span>
              {c.sourceLabel && (
                <span style={{ color: 'var(--text-muted)' }}> — {c.sourceLabel}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* BASED ON — which messages the answer came from, and the verification
          line. The verification is a code-level guarantee, not a claim the
          model makes: each quote is checked character-exact against its source
          before the answer is shown, and anything unquotable is dropped. */}
      {turn.citations?.length > 0 && (
        <div
          style={{
            padding: '10px 14px var(--space-3)',
            borderTop: '1px solid var(--border-default)'
          }}
        >
          <span
            style={{
              display: 'block', marginBottom: 6,
              fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            Based on
          </span>
          <div style={{ display: 'grid', gap: 3 }}>
            {sourceLines(turn.citations).map((line) => (
              <span key={line} style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>
                {line}
              </span>
            ))}
          </div>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginTop: 7,
              fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
            }}
          >
            <span className="ms" style={{ fontSize: 14, color: 'var(--status-done)' }}>
              verified
            </span>
            {turn.citations.length}{' '}
            {turn.citations.length === 1 ? 'quote' : 'quotes'} verified
            character-exact against{' '}
            {turn.citations.length === 1 ? 'its source message' : 'their source messages'}
          </span>
        </div>
      )}

      {/* An answer with no citations is either "the thread doesn't say" — a
          valid answer — or a claim we could not verify. Say which. */}
      {turn.citations?.length === 0 && turn.answered && (
        <p
          style={{
            margin: 0, padding: 'var(--space-2) 14px var(--space-3)',
            fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
          }}
        >
          No verifiable quote was attached to this answer — treat it with care.
        </p>
      )}

      {/* Actions. Both write to GHL, which this app has never done — no POST
          path, no write scopes. Present but disabled rather than absent, so the
          shape of the finished panel is visible and nothing silently no-ops. */}
      {turn.answered && (
        <div
          style={{
            display: 'flex', gap: 6, flexWrap: 'wrap',
            padding: '10px 14px var(--space-3)',
            borderTop: '1px solid var(--border-default)'
          }}
        >
          <AnswerAction icon="sticky_note_2" label="Save as note" />
          <AnswerAction icon="task_alt" label="Create task" />
        </div>
      )}
    </div>
  )
}

// "Email · James Halloran · sent 9 Aug 2026", one line per distinct source
// message. Deduped: two quotes from the same email are one source, and listing
// it twice would overstate how much the answer rests on.
function sourceLines(citations) {
  const seen = new Set()
  const out = []
  for (const c of citations) {
    const line = c.sourceLabel
      ? `${c.sourceLabel}`
      : [c.channelLabel, c.senderName].filter(Boolean).join(' · ')
    if (!line || seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}

// An answer action. Disabled until the write path exists — saving a note or
// creating a task has to reach GHL, and this app has never written to it.
function AnswerAction({ icon, label }) {
  return (
    <button
      disabled
      title="Coming next — this writes back to GoHighLevel"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: 'not-allowed',
        height: 30, padding: '0 var(--space-3)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
        color: 'var(--text-faint)',
        opacity: 0.7
      }}
    >
      <span className="ms" style={{ fontSize: 15 }}>{icon}</span>
      {label}
    </button>
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
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
        padding: '7px 14px',
        borderBottom: '1px solid var(--border-default)',
        background: partial ? 'var(--tint-gold)' : 'var(--gray-50)',
        fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
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
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
            padding: '1px 7px', borderRadius: 'var(--radius-pill)',
            background: 'var(--tint-teal)', color: 'var(--accent-teal-text)',
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
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
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
        padding: 'var(--space-3) 14px', display: 'grid', gap: 'var(--space-2)'
      }}
    >
      <SkeletonStyles />
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
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
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
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
              fontSize: 'var(--text-sm)', fontWeight: on ? 600 : 400
            }}
          >
            <span className="ms" style={{ fontSize: 13 }}>{icon}</span>
            {label}
            {n != null && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
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
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
            fontSize: 'var(--text-sm)', fontWeight: 600,
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
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--text-link)', textDecoration: 'underline'
          }}
        >
          clear
        </button>
      )}

      {/* Excluded / unreadable messages are worth naming here too, so a low
          count doesn't look like missing data. */}
      {scope?.coverage?.unreadReasons?.length > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-clay)' }}>
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
            padding: '14px var(--space-4)',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)', marginTop: 1 }}>
            visibility
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              Messages considered
            </h3>
            {data && (
              <p style={{ margin: '3px 0 0', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
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
              margin: 0, padding: '10px var(--space-4)',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--gray-50)',
              fontSize: 'var(--text-md)', color: 'var(--text-body)'
            }}
          >
            <strong style={{ fontWeight: 600 }}>Asked:</strong> {data.question}
          </p>
        )}

        <div style={{ overflowY: 'auto', padding: 'var(--space-2) 0' }}>
          {err && (
            <p style={{ margin: 0, padding: 16, fontSize: 'var(--text-md)', color: 'var(--status-stuck)' }}>
              {err}
            </p>
          )}
          {!data && !err && (
            <p style={{ margin: 0, padding: 16, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
              Loading…
            </p>
          )}
          {data?.items?.length === 0 && (
            <p style={{ margin: 0, padding: 16, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
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
                padding: '10px var(--space-4)',
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
                    fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                    textTransform: 'uppercase',
                    padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--gray-100)', color: 'var(--text-muted)'
                  }}
                >
                  {m.channel}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {m.direction === 'in' ? 'In ←' : '→ Out'}
                </span>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {m.who}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                  {shortDate(m.at)}
                </span>
              </span>
              <span
                style={{
                  fontSize: 'var(--text-base)', lineHeight: 1.45, color: 'var(--text-body)',
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
