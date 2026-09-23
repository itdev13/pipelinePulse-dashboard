import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { aiAPI } from '../../api/ai'
import { dealsAPI } from '../../api/deals'
import { useTabState } from '../../hooks/useTabState'
import { useAuth } from '../../context/AuthContext'
import { useDictation } from '../shared/useDictation'
import MarkdownAnswer from '../dealhub/MarkdownAnswer'
import { useAttachments } from '../shared/useAttachments'
import {
  RecordingBar, AttachmentThumbnails, ImagePreview, IconButton
} from '../shared/ComposerExtras'
import CopilotSidebar from '../shared/CopilotSidebar'
import UserTurn from '../shared/UserTurn'
import ReactionRow from '../shared/ReactionRow'
import ActionCard from '../shared/ActionCard'
import AnswerDealsTable from '../shared/AnswerDealsTable'

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
  // Separate from the sidebar's own collapse above: this just hides the
  // Recents LIST under its header (a chevron toggle, matching the GHL
  // reference), while the sidebar itself stays full width.
  const [recentsCollapsed, setRecentsCollapsed] = useTabState('copilot', 'recentsCollapsed', false)

  const [history, setHistory] = useState([])
  const [pending, setPending] = useState(false)
  // Which turn's reasoning panel is open on the right, or null. Index into
  // `turns`, not the turn object itself — turns are replaced wholesale on
  // every setTurns call, so holding a reference would go stale.
  const [openThoughtsFor, setOpenThoughtsFor] = useState(null)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  // The in-flight request's abort handle, so the composer's stop button can
  // abandon it. There's no server-side cancellation — answers aren't
  // streamed, so the Claude tool-call loop keeps running either way — this
  // only stops the REP from waiting on it.
  const abortRef = useRef(null)

  const dictation = useDictation({ q, setQ, onError: setError, inputRef })
  const {
    attachments, addFiles, removeAttachment, clear: clearAttachments,
    preview, setPreview, fileRef, onPaste
  } = useAttachments({ onError: setError })

  // The greeting's first name, and the full name for the Account avatar's
  // initials. The session only carries the GHL user id (server/routes/
  // auth.js never resolves a name), so it's looked up against the same
  // location-wide users list the Owner picker uses — one request, only on
  // this tab, only for reps who open Co-Pilot.
  const { session } = useAuth()
  const [firstName, setFirstName] = useState(null)
  const [fullName, setFullName] = useState(null)
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return
    dealsAPI.users()
      .then((r) => {
        const match = (r?.users || []).find((u) => u.id === userId)
        if (!match?.name) return
        const name = titleCase(match.name)
        setFullName(name)
        setFirstName(name.split(' ')[0])
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
    // Captured before the composer clears — setState is async, so reading
    // `attachments` after clearing would race and send an empty array.
    const sentImages = attachments
    setQ('')
    setError(null)
    setPending(true)
    // Open the panel immediately, before the answer exists — this is what
    // "open by default while thinking" means: the rep sees it working, not
    // just an inline label, from the moment the question is sent.
    setOpenThoughtsFor('live')
    clearAttachments()
    // sentImages carries previewUrl/name for the transcript's own thumbnail
    // — separate from the mediaType/data pair sent to the model below, which
    // is all Claude needs and all the request should carry.
    setTurns((t) => [...t, { role: 'user', content: value, images: sentImages }])

    // Only ANSWERED turns become context, so a failed attempt does not poison
    // the follow-up.
    const priorTurns = turns
      .filter((t) => t.role === 'user' || (t.role === 'assistant' && t.answerText))
      .map((t) => ({
        role: t.role,
        content: t.role === 'user' ? t.content : t.answerText
      }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await aiAPI.askPortfolio({
        question: value,
        history: priorTurns,
        images: sentImages.map((a) => ({ mediaType: a.mediaType, data: a.data })),
        conversationId,
        signal: controller.signal
      })
      setTurns((t) => {
        // t.length is the array BEFORE this push — exactly the index the
        // assistant turn is about to occupy, so the panel hands over to the
        // SAME slot rather than closing and a different one opening.
        setOpenThoughtsFor(t.length)
        return [...t, {
          role: 'assistant',
          answerText: res.answerText,
          citations: res.citations || [],
          confidence: res.confidence,
          answered: res.answered !== false,
          dealsRead: res.dealsRead || [],
          dealsTable: res.dealsTable || null,
          toolCalls: res.toolCalls || [],
          // Writes the model proposed this turn — create/attach a contact,
          // change an owner or status. Nothing has happened to the CRM yet;
          // each renders its own ActionCard, confirmed independently.
          proposedActions: res.proposedActions || [],
          scopeNote: res.scopeNote || null,
          fromFactsOnly: res.fromFactsOnly === true,
          // Needed to rate the answer. Dropped before — the server always
          // sent it, the client just never carried it onto the turn.
          runId: res.runId || null
        }]
      })
      if (res.conversationId) setConversationId(res.conversationId)
      loadHistory()
    } catch (err) {
      setOpenThoughtsFor(null)
      // A rep-initiated stop, not a failure — the question the rep abandoned
      // just quietly disappears rather than surfacing as an error banner.
      // The user turn stays in the transcript so it's clear what was asked.
      if (err?.code === 'ERR_CANCELED') {
        // no-op
      } else {
        const code = err?.code
        setError(
          code === 'AI_NOT_CONFIGURED'
            ? 'The AI layer is not configured on the server yet.'
            : code === 'TIMEOUT'
            ? 'The model took too long. Try a narrower question.'
            : err?.message || 'Could not get an answer.'
        )
      }
    } finally {
      abortRef.current = null
      setPending(false)
    }
  }

  const stopAsking = () => {
    abortRef.current?.abort()
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
        dealsRead: t.dealsRead || [],
        dealsTable: t.dealsTable || null,
        fromFactsOnly: false,
        // Without this, thumbs up/down disable on every reopened turn —
        // ReactionRow treats a missing runId as "no run to rate".
        runId: t.runId || null
      }
    ]))
    setConversationId(chat.conversationId || null)
    setError(null)
  }

  const empty = turns.length === 0

  const showEmpty = empty && !pending

  return (
    // The fragment's second child is the full-size attachment preview,
    // shared across the empty/populated composer branches since `preview`
    // is one piece of state — rendering it once here, not per-branch,
    // avoids the exact kind of duplication that caused bugs earlier in
    // this file's history.
    <>
    {/* Full-bleed, no Shell/Panel margin or card frame — GHL's Co-Pilot runs
        flush to the window edges under its own top bar, and this tab now
        matches that rather than sitting in the app's usual padded card.
        DealHubShell's tab-strip <header> is sticky and ~60px tall with its
        own padding, so that (not Panel's now-removed header) is the only
        offset the height calc needs to clear.

        ONE grid, both states: the sidebar is a normal grid column throughout,
        and the greeting/composer center in the room actually left beside it
        — not on the full window's midpoint. An earlier version made the
        sidebar overlay the content so the greeting could center on the true
        window width instead, matching the GHL reference more literally, but
        that reads as off-center relative to what's actually visible next to
        the sidebar. Simpler and correct: same column layout as the populated
        state, just with different content on the right. */}
    <div
      className="pp-copilot-layout"
      style={{
        display: 'grid',
        gridTemplateColumns:
          `${sidebarCollapsed ? 64 : 280}px minmax(0, 1fr)`
          + (openThoughtsFor != null ? ' 360px' : ''),
        // The whole tab sits directly on [data-dealhub]'s page background
        // (grey — every other tab needs that for its cards to sit on), which
        // showed through once this tab dropped its own card frame. White
        // here, under everything: the sidebar's own var(--gray-25) still
        // paints over its own column, so only the conversation side reads
        // as white.
        background: '#fff',
        height: 'calc(100vh - 61px)', minHeight: 460,
        alignItems: 'stretch',
        transition: 'grid-template-columns 160ms ease'
      }}
    >
      <CopilotSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        recentsCollapsed={recentsCollapsed}
        onToggleRecentsCollapsed={() => setRecentsCollapsed((c) => !c)}
        empty={empty}
        onNewChat={newChat}
        history={history}
        conversationId={conversationId}
        onReopen={reopen}
        fullName={fullName}
        onDeleted={(deletedId) => {
          if (deletedId === conversationId) { setTurns([]); setConversationId(null) }
          loadHistory()
        }}
        onRenamed={() => loadHistory()}
      />

      {/* ── the conversation ─────────────────────────────────── */}
      <div style={{
        minWidth: 0, display: 'grid', gap: 12, padding: 14,
        gridTemplateRows: '1fr auto', minHeight: 0
      }}>
        {showEmpty ? (
          // Spans BOTH rows and centers the greeting + composer as one
          // group. Splitting them across the 1fr/auto rows (as the
          // populated state does) put the greeting at the bottom of the
          // tall 1fr row, with the composer's own row adding further
          // height below it — landing the pair near the bottom of the
          // whole column instead of centered in it.
          <div style={{
            gridRow: '1 / -1', minHeight: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <p style={{
              margin: '0 0 20px', textAlign: 'center',
              fontSize: 'var(--text-3xl)', fontWeight: 600,
              letterSpacing: '-0.02em', color: 'var(--text-heading)'
            }}>
              What's on your mind{firstName ? `, ${firstName}` : ''}?
            </p>
            <div style={{ width: '100%', maxWidth: 760 }}>
              <Composer
                value={q}
                onChange={setQ}
                onSubmit={() => submit()}
                onStop={stopAsking}
                pending={pending}
                inputRef={inputRef}
                dictation={dictation}
                attachments={attachments}
                onAddFiles={addFiles}
                onRemoveAttachment={removeAttachment}
                onViewAttachment={setPreview}
                fileRef={fileRef}
                onPaste={onPaste}
              />
            </div>
          </div>
        ) : (
          <>
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
                    ? (
                      <UserTurn
                        key={i} text={t.content}
                        images={t.images} onViewImage={setPreview}
                      />
                    )
                    : (
                      <AnswerTurn
                        key={i}
                        turn={t}
                        onOpenDeal={onOpenDeal}
                        thoughtsOpen={openThoughtsFor === i}
                        onToggleThoughts={() => setOpenThoughtsFor((cur) => (cur === i ? null : i))}
                      />
                    )
                ))}

                {pending && <ThoughtProcess live steps={[]} />}
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
                onStop={stopAsking}
                pending={pending}
                inputRef={inputRef}
                dictation={dictation}
                attachments={attachments}
                onAddFiles={addFiles}
                onRemoveAttachment={removeAttachment}
                onViewAttachment={setPreview}
                fileRef={fileRef}
                onPaste={onPaste}
              />
            </div>
          </>
        )}
      </div>
      {openThoughtsFor === 'live' && (
        <ThoughtsPanel live onClose={() => setOpenThoughtsFor(null)} />
      )}
      {typeof openThoughtsFor === 'number' && turns[openThoughtsFor] && (
        <ThoughtsPanel
          turn={turns[openThoughtsFor]}
          onClose={() => setOpenThoughtsFor(null)}
        />
      )}
    </div>
    {preview && <ImagePreview attachment={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

function AnswerTurn({ turn, onOpenDeal, thoughtsOpen, onToggleThoughts }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {turn.toolCalls?.length > 0 && (
        <ThoughtProcess
          steps={turn.toolCalls}
          open={thoughtsOpen}
          onToggle={onToggleThoughts}
        />
      )}

      <div>
        <MarkdownAnswer text={turn.answerText} />

        {/* The row data behind a "list of deals" answer, rendered as a real
            table — see AnswerDealsTable's own header comment for why this
            exists rather than trusting the model to format one in prose. */}
        {turn.dealsTable?.length > 0 && (
          <AnswerDealsTable deals={turn.dealsTable} onOpenDeal={onOpenDeal} />
        )}

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

        {/* Which deals the answer rests on, ABOVE the reaction row — a
            manager checks what was actually read before deciding whether to
            rate the answer, not after. A portfolio answer names several, so
            these are the way through to check one — the equivalent of
            clicking a citation on a single deal.

            Hidden when AnswerDealsTable is already showing (below): the
            table lists the same deals with a click-through of its own, so
            the chip row would just repeat it. Without this a big
            search_deals answer produced BOTH the table AND a wall of one
            chip per deal — dozens of pills, most of the reply's real
            estate, for information already on screen once. */}
        {turn.dealsRead?.length > 0 && !(turn.dealsTable?.length > 0) && (
          <DealsReadChips
            deals={turn.dealsRead}
            label={turn.fromFactsOnly ? 'Based on' : 'Read'}
            onOpenDeal={onOpenDeal}
          />
        )}

        {/* Proposed writes — one ActionCard per action, ABOVE the reaction
            row for the same reason dealsRead sits above it: a rep decides
            whether to confirm a proposed action before rating the answer
            that surfaced it, not after. */}
        {turn.proposedActions?.length > 0 && (
          <div style={{ display: 'grid', gap: 8, margin: '9px 0 0' }}>
            {turn.proposedActions.map((a) => (
              <ActionCard
                key={a.actionId}
                actionId={a.actionId}
                actionType={a.actionType}
                proposed={a.proposed}
              />
            ))}
          </div>
        )}

        <ReactionRow runId={turn.runId} answerText={turn.answerText} />
      </div>

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

// The "Read"/"Based on" deal chip row, capped rather than one pill per deal.
// A message-reading answer that touches many deals (no AnswerDealsTable to
// fall back on, since there's no search_deals result behind it) used to
// render every single one — dozens of pills swallowing most of the reply.
// Shows the first few plus a "+N more" toggle instead.
const DEALS_READ_VISIBLE = 3

function DealsReadChips({ deals, label, onOpenDeal }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? deals : deals.slice(0, DEALS_READ_VISIBLE)
  const hiddenCount = deals.length - shown.length

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      margin: '9px 0 0'
    }}>
      <span style={{
        fontSize: 'var(--text-xs)', fontWeight: 600,
        letterSpacing: '0.05em', textTransform: 'uppercase',
        color: 'var(--text-faint)'
      }}>
        {label}
      </span>
      {shown.map((d) => (
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
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            height: 26, padding: '0 10px',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-pill)',
            background: 'transparent', color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer'
          }}
        >
          +{hiddenCount} more
        </button>
      )}
      {expanded && deals.length > DEALS_READ_VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            height: 26, padding: '0 10px', border: 'none', background: 'transparent',
            color: 'var(--text-faint)', fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)', cursor: 'pointer', textDecoration: 'underline'
          }}
        >
          Show less
        </button>
      )}
    </div>
  )
}

// What the AI actually did to answer — the tools it called and what came
// back, mirrored on GHL's Ask AI:
//
//   1. While streaming: "Thinking" then "Generating…" — two plain inline
//      labels, no card, nothing to click yet.
//   2. Once the answer lands: an inline row reading "Thought process", which
//      OPENS THE RIGHT-SIDE PANEL on click rather than expanding in place —
//      GHL never shows the reasoning inline, only a chevron promising detail
//      elsewhere.
//
// It is not decoration. Our tool answers carry no message citations, so the
// call log IS the audit trail: a rep who reads "three deals have stalled" can
// open the panel and see it ran search_deals with stalledDays:14 and got
// three rows back. Without it the answer is unverifiable.
function ThoughtProcess({ steps = [], live = false, open = false, onToggle }) {
  // "Thinking" first, then "Generating…" once a tool call has actually
  // landed — matching the two-label sequence in the reference.
  const genPhase = live && steps.length > 0

  if (live) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 'var(--text-md)', color: 'var(--text-muted)'
      }}>
        <span
          className="ms"
          style={{ fontSize: 17, animation: 'pp-think 1.4s ease-in-out infinite' }}
        >
          {genPhase ? 'auto_awesome' : 'hourglass_top'}
        </span>
        {genPhase ? 'Generating…' : 'Thinking'}
      </span>
    )
  }

  if (steps.length === 0) return null

  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        alignSelf: 'flex-start',
        padding: 0, border: 'none', background: 'transparent',
        fontFamily: 'var(--font-sans)', cursor: 'pointer'
      }}
    >
      <span className="ms" style={{ fontSize: 17, color: 'var(--text-faint)' }}>
        hourglass_top
      </span>
      <span style={{
        fontSize: 'var(--text-md)',
        color: open ? 'var(--text-heading)' : 'var(--text-muted)'
      }}>
        Thought process
      </span>
      <span className="ms" style={{ fontSize: 18, color: 'var(--text-faint)' }}>
        {open ? 'expand_less' : 'expand_more'}
      </span>
    </button>
  )
}

// The right-side panel — the actual reasoning steps, one per tool call plus a
// framing line at each end. Opened by clicking "Thought process"; GHL keeps
// this as a slide-in panel rather than inline detail, which is why it is a
// grid column here rather than a popover glued to the row that opened it.
function ThoughtsPanel({ turn = null, onClose, live = false }) {
  const steps = turn?.toolCalls || []
  const seconds = turn?.latencyMs ? Math.round(turn.latencyMs / 1000) : null

  return (
    <div style={{
      borderLeft: '1px solid var(--border-default)',
      background: '#fff',
      display: 'grid', gridTemplateRows: 'auto 1fr',
      minHeight: 0, overflow: 'hidden'
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-default)'
      }}>
        <span
          className="ms"
          style={{
            fontSize: 17, color: 'var(--text-muted)',
            animation: live ? 'pp-think 1.4s ease-in-out infinite' : 'none'
          }}
        >
          hourglass_top
        </span>
        <h3 style={{
          margin: 0, flex: 1,
          fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
        }}>
          {live ? 'Thinking…' : seconds != null ? `Thought for ${seconds}s` : 'Thought process'}
        </h3>
        <button
          onClick={onClose}
          title="Close"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, border: 'none', borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer'
          }}
        >
          <span className="ms" style={{ fontSize: 18 }}>close</span>
        </button>
      </header>

      <div style={{ overflowY: 'auto', padding: '14px 16px' }}>
        {/* LIVE: one in-progress step. We don't stream individual tool calls
            today, so this can't yet say WHICH lookup is running — only that
            one is. Still true, and still the point: the panel is open and
            working, not just an inline label. */}
        {live ? (
          <ThoughtStep done={false} text="Checking the CRM for this…" last />
        ) : (
          <ThoughtStep
            done
            text={
              steps.length > 0
                ? `Looking into this needs real data, so I'll check ${steps.length === 1 ? 'the CRM' : 'a few things in the CRM'}.`
                : 'Answered directly — no lookup was needed for this one.'
            }
          />
        )}
        {steps.map((st, i) => (
          <ThoughtStep
            key={`${st.name}-${i}`}
            done
            text={stepNarrative(st)}
          />
        ))}
        {steps.length > 0 && (
          <ThoughtStep
            done
            last
            text="Got what I needed, so I'll answer now."
          />
        )}
      </div>
    </div>
  )
}

// One line in the timeline: a status glyph, a connecting rule, the sentence.
// `done` vs in-progress mirrors the clock/check distinction in the reference —
// in-progress only happens on the LIVE panel's single placeholder step;
// every step in a completed turn's panel is done by definition.
function ThoughtStep({ text, done = true, last = false }) {
  return (
    <div style={{ display: 'flex', gap: 10, position: 'relative' }}>
      <span style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        flex: 'none'
      }}>
        <span className="ms" style={{
          fontSize: 15,
          color: done ? 'var(--accent-pine-text)' : 'var(--text-faint)'
        }}>
          {done ? 'check_circle' : 'schedule'}
        </span>
        {!last && (
          <span style={{
            width: 1, flex: 1, minHeight: 20,
            background: 'var(--border-default)', marginTop: 2
          }} />
        )}
      </span>
      <p style={{
        margin: '0 0 16px', fontSize: 'var(--text-base)', lineHeight: 1.55,
        color: 'var(--text-body)'
      }}>
        {text}
      </p>
    </div>
  )
}

// One readable sentence per tool call — the panel reads as prose, the way
// GHL's reasoning steps do, not as a raw log of function names and JSON.
function stepNarrative(step) {
  const args = describeArgs(step.input)
  const base = `${labelForTool(step.name)}${args ? ` (${args})` : ''}.`
  if (step.rows == null) return base
  if (step.rows === 0) return `${base} Nothing matched.`
  return `${base} Found ${step.rows} ${step.rows === 1 ? 'result' : 'results'}.`
}

function labelForTool(name) {
  const known = {
    search_deals: 'Searched deals',
    get_deal_messages: 'Read a deal\'s messages',
    search_contacts: 'Searched contacts',
    get_deal_history: 'Checked what changed on a deal',
    get_pipeline_summary: 'Summarised the pipeline',
    get_deal_tasks_and_notes: 'Read tasks and notes'
  }
  return known[name] || name.replace(/_/g, ' ')
}

// The arguments, as a short phrase. Only the ones a rep would recognise —
// dumping raw JSON here would be noise rather than evidence.
function describeArgs(input) {
  if (!input || typeof input !== 'object') return null
  const bits = []
  if (input.status) bits.push(input.status)
  if (input.stage) bits.push(`stage "${input.stage}"`)
  if (input.owner) bits.push(`owner "${input.owner}"`)
  if (input.tag) bits.push(`tagged "${input.tag}"`)
  if (input.stalledDays != null) bits.push(`stalled ${input.stalledDays}+ days`)
  if (input.quietDays != null) bits.push(`quiet ${input.quietDays}+ days`)
  if (input.minValue != null) bits.push(`over ${input.minValue}`)
  if (input.maxValue != null) bits.push(`under ${input.maxValue}`)
  if (input.unassigned) bits.push('unassigned')
  if (input.contactType) bits.push(input.contactType)
  if (input.query) bits.push(`"${input.query}"`)
  if (input.pipeline) bits.push(`pipeline "${input.pipeline}"`)
  if (input.field) bits.push(input.field)
  return bits.join(' · ') || null
}

function Composer({
  value, onChange, onSubmit, onStop, pending, inputRef, dictation,
  attachments, onAddFiles, onRemoveAttachment, onViewAttachment,
  fileRef, onPaste
}) {
  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { supported: speechSupported, listening, heard, elapsed, start, finish, cancel } = dictation

  // Re-measure whenever `value` changes for ANY reason, not just typing.
  // The onChange handler below resizes on a keystroke, but `value` also
  // changes from OUTSIDE this component — submit clears it, dictation fills
  // it — and none of those fire onChange. Without this the box could grow
  // tall for a long question, then stay stuck tall after the text was
  // cleared or replaced by a short one.
  useLayoutEffect(() => {
    const el = inputRef?.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [value, inputRef])

  // While dictating, the composer IS the recorder — the same box, a
  // different state. A separate floating panel would leave a dead text
  // field underneath it. Matches AskDeal's own Co-Pilot exactly.
  if (listening) {
    return <RecordingBar heard={heard} elapsed={elapsed} onCancel={cancel} onFinish={finish} />
  }

  return (
    <div
      onClick={() => inputRef?.current?.focus()}
      // Drag an image onto the composer. Same path as paste and the attach
      // button — one validation and read routine for all three.
      onDragOver={(e) => {
        if (![...(e.dataTransfer?.items || [])].some((it) => it.kind === 'file')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        // Fires when crossing into a child too, so ignore anything that
        // didn't actually leave the wrapper — otherwise the highlight
        // flickers as the cursor moves over the textarea.
        if (e.currentTarget.contains(e.relatedTarget)) return
        setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onAddFiles(e.dataTransfer?.files)
      }}
      style={{
        display: 'grid', gap: 8,
        padding: '12px 16px',
        border: dragging
          ? '2px dashed var(--brand-primary)'
          : `1.5px solid ${focused ? 'var(--brand-primary)' : 'var(--border-default)'}`,
        borderRadius: 26,
        background: dragging ? 'var(--tint-pine)' : '#fff',
        boxShadow: dragging
          ? '0 0 0 4px rgba(22, 133, 95, 0.12)'
          : focused
            ? '0 4px 18px rgba(31, 36, 48, 0.10), 0 1px 3px rgba(31, 36, 48, 0.06)'
            : '0 1px 3px rgba(31, 36, 48, 0.07)',
        transition: 'box-shadow 160ms ease, border-color 160ms ease',
        cursor: 'text'
      }}
    >
      <AttachmentThumbnails
        attachments={attachments}
        onView={onViewAttachment}
        onRemove={onRemoveAttachment}
      />

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
          }}
          onPaste={onPaste}
          disabled={pending}
          placeholder={pending ? 'Reading the pipeline…' : 'Ask anything about your deals…'}
          rows={1}
          style={{
            flex: 1, minWidth: 0,
            minHeight: 26, maxHeight: 140, resize: 'none',
            // Never scrolls internally — it grows with the text instead (see
            // the height-sync effect and onChange below), so the native
            // scrollbar a plain textarea gets once content exceeds its
            // inline height never has anything to render. That bar showing
            // up beside the send button was exactly this: content height
            // and the inline style briefly disagreeing.
            overflow: 'hidden',
            // The pill itself IS the focus ring (its border goes green
            // above). A bare <textarea> still paints its own native focus
            // ring in Chrome via box-shadow, which outline:none alone does
            // not touch — that showed as a second, inner green-ish
            // rectangle. All three reset explicitly so nothing native
            // survives.
            appearance: 'none', WebkitAppearance: 'none',
            border: 'none', outline: 'none', boxShadow: 'none',
            background: 'transparent', padding: 0,
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-lg)',
            lineHeight: 1.45, color: 'var(--text-heading)'
          }}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={(e) => { onAddFiles(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        <IconButton
          icon="attach_file"
          size={34} iconSize={19}
          label={
            attachments.length >= 3
              ? '3 images is the limit'
              : 'Attach an image to this question'
          }
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
          disabled={pending || attachments.length >= 3}
        />

        <IconButton
          icon="mic"
          size={34} iconSize={19}
          label={
            speechSupported
              ? 'Dictate your question'
              : 'Dictation needs Chrome, Edge or Safari'
          }
          onClick={start}
          disabled={!speechSupported || pending}
        />

        {pending ? (
          // GHL swaps its send control for a stop button while a question is
          // in flight; we don't stream an answer back, so this doesn't halt
          // generation server-side — it abandons the wait client-side, same
          // as closing the tab would, just without losing the composer.
          <button
            onClick={onStop}
            title="Stop"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, flex: 'none',
              border: 'none', borderRadius: '50%',
              background: 'var(--gray-800)', color: '#fff',
              cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>stop</span>
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            title="Ask"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, flex: 'none',
              border: 'none', borderRadius: '50%',
              background: value.trim() ? 'var(--brand-primary)' : 'var(--gray-200)',
              color: value.trim() ? '#fff' : 'var(--text-faint)',
              cursor: value.trim() ? 'pointer' : 'default'
            }}
          >
            <span className="ms" style={{ fontSize: 19 }}>arrow_upward</span>
          </button>
        )}
      </div>
    </div>
  )
}
