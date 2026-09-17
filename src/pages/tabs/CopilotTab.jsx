import React, { useCallback, useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../api/ai'
import { dealsAPI } from '../../api/deals'
import { useTabState } from '../../hooks/useTabState'
import { useAuth } from '../../context/AuthContext'

// Co-Pilot — one question across EVERY deal in the sub-account.
//
// The Deal hub's Co-Pilot reads one thread and quotes it. This reads the
// pipeline: "which deals are stalling?", "who has gone quiet?", "where is
// qualification missing?".
//
// The server answers in two steps — deal facts first to decide which deals
// matter, then those threads in full — so a claim about what someone SAID
// still carries a verbatim quote, exactly as it does on a deal.

// GHL stores user names however they were typed — same reasoning as the
// Deal Hub's own titleCase (src/pages/dealhub/DealSection.jsx): title-case
// for display only, never for matching.
function titleCase(v) {
  if (!v) return v
  return String(v).replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
}

export default function CopilotTab({ onOpenDeal }) {
  // Remembered like every other tab's state — stepping into a deal to check an
  // answer and coming back should not discard the conversation.
  const [turns, setTurns] = useTabState('copilot', 'turns', [])
  const [conversationId, setConversationId] = useTabState('copilot', 'conversationId', null)
  const [q, setQ] = useTabState('copilot', 'q', '')
  // Sidebar width, not visibility — collapsed still shows the icon rail (New
  // chat, Search, Templates, Customize), it just drops the labels and the
  // history list, matching the GHL reference's collapse toggle.
  const [sidebarCollapsed, setSidebarCollapsed] = useTabState('copilot', 'sidebarCollapsed', false)

  const [history, setHistory] = useState([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  // The greeting's first name. The session only carries the GHL user id
  // (server/routes/auth.js never resolves a name), so it's looked up against
  // the same location-wide users list the Owner picker uses — one request,
  // only on this tab, only for reps who open Co-Pilot.
  const { session } = useAuth()
  const [firstName, setFirstName] = useState(null)
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return
    dealsAPI.users()
      .then((r) => {
        const match = (r?.users || []).find((u) => u.id === userId)
        if (match?.name) setFirstName(titleCase(match.name).split(' ')[0])
      })
      // No name is a silent fallback to the generic greeting, not an error
      // worth surfacing — this is cosmetic.
      .catch(() => {})
  }, [session?.user?.id])

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
  const submit = async () => {
    const value = q.trim()
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

  const showEmpty = empty && !pending

  return (
    // Full-bleed, no Shell/Panel margin or card frame — GHL's Co-Pilot runs
    // flush to the window edges under its own top bar, and this tab now
    // matches that rather than sitting in the app's usual padded card.
    // DealHubShell's tab-strip <header> is sticky and ~60px tall with its
    // own padding, so that (not Panel's now-removed header) is the only
    // offset the height calc needs to clear.
    //
    // Two different relationships between the sidebar and the content,
    // deliberately:
    //  - EMPTY state: the greeting centers on the WHOLE window, matching the
    //    GHL reference exactly — so the sidebar has to overlay it rather
    //    than share a grid track, or "centered" would mean centered in the
    //    leftover space next to the sidebar, which sits visibly off from
    //    the page's true center.
    //  - Once a conversation exists: back to a normal two-column grid, so
    //    turns and the composer sit in the room actually available beside
    //    the sidebar rather than running toward/under it.
    <div style={{
      position: 'relative',
      height: 'calc(100vh - 61px)', minHeight: 460
    }}>
      {showEmpty ? (
        <>
          {/* Overlays the full-width layer below rather than sharing a grid
              track with it, so the greeting centers on the true page width. */}
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            empty={empty}
            onNewChat={newChat}
            history={history}
            conversationId={conversationId}
            onReopen={reopen}
            style={{ position: 'absolute', insetBlock: 0, left: 0, zIndex: 1 }}
          />
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <p style={{
              margin: '0 0 20px', textAlign: 'center',
              fontSize: 'var(--text-3xl)', fontWeight: 600,
              letterSpacing: '-0.02em', color: 'var(--text-heading)'
            }}>
              What's on your mind{firstName ? `, ${firstName}` : ''}?
            </p>
            <div style={{ width: '100%', maxWidth: 760, padding: '0 20px' }}>
              <Composer
                value={q}
                onChange={setQ}
                onSubmit={() => submit()}
                pending={pending}
              />
            </div>
          </div>
        </>
      ) : (
        <div
          className="pp-copilot-layout"
          style={{
            display: 'grid',
            gridTemplateColumns: `${sidebarCollapsed ? 64 : 280}px minmax(0, 1fr)`,
            height: '100%', alignItems: 'stretch',
            transition: 'grid-template-columns 160ms ease'
          }}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
            empty={empty}
            onNewChat={newChat}
            history={history}
            conversationId={conversationId}
            onReopen={reopen}
          />

          {/* ── the conversation ─────────────────────────────────── */}
          <div style={{
            minWidth: 0, display: 'grid', gap: 12, padding: 14,
            gridTemplateRows: '1fr auto', minHeight: 0
          }}>
            <div
              ref={scrollRef}
              style={{
                minHeight: 0, overflowY: 'auto',
                display: 'grid', gap: 12, alignContent: 'start'
              }}
            >
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
      )}
    </div>
  )
}

// The nav items above the history list. Only New chat does anything today —
// Search, Templates and Customize are visual placeholders matching the GHL
// reference's layout, with no feature behind them yet. Disabled rather than
// silently inert, so a click doesn't look like a missed bug.
const NAV_ITEMS = [
  { key: 'search',    icon: 'search',       label: 'Search' },
  { key: 'templates', icon: 'auto_stories', label: 'Templates' },
  { key: 'customize', icon: 'grid_view',    label: 'Customize' }
]

function Sidebar({
  collapsed, onToggleCollapsed, empty, onNewChat, history, conversationId, onReopen,
  // Positioning only — everything else about the sidebar's own look is
  // fixed. Absolute + a width in the empty state (it overlays rather than
  // sharing a grid track, so the greeting can center on the full page); a
  // plain grid item once a conversation exists.
  style
}) {
  return (
    // Flat, flush to the conversation pane — a right-edge divider rather
    // than a bordered/rounded card, matching the GHL reference's edge-to-edge
    // look now that the whole tab has dropped its outer card frame too.
    <section style={{
      borderRight: '1px solid var(--border-default)',
      background: 'var(--gray-25)', overflow: 'hidden',
      display: 'grid', gridTemplateRows: 'auto auto auto 1fr', minHeight: 0,
      width: collapsed ? 64 : 280,
      ...style
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 13px'
      }}>
        {!collapsed && (
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-plum-text)' }}>
            auto_awesome
          </span>
        )}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, marginLeft: collapsed ? 'auto' : 0,
            border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer'
          }}
        >
          <span className="ms" style={{ fontSize: 19 }}>
            {collapsed ? 'dock_to_right' : 'dock_to_left'}
          </span>
        </button>
      </header>

      <nav style={{ display: 'grid', gap: 6, padding: '0 8px' }}>
        <SidebarButton
          icon="edit_square" label="New chat" collapsed={collapsed}
          disabled={empty} onClick={onNewChat}
          title={empty ? 'Already on a new chat' : 'Start a fresh conversation'}
        />
        {NAV_ITEMS.map((item) => (
          <SidebarButton
            key={item.key} icon={item.icon} label={item.label}
            collapsed={collapsed} disabled
            title={`${item.label} — coming soon`}
          />
        ))}
      </nav>

      <div style={{ height: 8 }} />

      {/* ── chat history ─────────────────────────────────────── */}
      {collapsed ? null : history.length === 0 ? (
        <HistoryEmptyState onNewChat={onNewChat} />
      ) : (
        <div style={{
          minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--border-default)'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 13px'
          }}>
            <span className="ms" style={{ fontSize: 15, color: 'var(--text-muted)' }}>history</span>
            <h3 style={{
              margin: 0, flex: 1,
              fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)'
            }}>
              Chat history
            </h3>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
              {history.length}
            </span>
          </div>
          {history.map((c) => (
            <button
              key={c.conversationId}
              onClick={() => onReopen(c)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 13px',
                border: 'none',
                background: c.conversationId === conversationId
                  ? 'var(--tint-plum)' : 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-sans)'
              }}
            >
              <span style={{
                display: 'block',
                fontSize: 'var(--text-base)', fontWeight: 600,
                color: 'var(--text-heading)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {c.title}
              </span>
              {c.turnCount > 1 && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 3,
                  fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
                }}>
                  <span className="ms" style={{ fontSize: 13 }}>forum</span>
                  {c.turnCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function SidebarButton({ icon, label, collapsed, disabled, onClick, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        justifyContent: collapsed ? 'center' : 'flex-start',
        height: 40, padding: collapsed ? 0 : '0 10px',
        border: 'none', borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        color: disabled ? 'var(--text-faint)' : 'var(--text-body)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer'
      }}
    >
      <span className="ms" style={{ fontSize: 18, flex: 'none' }}>{icon}</span>
      {!collapsed && label}
    </button>
  )
}

// Shown in place of the history list until the rep's first question. Matches
// the GHL reference's "Start your first AI chat" callout rather than the
// plain sentence this used to be — same information, a clearer call to act.
function HistoryEmptyState({ onNewChat }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', gap: 8, padding: '24px 16px',
      borderTop: '1px solid var(--border-default)'
    }}>
      <p style={{
        margin: 0, fontSize: 'var(--text-base)', fontWeight: 600,
        color: 'var(--text-heading)'
      }}>
        Start your first AI chat
      </p>
      <p style={{
        margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
      }}>
        Ask for insights, create content, or solve problems faster with AI.
      </p>
      <button
        onClick={onNewChat}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          marginTop: 4, height: 34, padding: '0 14px',
          border: 'none', borderRadius: 'var(--radius-pill)',
          background: 'var(--text-heading)', color: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>add_comment</span>
        Start a new chat
      </button>
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
          // The pill itself IS the focus ring (its border goes green above).
          // A bare <textarea> still paints its own native focus ring in
          // Chrome via box-shadow, which outline:none alone does not touch —
          // that showed as a second, inner green-ish rectangle. All three
          // reset explicitly so nothing native survives.
          appearance: 'none', WebkitAppearance: 'none',
          border: 'none', outline: 'none', boxShadow: 'none',
          background: 'transparent', padding: 0,
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
          lineHeight: 1.45, color: 'var(--text-heading)'
        }}
      />
      {/* Placeholder, matching the GHL reference — no voice input wired up
          yet, same status as Search/Templates/Customize in the sidebar. */}
      <button
        disabled
        title="Voice input — coming soon"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, flex: 'none',
          border: 'none', borderRadius: '50%',
          background: 'transparent', color: 'var(--text-faint)',
          cursor: 'default'
        }}
      >
        <span className="ms" style={{ fontSize: 19 }}>mic</span>
      </button>
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
