import React, { useEffect, useMemo, useRef, useState } from 'react'

// The @-menu in the Insights AI composer.
//
// Typing @ offers the skills this sub-account has saved — a skill being a
// database view someone exposed to the AI. Picking one inserts its name as
// plain text; the model reads "@quiet_deals_by_rep" in the question and
// reaches for that tool. Nothing is wired behind the mention: it is a strong
// hint in the question, not a separate instruction channel. That matters —
// the AI can still use a skill without being asked, and can still ignore a
// mention that does not fit what was asked.
//
// WHY IT SHOWS "NO SKILLS" RATHER THAN NOTHING. An @ that silently does
// nothing reads as a broken feature. Saying the list is empty, and where they
// come from, turns a dead keystroke into an answer.
//
// INSIGHTS AI ONLY. Deal AI's answer path is a single schema-constrained call
// with no tool support, so a skill cannot run there. Mounting this in that
// composer would offer a menu of things that silently do nothing.

// The @ that opens the menu must start a word — an email address typed into
// the box should not trigger it.
export function findMentionQuery(text, caret) {
  if (caret == null) return null
  const upto = text.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at === -1) return null
  const before = at === 0 ? '' : upto[at - 1]
  if (before && !/\s/.test(before)) return null
  const query = upto.slice(at + 1)
  // A space closes the menu: the rep has moved on to writing their question.
  if (/\s/.test(query)) return null
  return { start: at, query }
}

export default function SkillMentions({
  skills, loading, query, onPick, onClose, anchorRef
}) {
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  const matches = useMemo(() => {
    const q = (query || '').toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q)
        || (s.description || '').toLowerCase().includes(q)
    )
  }, [skills, query])

  // Reset the highlight whenever the list changes under it, or the keyboard
  // selection points at a row that is no longer there.
  useEffect(() => { setActive(0) }, [query, skills.length])

  // Arrow keys and Enter are handled on the TEXTAREA (it keeps focus), and
  // relayed here through a window event so this component owns the list
  // behaviour without stealing the caret.
  useEffect(() => {
    const onKey = (e) => {
      if (!matches.length) return
      if (e.detail === 'down') setActive((i) => (i + 1) % matches.length)
      if (e.detail === 'up')   setActive((i) => (i - 1 + matches.length) % matches.length)
      if (e.detail === 'pick') onPick(matches[active])
    }
    window.addEventListener('pp-mention-key', onKey)
    return () => window.removeEventListener('pp-mention-key', onKey)
  }, [matches, active, onPick])

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(() => {
    const onDown = (e) => {
      if (anchorRef?.current && !anchorRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [anchorRef, onClose])

  return (
    <div
      role="listbox"
      aria-label="Skills"
      style={{
        position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, right: 0,
        maxWidth: 460, zIndex: 60,
        background: 'var(--surface-raised, #fff)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.13)',
        overflow: 'hidden'
      }}
    >
      <div style={{
        padding: '7px 12px',
        borderBottom: '1px solid var(--border-default)',
        fontSize: 'var(--text-xs)', fontWeight: 600,
        letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
        color: 'var(--text-muted)'
      }}>
        Skills
      </div>

      {loading ? (
        <Note>Loading…</Note>
      ) : skills.length === 0 ? (
        // The empty state carries the explanation. A rep who types @ and sees
        // "no skills" with no context types it again expecting something else.
        <Note>
          <strong style={{ color: 'var(--text-body)' }}>No skills yet.</strong>
          <br />
          A skill lets the AI answer from one of your own data views. They are
          added in the Control panel.
        </Note>
      ) : matches.length === 0 ? (
        <Note>Nothing matches “{query}”.</Note>
      ) : (
        <ul ref={listRef} style={{
          listStyle: 'none', margin: 0, padding: 4,
          maxHeight: 264, overflowY: 'auto'
        }}>
          {matches.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                data-active={i === active}
                role="option"
                aria-selected={i === active}
                // onMouseDown, not onClick: the textarea loses focus on
                // mousedown, which closes the menu before a click ever lands.
                onMouseDown={(e) => { e.preventDefault(); onPick(s) }}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 9px', border: 'none', borderRadius: 7,
                  background: i === active ? 'var(--surface-hover, #f2f4f3)' : 'transparent',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)'
                }}
              >
                <span style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                  fontWeight: 600, color: 'var(--text-heading)'
                }}>
                  @{s.name}
                </span>
                <span style={{
                  display: 'block', marginTop: 1,
                  fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {s.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Note({ children }) {
  return (
    <p style={{
      margin: 0, padding: '12px 13px',
      fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-muted)'
    }}>
      {children}
    </p>
  )
}
