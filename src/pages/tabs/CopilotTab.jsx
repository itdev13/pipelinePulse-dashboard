import React, { useCallback, useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../api/ai'
import { Shell, Panel } from '../shared/ListChrome'
import { useTabState } from '../../hooks/useTabState'

// Co-Pilot — one question across EVERY deal in the sub-account.
//
// The Deal hub's Co-Pilot reads one thread and quotes it. This reads the
// pipeline: "which deals are stalling?", "who has gone quiet?", "where is
// qualification missing?".
//
// The server answers in two steps — deal facts first to decide which deals
// matter, then those threads in full — so a claim about what someone SAID
// still carries a verbatim quote, exactly as it does on a deal.

const STARTERS = [
  { icon: 'trending_down', label: 'Which deals are stalling?',
    q: 'Which open deals have been sitting in their current stage the longest, and what should we do about them?' },
  { icon: 'notifications_off', label: 'Who has gone quiet?',
    q: 'Which deals have had no inbound reply from the customer recently? Name the deal and when they last replied.' },
  { icon: 'rule', label: 'Missing qualification',
    q: 'Which open deals have the most qualification headings still empty?' },
  { icon: 'payments', label: 'Pipeline by stage',
    q: 'Break the open pipeline down by stage — how many deals and how much value in each?' },
  { icon: 'handshake', label: 'Outstanding promises',
    q: 'Across the open deals, what have we promised the customer that we have not yet delivered?' }
]

export default function CopilotTab({ onOpenDeal }) {
  // Remembered like every other tab's state — stepping into a deal to check an
  // answer and coming back should not discard the conversation.
  const [turns, setTurns] = useTabState('copilot', 'turns', [])
  const [conversationId, setConversationId] = useTabState('copilot', 'conversationId', null)
  const [q, setQ] = useTabState('copilot', 'q', '')

  const [history, setHistory] = useState([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  const loadHistory = useCallback(() => {
    aiAPI.portfolioHistory()
      .then((r) => setHistory(r?.chats || []))
      // A failed history fetch leaves the rail empty, which is still a working
      // page — the composer is what matters.
      .catch(() => {})
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns, pending])

  // Declared below the state it closes over — `const` is not hoisted, and a
  // callback reading `turns` from above throws on first render.
  const submit = async (override) => {
    const value = String(override ?? q).trim()
    if (!value || pending) return
    setQ('')
    setError(null)
    setPending(true)
    setTurns((t) => [...t, { role: 'user', content: value }])

    // Only ANSWERED turns become context, so a failed attempt does not poison
    // the follow-up.
    const priorTurns = turns
      .filter((t) => t.role === 'user' || (t.role === 'assistant' && t.answerText))
      .map((t) => ({
        role: t.role,
        content: t.role === 'user' ? t.content : t.answerText
      }))

    try {
      const res = await aiAPI.askPortfolio({
        question: value,
        history: priorTurns,
        conversationId
      })
      setTurns((t) => [...t, {
        role: 'assistant',
        answerText: res.answerText,
        citations: res.citations || [],
        confidence: res.confidence,
        answered: res.answered !== false,
        dealsRead: res.dealsRead || [],
        scopeNote: res.scopeNote || null,
        fromFactsOnly: res.fromFactsOnly === true
      }])
      if (res.conversationId) setConversationId(res.conversationId)
      loadHistory()
    } catch (err) {
      const code = err?.code
      setError(
        code === 'AI_NOT_CONFIGURED'
          ? 'The AI layer is not configured on the server yet.'
          : code === 'TIMEOUT'
          ? 'The model took too long. Try a narrower question.'
          : err?.message || 'Could not get an answer.'
      )
    } finally {
      setPending(false)
    }
  }

  const newChat = () => {
    setTurns([])
    setConversationId(null)
    setQ('')
    setError(null)
  }

  const reopen = (chat) => {
    const list = chat.turns?.length ? chat.turns : [chat]
    setTurns(list.flatMap((t) => [
      { role: 'user', content: t.question },
      {
        role: 'assistant',
        answerText: t.answerText,
        citations: t.citations || [],
        confidence: t.confidence,
        answered: t.answered,
        dealsRead: [],
        fromFactsOnly: false
      }
    ]))
    setConversationId(chat.conversationId || null)
    setError(null)
  }

  const empty = turns.length === 0

  return (
    <Shell maxWidth="none">
      <Panel
        icon="auto_awesome"
        title="Co-Pilot"
        accent="plum"
        meta="Every deal in this sub-account"
        action={
          <button
            onClick={newChat}
            disabled={empty}
            title={empty ? 'Already on a new chat' : 'Start a fresh conversation'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 32, padding: '0 13px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: '#fff',
              color: empty ? 'var(--text-faint)' : 'var(--text-body)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-base)', fontWeight: 600,
              cursor: empty ? 'default' : 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>add</span>
            New chat
          </button>
        }
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)',
          gap: 14, padding: 14,
          // Fill what is left of the viewport under the shell's own chrome,
          // rather than a fixed box with dead space beneath it.
          height: 'calc(100vh - 210px)', minHeight: 460,
          alignItems: 'stretch'
        }}
        // At narrow widths the rail stacks under the conversation, and a fixed
        // viewport height would squeeze both into a few scrolling inches.
        className="pp-copilot-layout"
        >
          {/* ── chat history ─────────────────────────────────────── */}
          <section style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            background: '#fff', overflow: 'hidden',
            display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0
          }}>
            <header style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 13px',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--gray-25)'
            }}>
              <span className="ms" style={{ fontSize: 17, color: 'var(--text-muted)' }}>history</span>
              <h3 style={{
                margin: 0, flex: 1,
                fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
              }}>
                Chat history
              </h3>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                {history.length}
              </span>
            </header>
            {history.length === 0 ? (
              <p style={{
                margin: 0, padding: 14,
                fontSize: 'var(--text-base)', color: 'var(--text-faint)'
              }}>
                Questions you ask here are kept, so you can pick a thread back up.
              </p>
            ) : (
              <div style={{ minHeight: 0, overflowY: 'auto' }}>
                {history.map((c) => (
                  <button
                    key={c.conversationId}
                    onClick={() => reopen(c)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '11px 13px',
                      border: 'none',
                      borderBottom: '1px solid var(--border-default)',
                      background: c.conversationId === conversationId
                        ? 'var(--tint-plum)' : '#fff',
                      cursor: 'pointer', fontFamily: 'var(--font-sans)'
                    }}
                  >
                    <span style={{
                      display: 'block',
                      fontSize: 'var(--text-base)', fontWeight: 600,
                      color: 'var(--text-heading)'
                    }}>
                      {c.title}
                    </span>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginTop: 3,
                      fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
                    }}>
                      {c.turnCount > 1 && (
                        <>
                          <span className="ms" style={{ fontSize: 13 }}>forum</span>
                          {c.turnCount}
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── the conversation ─────────────────────────────────── */}
          <div style={{
            minWidth: 0, display: 'grid', gap: 12,
            gridTemplateRows: '1fr auto', minHeight: 0
          }}>
            <div
              ref={scrollRef}
              style={{
                minHeight: 0, overflowY: 'auto',
                display: 'grid', gap: 12, alignContent: 'start'
              }}
            >
              {empty && !pending && (
                <EmptyState onPick={(starter) => submit(starter)} />
              )}

              <div style={{
                width: '100%', maxWidth: 760, margin: '0 auto',
                display: 'grid', gap: 12, alignContent: 'start'
              }}>
                {turns.map((t, i) => (
                  t.role === 'user'
                    ? <UserTurn key={i} text={t.content} />
                    : <AnswerTurn key={i} turn={t} onOpenDeal={onOpenDeal} />
                ))}

                {pending && <Thinking />}
              </div>
            </div>

            {error && (
              <p style={{
                margin: '0 auto', width: '100%', maxWidth: 760,
                padding: '10px 13px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--tint-rose)', color: 'var(--status-stuck-text)',
                fontSize: 'var(--text-md)'
              }}>
                {error}
              </p>
            )}

            <div style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
              <Composer
                value={q}
                onChange={setQ}
                onSubmit={() => submit()}
                pending={pending}
              />
            </div>
          </div>
        </div>
      </Panel>
    </Shell>
  )
}

function EmptyState({ onPick }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: '40px 16px', textAlign: 'center',
      // Fills the scroller so the invitation sits in the middle of the space
      // rather than clinging to the top of a now much taller area.
      minHeight: '100%'
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 60, height: 60, borderRadius: 'var(--radius-pill)',
        background: 'linear-gradient(135deg, var(--accent-plum) 0%, var(--accent-sky) 100%)',
        color: '#fff', boxShadow: '0 6px 20px rgba(123, 92, 201, 0.28)'
      }}>
        <span className="ms" style={{ fontSize: 30 }}>auto_awesome</span>
      </span>
      <div>
        <p style={{
          margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 600,
          letterSpacing: '-0.02em', color: 'var(--text-heading)'
        }}>
          Ask across every deal
        </p>
        <p style={{
          margin: '5px auto 0', maxWidth: 430,
          fontSize: 'var(--text-md)', color: 'var(--text-muted)'
        }}>
          Questions about the whole pipeline, not one deal. Start with a
          suggestion or type your own.
        </p>
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8,
        justifyContent: 'center', maxWidth: 620
      }}>
        {STARTERS.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.q)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 36, padding: '0 14px 0 11px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: '#fff', color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 17, color: 'var(--accent-plum-text)' }}>
              {s.icon}
            </span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function UserTurn({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <p style={{
        margin: 0, maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: '16px 16px 4px 16px',
        background: 'var(--brand-primary)', color: '#fff',
        fontSize: 'var(--text-md)', lineHeight: 1.5
      }}>
        {text}
      </p>
    </div>
  )
}

function AnswerTurn({ turn, onOpenDeal }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{
        padding: '12px 14px',
        border: '1px solid var(--border-default)',
        borderRadius: '16px 16px 16px 4px',
        background: '#fff'
      }}>
        <p style={{
          margin: 0, fontSize: 'var(--text-md)', lineHeight: 1.6,
          color: 'var(--text-body)', whiteSpace: 'pre-wrap'
        }}>
          {turn.answerText}
        </p>

        {turn.scopeNote && (
          <p style={{
            margin: '9px 0 0', padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--tint-gold)', color: 'var(--accent-gold-text)',
            fontSize: 'var(--text-base)'
          }}>
            {turn.scopeNote}
          </p>
        )}
      </div>

      {/* Which deals the answer rests on. A portfolio answer names several, so
          these are the way through to check one — the equivalent of clicking a
          citation on a single deal. */}
      {turn.dealsRead?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{
            fontSize: 'var(--text-xs)', fontWeight: 600,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            color: 'var(--text-faint)'
          }}>
            {turn.fromFactsOnly ? 'Based on' : 'Read'}
          </span>
          {turn.dealsRead.map((d) => (
            <button
              key={d.id}
              onClick={() => onOpenDeal && onOpenDeal(d.id)}
              title="Open this deal"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                height: 26, padding: '0 10px',
                border: '1px solid var(--green-300)',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--tint-pine)', color: 'var(--accent-pine-text)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer'
              }}
            >
              <span className="ms" style={{ fontSize: 13 }}>sell</span>
              {d.name}
            </button>
          ))}
        </div>
      )}

      {turn.citations?.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {turn.citations.map((c, i) => (
            <button
              key={`${c.message_id}-${i}`}
              onClick={() => c.deal_id && onOpenDeal && onOpenDeal(c.deal_id)}
              title={c.deal_id ? 'Open the deal this came from' : undefined}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px',
                border: 'none',
                borderLeft: '3px solid var(--accent-teal)',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                background: 'var(--gray-50)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-base)', color: 'var(--text-muted)',
                fontStyle: 'italic',
                cursor: c.deal_id ? 'pointer' : 'default'
              }}
            >
              “{c.quote_text}”
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Thinking() {
  return (
    <p style={{
      margin: 0, display: 'flex', alignItems: 'center', gap: 8,
      padding: '12px 14px',
      fontSize: 'var(--text-md)', color: 'var(--text-muted)'
    }}>
      <span className="ms" style={{ fontSize: 18 }}>hourglass_top</span>
      Reading the pipeline…
    </p>
  )
}

function Composer({ value, onChange, onSubmit, pending }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 8,
      padding: '12px 16px',
      border: `1.5px solid ${focused ? 'var(--brand-primary)' : 'var(--border-default)'}`,
      borderRadius: 26,
      background: '#fff',
      boxShadow: focused
        ? '0 4px 18px rgba(31, 36, 48, 0.10), 0 1px 3px rgba(31, 36, 48, 0.06)'
        : '0 1px 3px rgba(31, 36, 48, 0.07)',
      transition: 'box-shadow 160ms ease, border-color 160ms ease'
    }}>
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          const el = e.target
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 132)}px`
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
        }}
        disabled={pending}
        placeholder={pending ? 'Reading the pipeline…' : 'Ask anything about your deals…'}
        rows={1}
        style={{
          flex: 1, minWidth: 0,
          minHeight: 26, maxHeight: 140, resize: 'none',
          border: 'none', outline: 'none', background: 'transparent', padding: 0,
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
          lineHeight: 1.45, color: 'var(--text-heading)'
        }}
      />
      <button
        onClick={onSubmit}
        disabled={pending || !value.trim()}
        title="Ask"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, flex: 'none',
          border: 'none', borderRadius: '50%',
          background: value.trim() && !pending ? 'var(--brand-primary)' : 'var(--gray-200)',
          color: value.trim() && !pending ? '#fff' : 'var(--text-faint)',
          cursor: value.trim() && !pending ? 'pointer' : 'default'
        }}
      >
        <span className="ms" style={{ fontSize: 19 }}>arrow_upward</span>
      </button>
    </div>
  )
}
