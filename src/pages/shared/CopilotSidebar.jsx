import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { aiAPI } from '../../api/ai'
import SettingsModal from './SettingsModal'

// The Co-Pilot sidebar shell — New chat / Search / Templates / Customize,
// the Recents list (rename/delete), and the Account entry (Settings +
// Memory). Shared by the portfolio-wide Co-Pilot tab (CopilotTab.jsx) and
// Deal Hub's per-deal Co-Pilot (AskDeal.jsx): same UI either way, driven
// entirely by the `history`/callbacks passed in — the caller decides
// whether that history is every conversation in the pipeline or just one
// deal's own. Extracted from CopilotTab.jsx rather than duplicated, so a
// future tweak to this shell only has to happen once.

const NAV_ITEMS = [
  { key: 'templates', icon: 'auto_stories', label: 'Templates' },
  { key: 'customize', icon: 'grid_view',    label: 'Customize' }
]

export default function CopilotSidebar({
  collapsed, onToggleCollapsed, empty, onNewChat, history, conversationId, onReopen,
  onDeleted, onRenamed, fullName,
  // The Recents LIST's own show/hide, separate from `collapsed` above (which
  // shrinks the whole sidebar to an icon rail). Matches the GHL reference's
  // chevron on the "Recents" header.
  recentsCollapsed, onToggleRecentsCollapsed,
  // Positioning only — everything else about the sidebar's own look is
  // fixed. Absolute + a width in the empty state (it overlays rather than
  // sharing a grid track, so the greeting can center on the full page); a
  // plain grid item once a conversation exists.
  style
}) {
  // Recents row menu / delete — GHL's own pattern (hover reveals a three-dot
  // button; click opens a small menu; Delete opens a confirmation before
  // anything is removed). Owned here, not by the caller, because nothing
  // outside the rail needs to know a menu is open — only the eventual DELETE
  // needs to reach back up, via onDeleted.
  const [openMenuFor, setOpenMenuFor] = useState(null)          // conversationId | null
  const [confirmDeleteFor, setConfirmDeleteFor] = useState(null) // {conversationId, title} | null
  const [deletingConv, setDeletingConv] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [renamingFor, setRenamingFor] = useState(null)          // conversationId | null

  const commitRename = async (conversationId, title) => {
    setRenamingFor(null)
    const trimmed = title.trim()
    const current = history.find((c) => c.conversationId === conversationId)
    // Blank, or unchanged — nothing to save, and an empty title would just
    // fall back to the original question server-side anyway.
    if (!trimmed || !current || trimmed === current.title) return
    try {
      await aiAPI.renameConversation(conversationId, trimmed)
      onRenamed?.(conversationId, trimmed)
    } catch {
      // Rail keeps the old title on failure — silently applying a rename
      // that didn't actually persist would be worse than a no-op.
    }
  }
  // Search — a real live-filter over Recents (matching GHL), not a
  // placeholder. Client-side only: it filters the same `history` array
  // already loaded for the rail, no extra request needed.
  //
  // Inline, above Recents — not a separate overlay panel. Clicking "Search"
  // reveals the input right here in the sidebar column, ahead of the
  // Recents header, and it stays visible regardless of the Recents
  // chevron's own collapsed/expanded state.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)

  const closeSearch = () => { setSearchOpen(false); setSearchQuery('') }

  const filteredHistory = searchOpen && searchQuery.trim()
    ? history.filter((c) => (c.title || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : history

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])
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
    <>
    {/* Flat, flush to the conversation pane — a right-edge divider rather
        than a bordered/rounded card, matching the GHL reference's edge-to-edge
        look now that the whole tab has dropped its outer card frame too. */}
    <section style={{
      borderRight: '1px solid var(--border-default)',
      background: 'var(--gray-25)', overflow: 'hidden',
      display: 'grid', gridTemplateRows: 'auto auto auto 1fr auto', minHeight: 0,
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

      {/* nav + the (conditional) search input share ONE grid row on the
          outer section — gridTemplateRows below has a fixed track count, and
          the search input used to be a sibling row of its own, which threw
          off which track everything after it landed on: the Recents block's
          `1fr` track ended up sized to the search input's row instead, and
          Recents itself got squeezed into whatever was left (the empty gap
          bug). Wrapping both in one div keeps the section's child count,
          and therefore its row tracks, unchanged regardless of whether
          search is open. */}
      <div>
        <nav style={{ display: 'grid', gap: 1, padding: '0 8px' }}>
          <SidebarButton
            icon="edit_square" label="New chat" collapsed={collapsed}
            disabled={empty} onClick={onNewChat}
            title={empty ? 'Already on a new chat' : 'Start a fresh conversation'}
          />
          <SidebarButton
            icon="search" label="Search" collapsed={collapsed}
            disabled={collapsed || history.length === 0}
            title={collapsed ? 'Expand the sidebar to search' : 'Search chats'}
            onClick={() => {
              setSearchOpen((open) => {
                const next = !open
                if (!next) setSearchQuery('')
                return next
              })
            }}
          />
          {NAV_ITEMS.map((item) => (
            <SidebarButton
              key={item.key} icon={item.icon} label={item.label}
              collapsed={collapsed} disabled
              title={`${item.label} — coming soon`}
            />
          ))}
        </nav>

        {!collapsed && searchOpen && (
          <div style={{ padding: '8px 10px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6,
              height: 30, padding: '0 8px',
              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
              background: '#fff'
            }}>
              <span className="ms" style={{ fontSize: 15, color: 'var(--text-faint)' }}>search</span>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') closeSearch() }}
                placeholder="Search chats"
                style={{
                  flex: 1, minWidth: 0, border: 'none', outline: 'none',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-body)'
                }}
              />
            </div>
            <button
              onClick={closeSearch}
              title="Close search"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, flex: 'none',
                border: 'none', borderRadius: 'var(--radius-sm)',
                background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer'
              }}
            >
              <span className="ms" style={{ fontSize: 16 }}>close</span>
            </button>
          </div>
        )}
      </div>

      <div style={{ height: 8 }} />

      {/* ── chat history ─────────────────────────────────────── */}
      {collapsed ? null : history.length === 0 ? (
        <HistoryEmptyState onNewChat={onNewChat} />
      ) : (
        <div style={{
          minHeight: 0,
          // Only the ROW LIST scrolls/hides on the chevron toggle; the
          // header stays put so there's always something to click back on.
          display: 'grid', gridTemplateRows: 'auto 1fr',
          borderTop: '1px solid var(--border-default)'
        }}>
          <button
            onClick={onToggleRecentsCollapsed}
            aria-expanded={!recentsCollapsed}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '10px 10px 6px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'var(--font-sans)'
            }}
          >
            <h3 style={{
              margin: 0, flex: 1, textAlign: 'left',
              fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-muted)'
            }}>
              Recents
            </h3>
            <span
              className="ms"
              style={{
                fontSize: 18, color: 'var(--text-faint)',
                transition: 'transform 120ms ease',
                // Right when collapsed, down when open — same chevron,
                // rotated, rather than swapping icon glyphs.
                transform: recentsCollapsed ? 'rotate(-90deg)' : 'none'
              }}
            >
              expand_more
            </span>
          </button>

          {!recentsCollapsed && (
            <div style={{ minHeight: 0, overflowY: 'auto', padding: '0 6px 6px' }}>
              {searchOpen && searchQuery.trim() && filteredHistory.length === 0 && (
                <p style={{
                  margin: '8px 4px', fontSize: 'var(--text-sm)', color: 'var(--text-faint)',
                  textAlign: 'center'
                }}>
                  No chats match "{searchQuery.trim()}"
                </p>
              )}
              {filteredHistory.map((c) => (
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
                  renaming={renamingFor === c.conversationId}
                  onStartRename={() => setRenamingFor(c.conversationId)}
                  onCommitRename={(title) => commitRename(c.conversationId, title)}
                  onCancelRename={() => setRenamingFor(null)}
                  onDelete={() => {
                    setOpenMenuFor(null)
                    setConfirmDeleteFor({ conversationId: c.conversationId, title: c.title })
                  }}
                />
              ))}
            </div>
          )}

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

      {/* Account — opens Personalization (memory management) and Keyboard
          shortcuts, matching the GHL reference's bottom-of-sidebar entry. */}
      <button
        onClick={() => setSettingsOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: collapsed ? '10px 0' : '10px 13px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          border: 'none', borderTop: '1px solid var(--border-default)',
          background: 'transparent', cursor: 'pointer',
          fontFamily: 'var(--font-sans)'
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, flex: 'none',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--accent-plum)', color: '#fff',
          fontSize: 'var(--text-sm)', fontWeight: 600
        }}>
          {initialsOf(fullName)}
        </span>
        {!collapsed && (
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)', fontWeight: 500 }}>
            Account
          </span>
        )}
      </button>
    </section>

    {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

// "JS" from "James Smith" — first + last initial, matching the GHL
// reference's avatar. Falls back to a generic mark when the name hasn't
// resolved yet (the same lookup the caller uses for its own greeting).
function initialsOf(name) {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
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
  conv, active, menuOpen, menuButtonRef, getAnchor, onSelect, onToggleMenu,
  renaming, onStartRename, onCommitRename, onCancelRename, onDelete
}) {
  const [hovered, setHovered] = useState(false)
  const showMenuButton = hovered || menuOpen
  const titleBtnRef = useRef(null)
  const [draftTitle, setDraftTitle] = useState(conv.title)
  const renameInputRef = useRef(null)

  useEffect(() => {
    if (renaming) setDraftTitle(conv.title)
  }, [renaming, conv.title])

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renaming])

  if (renaming) {
    return (
      <div style={{ padding: '8px 10px', marginBottom: 1 }}>
        <input
          ref={renameInputRef}
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename(draftTitle)
            if (e.key === 'Escape') onCancelRename()
          }}
          onBlur={() => onCommitRename(draftTitle)}
          style={{
            width: '100%', height: 28, padding: '0 8px',
            border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 600,
            color: 'var(--text-heading)', outline: 'none'
          }}
        />
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        width: '100%', minWidth: 0,
        borderRadius: 10,
        marginBottom: 1,
        // Neutral grey, matching GHL — not the app's plum accent. This row
        // means "which chat you're on", not "AI-branded", so it takes the
        // same quiet grey a hovered/selected row gets everywhere else.
        background: active || menuOpen ? 'var(--gray-100)' : 'transparent'
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
          // Selected reads as committed-to-black, matching GHL; an
          // unselected row stays a muted body grey so the active chat is
          // the one thing that visually jumps out of the list.
          color: active ? 'var(--text-heading)' : 'var(--text-muted)',
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
        <RecentMenu
          getAnchor={getAnchor}
          onClose={onToggleMenu}
          onRename={() => { onToggleMenu(); onStartRename() }}
          onDelete={onDelete}
        />
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
function RecentMenu({ getAnchor, onClose, onRename, onDelete }) {
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
        onClick={onRename}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '7px 9px',
          border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--text-body)',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          cursor: 'pointer', textAlign: 'left'
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>edit</span>
        Rename
      </button>
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
