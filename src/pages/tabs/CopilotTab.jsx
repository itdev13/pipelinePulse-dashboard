import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  // Which turn's reasoning panel is open on the right, or null. Index into
  // `turns`, not the turn object itself — turns are replaced wholesale on
  // every setTurns call, so holding a reference would go stale.
  const [openThoughtsFor, setOpenThoughtsFor] = useState(null)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const dictation = useDictation({ q, setQ, onError: setError, inputRef })
  const {
    attachments, addFiles, removeAttachment, clear: clearAttachments,
    preview, setPreview, fileRef, onPaste
  } = useAttachments({ onError: setError })

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
        images: sentImages.map((a) => ({ mediaType: a.mediaType, data: a.data })),
        conversationId
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
          toolCalls: res.toolCalls || [],
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
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
        empty={empty}
        onNewChat={newChat}
        history={history}
        conversationId={conversationId}
        onReopen={reopen}
        onDeleted={(deletedId) => {
          if (deletedId === conversationId) { setTurns([]); setConversationId(null) }
          loadHistory()
        }}
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
                    ? <UserTurn key={i} text={t.content} />
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
  onDeleted,
  // Positioning only — everything else about the sidebar's own look is
  // fixed. Absolute + a width in the empty state (it overlays rather than
  // sharing a grid track, so the greeting can center on the full page); a
  // plain grid item once a conversation exists.
  style
}) {
  // Recents row menu / delete — GHL's own pattern (hover reveals a three-dot
  // button; click opens a small menu; Delete opens a confirmation before
  // anything is removed). Owned here, not in CopilotTab, because nothing
  // outside the rail needs to know a menu is open — only the eventual DELETE
  // needs to reach back up, via onDeleted.
  const [openMenuFor, setOpenMenuFor] = useState(null)          // conversationId | null
  const [confirmDeleteFor, setConfirmDeleteFor] = useState(null) // {conversationId, title} | null
  const [deletingConv, setDeletingConv] = useState(false)
  // One ref per row's three-dot button, keyed by conversationId. The menu
  // portals to document.body (see the note by RecentRow's menu), so it needs
  // a way to find the button it opened from — a getter, not the element
  // itself, since the map is only populated by ref callbacks during the same
  // commit that mounts each row; reading it during THIS render would still
  // be empty. Matches TaskDealsPopover's getAnchor convention.
  const anchorRefs = useRef({})

  const confirmDelete = async () => {
    if (!confirmDeleteFor || deletingConv) return
    setDeletingConv(true)
    try {
      await aiAPI.deleteConversation(confirmDeleteFor.conversationId)
      onDeleted?.(confirmDeleteFor.conversationId)
      setConfirmDeleteFor(null)
    } catch {
      // Modal stays open on failure — closing it here would look like the
      // delete succeeded when it did not.
    } finally {
      setDeletingConv(false)
    }
  }

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

      <nav style={{ display: 'grid', gap: 1, padding: '0 8px' }}>
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
          minHeight: 0, overflowY: 'auto', padding: '0 6px 6px',
          borderTop: '1px solid var(--border-default)'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 10px 6px'
          }}>
            <span className="ms" style={{ fontSize: 15, color: 'var(--text-faint)' }}>history</span>
            <h3 style={{
              margin: 0, flex: 1,
              fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-muted)'
            }}>
              Recents
            </h3>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
              {history.length}
            </span>
          </div>
          {history.map((c) => (
            <RecentRow
              key={c.conversationId}
              conv={c}
              active={c.conversationId === conversationId}
              menuOpen={openMenuFor === c.conversationId}
              menuButtonRef={(el) => { anchorRefs.current[c.conversationId] = el }}
              getAnchor={() => anchorRefs.current[c.conversationId]}
              onSelect={() => onReopen(c)}
              onToggleMenu={() =>
                setOpenMenuFor((cur) => (cur === c.conversationId ? null : c.conversationId))
              }
              onDelete={() => {
                setOpenMenuFor(null)
                setConfirmDeleteFor({ conversationId: c.conversationId, title: c.title })
              }}
            />
          ))}

          {confirmDeleteFor && (
            <DeleteConfirmModal
              title={confirmDeleteFor.title}
              busy={deletingConv}
              onCancel={() => setConfirmDeleteFor(null)}
              onConfirm={confirmDelete}
            />
          )}
        </div>
      )}
    </section>
  )
}

// One Recents row — matches GHL's AskAiSidebarSessionRow.vue measurements:
// row padding 8px 10px, 36px tall, 10px radius; the three-dot button is
// 24×24px sitting at the row's right edge, invisible until the row is
// hovered or its own menu is open (opacity 0 -> 1, not display:none, so it
// animates rather than popping in).
//
// The click target is split into two SIBLING elements — the title button and
// the menu button — rather than one wrapping button with a nested one. A
// button cannot contain a button; GHL's own component has this exact
// comment/structure for the same reason.
function RecentRow({
  conv, active, menuOpen, menuButtonRef, getAnchor, onSelect, onToggleMenu, onDelete
}) {
  const [hovered, setHovered] = useState(false)
  const showMenuButton = hovered || menuOpen
  const titleBtnRef = useRef(null)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        width: '100%', minWidth: 0,
        borderRadius: 10,
        marginBottom: 1,
        background: active || menuOpen ? 'var(--tint-plum)' : 'transparent'
      }}
    >
      <button
        ref={titleBtnRef}
        onClick={onSelect}
        style={{
          display: 'block', flex: '1 1 auto', width: '100%', minWidth: 0,
          textAlign: 'left',
          padding: '8px 10px',
          // Room for the menu button so long titles don't run under it.
          paddingRight: 30,
          height: 36,
          border: 'none', background: 'transparent', borderRadius: 10,
          cursor: 'pointer', fontFamily: 'var(--font-sans)'
        }}
      >
        <span style={{
          display: 'block',
          fontSize: 'var(--text-base)', fontWeight: 600,
          color: 'var(--text-heading)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          {conv.title}
        </span>

      </button>

      {/* The full title on hover — the row itself is clipped to a single
          line, so anything past the ellipsis is otherwise unreadable.
          Portalled for the same reason as RecentMenu: this row sits in a
          list with overflowY: auto, which clips any absolutely-positioned
          child instead of letting it float freely above the row below. */}
      {hovered && !menuOpen && (
        <RowTooltip anchorRef={titleBtnRef} text={conv.title} />
      )}

      <span style={{
        position: 'absolute', top: '50%', right: 4, transform: 'translateY(-50%)'
      }}>
        <button
          ref={menuButtonRef}
          onClick={(e) => { e.stopPropagation(); onToggleMenu() }}
          aria-label="Chat actions"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24,
            border: 'none', borderRadius: 6,
            background: menuOpen ? 'var(--gray-100)' : 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            opacity: showMenuButton ? 1 : 0,
            pointerEvents: showMenuButton ? 'auto' : 'none',
            transition: 'opacity 120ms ease, background 120ms ease'
          }}
        >
          <span className="ms" style={{ fontSize: 16 }}>more_horiz</span>
        </button>
      </span>

      {/* Portalled — see RecentMenu below. The row sits in a list with
          overflowY: auto, which CLIPS any absolutely-positioned descendant
          to its own bounds no matter the z-index. The menu was rendering
          submerged into the next row instead of floating above it. */}
      {menuOpen && (
        <RecentMenu getAnchor={getAnchor} onClose={onToggleMenu} onDelete={onDelete} />
      )}
    </div>
  )
}

// The full conversation title, shown beside a truncated Recents row on
// hover. Portalled to the body for the same reason as RecentMenu below —
// the row sits inside an overflowY:auto list, which clips an
// absolutely-positioned child to its own bounds rather than letting it
// float freely over whatever comes after it.
function RowTooltip({ anchorRef, text }) {
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    const el = anchorRef?.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // To the right of the row, vertically centered on it — matching the
    // GHL reference rather than the above-the-trigger placement IconButton
    // uses, since this row runs the full sidebar width and a tooltip
    // ABOVE it would sit over the row before it instead of beside this one.
    setPos({ left: r.right + 8, top: r.top + r.height / 2 })
  }, [anchorRef])

  if (!pos) return null

  return createPortal(
    <span
      role="tooltip"
      className="pp-portal"
      style={{
        position: 'fixed',
        left: pos.left, top: pos.top, transform: 'translateY(-50%)',
        zIndex: 50,
        // The FULL title, unclipped — that is this tooltip's whole job, so
        // it must not re-truncate what the row already ellipsized. It can
        // run off the right edge of a narrow viewport; that is an acceptable
        // trade against silently hiding part of the title again.
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        padding: '6px 12px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--gray-800)', color: '#fff',
        fontSize: 'var(--text-base)', fontWeight: 500,
        boxShadow: 'var(--shadow-raised)'
      }}
    >
      {text}
    </span>,
    document.body
  )
}

// The Recents row's "..." menu, portalled to the body and measured against
// its trigger button — same convention as TaskDealsPopover (see its own
// header comment for the full rationale).
function RecentMenu({ getAnchor, onClose, onDelete }) {
  const boxRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    const place = () => {
      const el = getAnchor?.()
      if (!el) return
      const r = el.getBoundingClientRect()
      const W = 140
      const GAP = 4
      setPos({
        left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)),
        top: r.bottom + GAP
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [getAnchor])

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return
      // The trigger toggles on its own click; without this the menu would
      // close here and reopen from the toggle in the same gesture.
      if (getAnchor?.()?.contains(e.target)) return
      onClose()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, getAnchor])

  if (!pos) return null

  return createPortal(
    <div
      ref={boxRef}
      role="menu"
      // .pp-portal — the design tokens and the icon font are scoped to
      // [data-dealhub], which a body portal escapes.
      className="pp-portal"
      style={{
        position: 'fixed',
        left: pos.left, top: pos.top,
        minWidth: 140, zIndex: 50,
        background: '#fff',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 16px rgba(31, 36, 48, 0.14)',
        padding: 4
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        role="menuitem"
        onClick={onDelete}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '7px 9px',
          border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--status-stuck-text)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          cursor: 'pointer', textAlign: 'left'
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>delete</span>
        Delete chat
      </button>
    </div>,
    document.body
  )
}

// The confirmation before a chat is actually removed — matching GHL's
// deleteConfirmTitle/deleteConfirmBody pattern: name the chat being deleted,
// so a rep who opened the wrong row's menu sees which one they are about to
// lose before it happens.
function DeleteConfirmModal({ title, busy, onCancel, onConfirm }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15, 18, 24, 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxWidth: 'calc(100vw - 32px)',
          background: '#fff', borderRadius: 'var(--radius-lg)',
          boxShadow: '0 12px 40px rgba(15, 18, 24, 0.25)',
          padding: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <span
            className="ms"
            style={{ fontSize: 20, color: 'var(--status-stuck-text)', marginTop: 1 }}
          >
            warning
          </span>
          <h3 style={{
            margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600,
            color: 'var(--text-heading)'
          }}>
            Delete this chat?
          </h3>
        </div>
        <p style={{
          margin: '0 0 18px 30px', fontSize: 'var(--text-md)', lineHeight: 1.55,
          color: 'var(--text-muted)'
        }}>
          "{title}" will be permanently deleted. This cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              height: 36, padding: '0 15px',
              border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
              background: '#fff', color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
              cursor: busy ? 'default' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              height: 36, padding: '0 15px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--status-stuck)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1
            }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
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
        height: 32, padding: collapsed ? 0 : '0 10px',
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
      textAlign: 'center', gap: 8, padding: '72px 16px 24px',
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

        <ReactionRow runId={turn.runId} answerText={turn.answerText} />
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

// Thumbs up/down + copy, under the answer text — GHL shows these without a
// card around them, so they read as acting on the text above rather than as
// controls on a separate panel.
// Thumbs up/down + copy, under the answer text. These rendered before but
// did nothing — three buttons with a tooltip and no onClick, the exact "dead
// control" shape flagged earlier in this tab's own history (the Make-task
// chip). Now real:
//
//   * up/down    POST /api/ai/runs/:runId/rating — a run with no runId (the
//                facts-only path can have one; a failed turn never reaches
//                this component at all) still degrades to disabled rather
//                than silently eating the click.
//   * copy       clipboard only, no server round trip needed for it.
function ReactionRow({ runId, answerText }) {
  const [rated, setRated] = useState(null)   // 'up' | 'down' | null
  const [copied, setCopied] = useState(false)
  const [savingRating, setSavingRating] = useState(false)

  const rate = async (value) => {
    if (!runId || savingRating) return
    // Optimistic: a rating is low-stakes feedback, not a record the rep needs
    // to see confirmed before moving on. Toggling — clicking the same one
    // again clears it — matches "I changed my mind" without a third button.
    const next = rated === value ? null : value
    setRated(next)
    setSavingRating(true)
    try {
      if (next) await aiAPI.rateRun(runId, { rating: next })
      // Clearing a rating has no "un-rate" endpoint — the row underneath is
      // upserted by run_id, so the last non-null rating a rep sent is what
      // persists. Good enough: nothing currently reads "no opinion" as a
      // distinct signal from "never asked".
    } catch {
      // A failed rating is not worth interrupting the rep over — the answer
      // is still fully usable without it having saved.
      setRated(rated)
    } finally {
      setSavingRating(false)
    }
  }

  const copy = async () => {
    if (!answerText) return
    try {
      await navigator.clipboard.writeText(answerText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS, an iframe
      // without the clipboard-write policy — this tab runs inside one).
      // Failing quietly is right here: there is nothing actionable to tell a
      // rep beyond "try selecting the text yourself".
    }
  }

  const btnStyle = (active) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, border: 'none', borderRadius: 'var(--radius-sm)',
    background: active ? 'var(--tint-pine)' : 'transparent',
    color: active ? 'var(--accent-pine-text)' : 'var(--text-faint)',
    cursor: runId || false ? 'pointer' : 'default'
  })

  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
      <button
        title={runId ? 'Good answer' : undefined}
        disabled={!runId}
        onClick={() => rate('up')}
        style={btnStyle(rated === 'up')}
      >
        <span className="ms" style={{ fontSize: 17 }}>thumb_up</span>
      </button>
      <button
        title={runId ? 'Bad answer' : undefined}
        disabled={!runId}
        onClick={() => rate('down')}
        style={btnStyle(rated === 'down')}
      >
        <span className="ms" style={{ fontSize: 17 }}>thumb_down</span>
      </button>
      <button
        title="Copy"
        onClick={copy}
        style={btnStyle(copied)}
      >
        <span className="ms" style={{ fontSize: 17 }}>
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
    </div>
  )
}

// Tool names are snake_case identifiers the model reads; a rep should see what
// it MEANT. An unknown name degrades to a readable form rather than vanishing.
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
  value, onChange, onSubmit, pending, inputRef, dictation,
  attachments, onAddFiles, onRemoveAttachment, onViewAttachment,
  fileRef, onPaste
}) {
  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { supported: speechSupported, listening, heard, elapsed, start, finish, cancel } = dictation

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
          onPaste={onPaste}
          disabled={pending}
          placeholder={pending ? 'Reading the pipeline…' : 'Ask anything about your deals…'}
          rows={1}
          style={{
            flex: 1, minWidth: 0,
            minHeight: 26, maxHeight: 140, resize: 'none',
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
    </div>
  )
}
