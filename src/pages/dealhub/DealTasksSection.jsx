import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { tasksAPI } from '../../api/tasks'
import { notesAPI } from '../../api/notes'
import { formatDue, relativeTime, RichBody } from '../shared/ListChrome'
import TaskEditor from '../shared/TaskEditor'
import NoteEditor from '../shared/NoteEditor'
import ConfirmDialog from '../shared/ConfirmDialog'

// Tasks and Notes for the open deal, in the Deal Hub's right rail.
//
// Deliberately server-filtered by dealId rather than reusing the Tasks/Notes
// tab data: those lists are location-wide and paginated, so filtering them
// client-side would show only whatever happened to be on the loaded page.
//
// The status filter and both sorts run client-side. That's correct here and not
// a shortcut: the rail fetches every task on the deal in one request (a deal has
// tens, not thousands), so the set is complete and re-sorting it is instant. A
// server round trip per sort click would be slower and no more accurate.
//
// Both are writable: create, edit, delete and (for tasks) tick all reach the
// CRM — see the server's ghlTaskWrite.js and ghlNoteWrite.js.
//
// Tasks and notes both belong to a CONTACT, not to a deal, so creating either
// from here needs a person picked from the deal — which is why `people` is
// passed in.

export function DealTasksSection({ dealId, people = [] }) {
  const { items, loading, error, patchItem, reload } = useDealList(
    dealId,
    (id) => tasksAPI.list({ dealId: id, status: 'all', limit: 50 }),
    'tasks'
  )

  const [status, setStatus] = useState('open')
  const [sort, setSort] = useState('due')
  const [editor, setEditor] = useState(null)
  const [saving, setSaving] = useState(() => new Set())
  const [failed, setFailed] = useState(null)
  // The task queued for deletion. Same treatment as notes: the CRM keeps no
  // recycle bin we can reach, so it's confirmed and shown before it goes.
  const [confirming, setConfirming] = useState(null)
  const [confirmError, setConfirmError] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const removeTask = async () => {
    const t = confirming
    if (!t || deleting) return
    setDeleting(t.id)
    setConfirmError(null)
    setFailed(null)
    try {
      await tasksAPI.remove(t.id)
      setConfirming(null)
      reload()
    } catch (err) {
      setConfirmError(err.message || 'Could not delete that task')
    } finally {
      setDeleting(null)
    }
  }

  // Tick now, write, roll back on failure. Same contract as the Tasks page.
  const toggle = async (t) => {
    if (saving.has(t.id)) return
    const was = t.status
    const next = was === 'open'

    setSaving((s) => new Set(s).add(t.id))
    setFailed(null)
    patchItem((x) => x.id === t.id, { status: next ? 'completed' : 'open' })

    try {
      const { task } = await tasksAPI.setCompleted(t.id, next)
      patchItem((x) => x.id === t.id, {
        status: task?.completed === false ? 'open' : 'completed'
      })
    } catch (err) {
      patchItem((x) => x.id === t.id, { status: was })
      setFailed(err.message || 'Could not save that — try again')
    } finally {
      setSaving((s) => { const n = new Set(s); n.delete(t.id); return n })
    }
  }

  const counts = useMemo(() => {
    const open = items.filter((t) => t.status === 'open').length
    return { open, completed: items.length - open, all: items.length }
  }, [items])

  const shown = useMemo(() => {
    const filtered =
      status === 'all' ? items
        : status === 'open' ? items.filter((t) => t.status === 'open')
          : items.filter((t) => t.status !== 'open')

    // Copy before sorting — items is the fetched array and sorting in place
    // would mutate it, so the next filter change would start from a reordered
    // list rather than the server's order.
    return [...filtered].sort((a, b) =>
      sort === 'due'
        // Soonest first, and a task with no due date sorts last: it isn't
        // urgent, and putting it above an overdue one buries what matters.
        ? nullsLast(a.dueAt, b.dueAt, 'asc')
        // Newest first.
        : nullsLast(a.createdAt, b.createdAt, 'desc')
    )
  }, [items, status, sort])

  return (
    <Rail
      icon="task_alt"
      title="Tasks"
      accent="rose"
      meta={loading ? null : `${counts.open} open`}
      blurb="Yours and the agent's, in one list. The agent creates a task only when an action is agreed in chat and you confirm it. Syncs two-way with your CRM — most recently updated wins."
      toolbar={
        !loading && items.length > 0 ? (
          <>
            <Segment
              options={[
                ['open', 'Open', counts.open],
                ['completed', 'Completed', counts.completed],
                ['all', 'All', counts.all]
              ]}
              value={status}
              onChange={setStatus}
            />
            <span style={{ flex: 1 }} />
            <SortControl
              label="Sort"
              options={[['due', 'Due date'], ['created', 'Created']]}
              value={sort}
              onChange={setSort}
            />
          </>
        ) : null
      }
      footer={
        !loading ? (
          <RailFooter
            newLabel="New task"
            allLabel="All tasks"
            onNew={() => setEditor({ task: null })}
            newDisabledReason={
              people.length === 0
                ? 'This deal has no contacts, and a task is stored against a contact'
                : null
            }
          />
        ) : null
      }
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyText="No tasks on this deal yet."
    >
      {/* An empty result from a filter is different from an empty deal — say
          which, or the Completed tab on a deal with two open tasks looks
          broken. */}
      {!loading && items.length > 0 && shown.length === 0 && (
        <Muted>
          {status === 'completed' ? 'Nothing completed yet.' : 'No open tasks.'}
        </Muted>
      )}

      {shown.map((t, i) => (
        <Row key={t.id} last={i === shown.length - 1} dim={t.status !== 'open'}>
          <button
            onClick={() => toggle(t)}
            disabled={saving.has(t.id)}
            title={
              saving.has(t.id)
                ? 'Saving…'
                : t.status === 'open' ? 'Mark complete' : 'Reopen this task'
            }
            style={{
              flex: 'none', marginTop: 1,
              width: 18, height: 18, padding: 0,
              border: `1.5px solid ${
                t.status !== 'open'
                  ? 'var(--status-done)'
                  : t.overdue
                    ? 'var(--status-stuck)'
                    : 'var(--border-strong)'
              }`,
              borderRadius: t.status === 'open' ? '50%' : 'var(--radius-sm)',
              background: t.status !== 'open' ? 'var(--status-done)' : '#fff',
              cursor: saving.has(t.id) ? 'progress' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {t.status !== 'open' && (
              <span className="ms" style={{ fontSize: 13, color: '#fff' }}>check</span>
            )}
          </button>

          <div style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)',
                textDecoration: t.status === 'open' ? 'none' : 'line-through'
              }}
            >
              {t.title || '(untitled task)'}
            </span>

            {t.body && (
              <div style={{ marginTop: 2 }}>
                <RichBody
                  html={t.body}
                  color="var(--text-muted)"
                  size="var(--text-md)"
                  leading="var(--leading-normal)"
                  maxWidth={480}
                />
              </div>
            )}

            <span
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                marginTop: 5, flexWrap: 'wrap',
                fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
              }}
            >
              {[
                formatDue(t.dueAt),
                t.createdAt ? `added ${compactAge(t.createdAt)}` : null,
                t.owner
              ].filter(Boolean).join(' · ')}
              {t.overdue && t.status === 'open' && <OverduePill />}
            </span>
          </div>

          <EditButton
            title="Edit this task"
            onClick={() => setEditor({ task: t })}
          />
          <button
            onClick={() => { setConfirmError(null); setConfirming(t) }}
            disabled={deleting === t.id}
            title="Delete this task"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flex: 'none',
              width: 28, height: 28, padding: 0,
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              background: '#fff',
              cursor: deleting === t.id ? 'progress' : 'pointer',
              color: 'var(--status-stuck-text)'
            }}
          >
            <span
              className={deleting === t.id ? 'ms pp-spin' : 'ms'}
              style={{ fontSize: 15 }}
            >
              {deleting === t.id ? 'progress_activity' : 'close'}
            </span>
          </button>
        </Row>
      ))}

      {/* A failed write needs saying. The rail has no toast of its own, and a
          checkbox that silently sprang back would look like a glitch. */}
      {failed && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            padding: '9px 14px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)'
          }}
        >
          <span className="ms" style={{ fontSize: 15, flex: 'none', marginTop: 1 }}>error</span>
          {failed}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete this task?"
          message="This cannot be undone from here."
          preview={taskPreview(confirming)}
          confirmLabel="Delete task"
          busy={deleting === confirming.id}
          error={confirmError}
          onConfirm={removeTask}
          onCancel={() => { setConfirming(null); setConfirmError(null) }}
        />
      )}

      {editor && (
        <TaskEditor
          task={editor.task}
          contacts={people}
          defaultContactId={
            editor.task?.contact?.id
            || people.find((p) => p.primary)?.id
            || people[0]?.id
            || null
          }
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            if (editor.task && saved) {
              patchItem((x) => x.id === editor.task.id, {
                title: saved.title ?? editor.task.title,
                body: saved.body ?? editor.task.body,
                dueAt: saved.dueDate ?? editor.task.dueAt
              })
            } else {
              // A new task arrives via the CRM's webhook, so refetch rather
              // than inventing a row whose id and attribution we don't know.
              reload()
            }
          }}
        />
      )}
    </Rail>
  )
}

export function DealNotesSection({ dealId, people = [] }) {
  const { items, loading, error, patchItem, reload } = useDealList(
    dealId,
    (id) => notesAPI.list({ dealId: id, limit: 50 }),
    'notes'
  )

  const [sort, setSort] = useState('newest')
  const [editor, setEditor] = useState(null)
  const [failed, setFailed] = useState(null)
  const [busy, setBusy] = useState(null)

  // Who a new note attaches to: the note's own contact when editing, else the
  // deal's primary. GHL names an opportunity after its contact and the primary
  // is who the deal is about, so that's the sensible default.
  const targetContactId = editor?.note?.contact?.id
    || people.find((p) => p.primary)?.id
    || people[0]?.id
    || null

  // The note queued for deletion. Final — the CRM has no restore over OAuth —
  // so the dialog says so and shows the note's own text.
  const [confirming, setConfirming] = useState(null)
  const [confirmError, setConfirmError] = useState(null)

  const remove = async () => {
    const n = confirming
    if (!n || busy) return
    setBusy(n.id)
    setConfirmError(null)
    setFailed(null)
    try {
      await notesAPI.remove(n.id)
      setConfirming(null)
      reload()
    } catch (err) {
      // Inside the dialog, which stays open, rather than in the rail's error
      // strip behind it.
      setConfirmError(err.message || 'Could not delete that note')
    } finally {
      setBusy(null)
    }
  }

  const shown = useMemo(
    () => [...items].sort((a, b) =>
      nullsLast(a.createdAt, b.createdAt, sort === 'newest' ? 'desc' : 'asc')
    ),
    [items, sort]
  )

  return (
    <Rail
      icon="sticky_note_2"
      title="Notes"
      accent="gold"
      meta={loading ? null : `${items.length} ${items.length === 1 ? 'note' : 'notes'}`}
      toolbar={
        !loading && items.length > 0 ? (
          <>
            <span
              style={{
                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase', color: 'var(--text-muted)'
              }}
            >
              Sort by created
            </span>
            <span style={{ flex: 1 }} />
            <SortControl
              options={[['newest', 'Newest'], ['oldest', 'Oldest']]}
              value={sort}
              onChange={setSort}
            />
          </>
        ) : null
      }
      footer={
        !loading ? (
          <RailFooter
            newLabel="New note"
            allLabel="All notes"
            onNew={() => setEditor({ note: null })}
            newDisabledReason={
              people.length === 0
                ? 'This deal has no contacts, and a note is stored against a contact'
                : null
            }
          />
        ) : null
      }
      loading={loading}
      error={error}
      empty={!loading && items.length === 0}
      emptyText="No notes on this deal yet."
    >
      {shown.map((n, i) => {
        const { heading, rest } = splitNote(n.body)
        return (
          <Row key={n.id} last={i === shown.length - 1}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, flex: 'none',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--tint-gold)', color: 'var(--accent-gold-text)'
              }}
            >
              <span className="ms" style={{ fontSize: 15 }}>sticky_note_2</span>
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
                }}
              >
                {heading}
              </span>
              {rest && (
                <div style={{ marginTop: 3 }}>
                  {/* The narrow rail still gets readable body text — 13px, one
                      step down from the timeline's 14px because the column is
                      half the width, but not the 12px muted it was. */}
                  <RichBody
                    html={rest}
                    color="var(--text-body)"
                    size="var(--text-md)"
                    leading="var(--leading-normal)"
                    maxWidth={480}
                  />
                </div>
              )}
              <span
                style={{
                  display: 'block', marginTop: 5,
                  fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
                }}
              >
                {[n.author, relativeTime(n.createdAt)].filter(Boolean).join(' · ')}
              </span>
            </div>

            <EditButton
              title="Edit this note"
              onClick={() => setEditor({ note: n })}
            />
            <button
              onClick={() => { setConfirmError(null); setConfirming(n) }}
              disabled={busy === n.id}
              title="Delete this note"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flex: 'none',
                width: 28, height: 28, padding: 0,
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                background: '#fff',
                cursor: busy === n.id ? 'progress' : 'pointer',
                color: 'var(--status-stuck-text)'
              }}
            >
              <span
                className={busy === n.id ? 'ms pp-spin' : 'ms'}
                style={{ fontSize: 15 }}
              >
                {busy === n.id ? 'progress_activity' : 'close'}
              </span>
            </button>
          </Row>
        )
      })}

      {failed && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            padding: '9px 14px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)'
          }}
        >
          <span className="ms" style={{ fontSize: 15, flex: 'none', marginTop: 1 }}>error</span>
          {failed}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete this note?"
          message="This cannot be undone — your CRM has no restore for notes."
          preview={notePreview(confirming)}
          confirmLabel="Delete note"
          busy={busy === confirming.id}
          error={confirmError}
          onConfirm={remove}
          onCancel={() => { setConfirming(null); setConfirmError(null) }}
        />
      )}

      {editor && (
        <NoteEditor
          note={editor.note}
          contacts={people}
          defaultContactId={targetContactId}
          // How many notes are already pinned on the target contact, so the pin
          // toggle can say when there's no room rather than failing on save.
          pinnedCount={
            items.filter((x) => x.pinned && x.contact?.id === targetContactId).length
          }
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            if (editor.note && saved) {
              patchItem((x) => x.id === editor.note.id, {
                body: saved.body ?? editor.note.body,
                title: saved.title ?? null,
                color: saved.color ?? null,
                pinned: saved.pinned === true
              })
            } else {
              // A new note arrives via the webhook, so refetch rather than
              // inventing a row whose id and attribution we don't know.
              reload()
            }
          }}
        />
      )}
    </Rail>
  )
}

// ── Shared ────────────────────────────────────────────────────────────

// A task as plain text for the confirm dialog. The title alone is often
// "Follow Up" — identical across a dozen rows — so the due date goes in too, as
// that is what actually distinguishes them in the queue.
function taskPreview(task) {
  const title = (task.title || '').trim() || '(untitled task)'
  const due = formatDue(task.dueAt)
  return due ? `${title} · ${due}` : title
}

// A note as plain text for the confirm dialog. Bodies are markup, so the tags
// have to come off — otherwise the reader sees "<p>Hi Ollie</p>" and can't tell
// whether it's the right note.
function notePreview(note) {
  const title = (note.title || '').trim()
  const raw = String(note.body || '')
  let text = raw
  if (/<[a-z][^>]*>/i.test(raw)) {
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    // Block boundaries are NOT whitespace in textContent, so
    // "<p>Hi Ollie</p><p>Thanks</p>" reads as "Hi OllieThanks" without this —
    // two sentences fused into a non-word, in the one place the reader is
    // checking they picked the right note.
    doc.querySelectorAll('br').forEach((el) => el.replaceWith(' '))
    doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6')
      .forEach((el) => el.append(' '))
    text = doc.body.textContent || ''
  }
  const body = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  if (title && body) return `${title} — ${body}`
  return title || body || '(empty note)'
}

function useDealList(dealId, fetcher, key) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Bumped to refetch — used after creating a task, whose row only exists once
  // the CRM's webhook has reached our database.
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!dealId) return
    let alive = true
    setLoading(true)
    setError(null)
    fetcher(dealId)
      .then((r) => { if (alive) setItems(r?.[key] || []) })
      .catch((err) => { if (alive) setError(err?.message || 'Failed to load') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // fetcher is recreated per render; dealId is what defines the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, key, nonce])

  // Patch one row in place. A tick that refetched the whole rail would flicker
  // and lose the rep's filter position for no gain.
  const patchItem = useCallback((match, patch) => {
    setItems((prev) => prev.map((x) => (match(x) ? { ...x, ...patch } : x)))
  }, [])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { items, loading, error, patchItem, reload }
}

function Rail({
  icon, title, accent, meta, blurb, toolbar, footer,
  loading, error, empty, emptyText, children
}) {
  const color = `var(--accent-${accent}-text)`
  const tint = `var(--tint-${accent})`
  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: color,
        ['--panel-tint']: tint,
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: 'var(--space-3) 14px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--panel-tint, var(--gray-25))'
        }}
      >
        <span className="ms" style={{ fontSize: 19, color }}>{icon}</span>
        <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color, margin: 0, flex: 1 }}>
          {title}
        </h3>
        {meta != null && (
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>{meta}</span>
        )}
      </header>

      {blurb && (
        <p
          style={{
            margin: 0, padding: '11px 14px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--gray-50)',
            fontSize: 'var(--text-base)', lineHeight: 1.55, color: 'var(--text-body)'
          }}
        >
          {blurb}
        </p>
      )}

      {toolbar && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
            padding: '9px 14px',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          {toolbar}
        </div>
      )}

      {loading && <Muted>Loading…</Muted>}
      {error && (
        <p
          style={{
            margin: 0, padding: 'var(--space-3) 14px',
            borderLeft: '3px solid var(--status-stuck)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-base)', color: 'var(--status-stuck)'
          }}
        >
          {error}
        </p>
      )}
      {empty && <Muted>{emptyText}</Muted>}
      {children}
      {footer}
    </section>
  )
}

function Row({ children, last, dim }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '11px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border-default)',
        // A completed task stays visible but recedes — useful history, not
        // something needing attention.
        opacity: dim ? 0.55 : 1
      }}
    >
      {children}
    </div>
  )
}

// Open / Completed / All, each with its count.
function Segment({ options, value, onChange }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([id, label, count]) => {
        const active = value === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              cursor: 'pointer',
              height: 27, padding: '0 10px',
              border: active
                ? '1.5px solid var(--brand-primary)'
                : '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: active ? 'var(--brand-primary)' : '#fff',
              color: active ? '#fff' : 'var(--text-body)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-base)', fontWeight: active ? 600 : 400
            }}
          >
            {label}
            {count != null && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                  // Brand digits on a now-solid-brand chip would be invisible.
                  color: active ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)'
                }}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </span>
  )
}

// A two-option sort toggle, with the label the design puts beside it.
function SortControl({ label, options, value, onChange }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {label && (
        <span
          style={{
            fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase', color: 'var(--text-muted)'
          }}
        >
          {label}
        </span>
      )}
      <span style={{ display: 'inline-flex', gap: 5 }}>
        {options.map(([id, text]) => {
          const active = value === id
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                cursor: 'pointer',
                height: 27, padding: '0 10px',
                border: active
                  ? '1.5px solid var(--brand-primary)'
                  : '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--brand-primary)' : '#fff',
                color: active ? '#fff' : 'var(--text-body)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-base)', fontWeight: active ? 600 : 400
              }}
            >
              {text}
            </button>
          )
        })}
      </span>
    </span>
  )
}

// "New task" + "All tasks →". Both disabled: creating needs GHL write-back, and
// the "all" link needs cross-tab navigation the rail isn't wired for yet.
// onNew live => the create button works. Notes pass nothing and stay disabled.
// `newDisabledReason` lets a live feature still refuse for a reason worth
// stating — a deal with no contacts can't take a task, since tasks hang off the
// contact.
function RailFooter({ newLabel, allLabel, onNew, newDisabledReason }) {
  const live = typeof onNew === 'function' && !newDisabledReason
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: '10px 14px',
        borderTop: '1px solid var(--border-default)'
      }}
    >
      <button
        onClick={live ? onNew : undefined}
        disabled={!live}
        title={
          newDisabledReason
            || (live ? `${newLabel} on this deal` : 'Creating writes back to your CRM — coming next')
        }
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          cursor: live ? 'pointer' : 'not-allowed',
          height: 30, padding: '0 13px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-pill)',
          background: '#fff',
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          color: live ? 'var(--text-body)' : 'var(--text-faint)',
          opacity: live ? 1 : 0.7
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>add</span>
        {newLabel}
      </button>
      <button
        disabled
        title="Coming next"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          cursor: 'not-allowed',
          border: 'none', background: 'none', padding: 0,
          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
          color: 'var(--text-faint)', opacity: 0.75
        }}
      >
        {allLabel}
        <span className="ms" style={{ fontSize: 16 }}>arrow_forward</span>
      </button>
    </div>
  )
}

// Live when given an onClick, disabled without one — notes have no write path
// yet, so theirs stays inert and looks it.
function EditButton({ title, onClick }) {
  const live = typeof onClick === 'function'
  return (
    <button
      onClick={onClick}
      disabled={!live}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flex: 'none',
        width: 28, height: 28, padding: 0,
        border: `1px solid ${live ? 'var(--border-strong)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-sm)',
        background: '#fff',
        cursor: live ? 'pointer' : 'not-allowed',
        color: live ? 'var(--text-muted)' : 'var(--text-faint)',
        opacity: live ? 1 : 0.7
      }}
    >
      <span className="ms" style={{ fontSize: 15 }}>edit</span>
    </button>
  )
}

function OverduePill() {
  return (
    <span
      style={{
        padding: '2px 7px', borderRadius: 'var(--radius-sm)',
        background: 'var(--status-stuck)', color: '#fff',
        fontSize: 'var(--text-xs)', fontWeight: 600
      }}
    >
      Overdue
    </span>
  )
}

function Muted({ children }) {
  return (
    <p style={{ margin: 0, padding: 'var(--space-4) 14px', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
      {children}
    </p>
  )
}

// Sort comparator that always puts missing dates at the end, in both
// directions. A plain `a - b` on a null date yields NaN, which leaves the pair
// in whatever order it arrived — so a task with no due date can land above an
// overdue one, which is the opposite of useful.
function nullsLast(a, b, dir) {
  const ta = a ? new Date(a).getTime() : null
  const tb = b ? new Date(b).getTime() : null
  const va = ta != null && !Number.isNaN(ta) ? ta : null
  const vb = tb != null && !Number.isNaN(tb) ? tb : null
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  return dir === 'asc' ? va - vb : vb - va
}

// "3d ago" / "14d ago" — the compact form the design uses on the meta line,
// where relativeTime's "14 days ago" is too long beside a due date and an owner.
function compactAge(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 60) return 'just now'
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}

// Notes have no title column, so the first block becomes the heading and the
// rest is the body. Bodies are markup, so "first block" means the first
// paragraph/line element — splitting on "\n" finds nothing in
// "<p>a</p><p>b</p>" and would make the whole markup string the heading.
function splitNote(body) {
  const raw = (body || '').trim()
  if (!raw) return { heading: '(empty note)', rest: null }

  // Plain text (no markup): first line is the heading, as before.
  if (!/<[a-z][^>]*>/i.test(raw)) {
    const lines = raw.split('\n')
    const heading = lines[0].trim()
    const rest = lines.slice(1).join('\n').trim()
    if (!rest && heading.length > 120) return { heading: 'Note', rest: heading }
    return { heading, rest: rest || null }
  }

  // Markup: take the first block element's text as the heading and hand the
  // remaining markup back intact, so its formatting survives.
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  const blocks = [...doc.body.children]
  if (blocks.length > 1) {
    const heading = (blocks[0].textContent || '').trim()
    const rest = blocks.slice(1).map((el) => el.outerHTML).join('')
    if (heading) return { heading, rest: rest || null }
  }

  // One block, or nothing usable: the whole thing is the body. No invented
  // heading — a truncated first sentence in bold reads worse than none.
  const text = (doc.body.textContent || '').trim()
  if (text.length <= 120) return { heading: text, rest: null }
  return { heading: 'Note', rest: raw }
}
