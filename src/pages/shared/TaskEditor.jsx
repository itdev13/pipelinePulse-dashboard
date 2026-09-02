import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DatePicker, Input, Select } from 'antd'
import dayjs from 'dayjs'
import { tasksAPI } from '../../api/tasks'
import ContactPicker from './ContactPicker'

// Create or edit one task. Shared by the Tasks page and the Deal Hub's task
// rail so the two can't drift apart in what they accept.
//
// Writes go to the CRM, which owns the record — see the server's
// ghlTaskWrite.js. What that means here:
//
//   • Tasks live on the CONTACT, not the deal. Creating one therefore needs a
//     contact, and on a deal with several people that's a choice the rep has to
//     make rather than one we can guess. Hence the Contact field.
//   • A save takes a moment (their API waits internally before responding), so
//     the button shows progress rather than appearing to do nothing.
//   • A rejected field comes back named, so the error lands on the input that
//     caused it instead of in a banner that doesn't say which box is wrong.

const OVERLAY = {
  position: 'fixed', inset: 0, zIndex: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20,
  background: 'rgba(23, 33, 46, 0.45)'
}

export default function TaskEditor({
  // Editing an existing task: pass it. Creating: leave null.
  task = null,
  // Seed text for a CREATE — used by Co-Pilot's "Create task". It fills the
  // DESCRIPTION, not the title: an agent's answer is a paragraph, and a task
  // titled with a paragraph is unreadable in a queue. The rep writes the title.
  initialBody = '',
  // Contacts the task can be attached to. On the Tasks page this is the one
  // contact already on the task; on a deal it's everyone on that deal.
  contacts = [],
  // Pre-selected contact for a create — the deal's primary, usually.
  defaultContactId = null,
  // The deal and company this task is about — GHL associations, not task
  // fields. An empty list hides its picker rather than showing an empty
  // dropdown.
  deals = [],
  businesses = [],
  defaultOpportunityId = null,
  onClose,
  // Called with the CRM's echoed task after a successful save.
  onSaved
}) {
  const editing = !!task

  // UNLIKE NOTES, a task's GHL caps are 10 rather than 1, so these links are
  // genuinely additive — attaching a second deal adds it instead of replacing
  // the first. The UI still offers one, because "the deal this task belongs to"
  // is the question a rep is answering; the difference is that changing it
  // needs an explicit detach of the old one, handled in save().
  const [opportunityId, setOpportunityId] = useState(
    task?.opportunityId || defaultOpportunityId || null
  )
  const [businessId, setBusinessId] = useState(task?.businessId || null)

  const [title, setTitle] = useState(task?.title || '')
  const [body, setBody] = useState(() => stripHtml(task?.body || initialBody || ''))
  const [dueDate, setDueDate] = useState(
    task?.dueAt ? dayjs(task.dueAt) : null
  )
  const [contactId, setContactId] = useState(
    task?.contact?.id || defaultContactId || (contacts.length === 1 ? contacts[0].id : null)
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)

  const titleRef = useRef(null)
  useEffect(() => {
    // Focus the title on open — it's the one field every task needs.
    const t = window.setTimeout(() => titleRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [])

  // Esc closes. Bound on the document so it works wherever focus sits.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])


  // What's actually changed. Sending only this means an edit can't overwrite a
  // field someone else changed in the CRM meanwhile.
  const changes = useMemo(() => {
    if (!editing) return null
    const out = {}
    if (title.trim() !== (task.title || '')) out.title = title.trim()
    if (body.trim() !== stripHtml(task.body || '')) out.body = body.trim()
    const wasDue = task.dueAt ? dayjs(task.dueAt) : null
    const sameDue = (!wasDue && !dueDate)
      || (wasDue && dueDate && wasDue.isSame(dueDate, 'minute'))
    if (!sameDue) out.dueDate = dueDate ? dueDate.toISOString() : null
    return out
  }, [editing, task, title, body, dueDate])

  const dirty = editing ? Object.keys(changes).length > 0 : title.trim().length > 0
  const canSave = !saving && dirty
    && title.trim().length > 0
    && (editing || (!!contactId && !!dueDate))

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    setErrorField(null)
    try {
      let res
      if (editing) {
        res = await tasksAPI.update(task.id, changes)
        const oppChanged = (opportunityId || null) !== (task.opportunityId || null)
        const bizChanged = (businessId || null) !== (task.businessId || null)
        if (oppChanged || bizChanged) {
          // Detach the old link BEFORE attaching the new one. Task caps are 10,
          // so without this the task would end up linked to both deals — the
          // silent-replace behaviour that notes get does not apply here.
          const gone = {}
          if (oppChanged && task.opportunityId) gone.opportunityId = task.opportunityId
          if (bizChanged && task.businessId) gone.businessId = task.businessId
          if (Object.keys(gone).length) await tasksAPI.removeRelations(task.id, gone)

          const added = {}
          if (oppChanged && opportunityId) added.opportunityId = opportunityId
          if (bizChanged && businessId) added.businessId = businessId
          if (Object.keys(added).length) await tasksAPI.setRelations(task.id, added)
        }
      } else {
        res = await tasksAPI.create({
          contactId,
          title: title.trim(),
          body: body.trim() || undefined,
          dueDate: dueDate.toISOString(),
          opportunityId: opportunityId || undefined,
          businessId: businessId || undefined
        })
        // The task saved but its link did not — report without discarding it.
        if (res?.relationError) {
          setError(`Task saved, but couldn't link it: ${res.relationError}`)
          setSaving(false)
          return
        }
      }
      onSaved(res.task || null)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save that — try again')
      // The server names the rejected field so the message can sit under the
      // input responsible.
      setErrorField(err.data?.field || null)
      setSaving(false)
    }
  }

  // Cmd/Ctrl+Enter saves from anywhere in the form. Plain Enter is left alone —
  // the description is a textarea and newlines matter in it.
  const onFormKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    }
  }

  return (
    <div
      style={OVERLAY}
      // Click the backdrop to dismiss, but never mid-save.
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit task' : 'New task'}
        onKeyDown={onFormKeyDown}
        style={{
          width: 'min(560px, 100%)',
          borderRadius: 'var(--radius-md)',
          background: '#fff', boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '13px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--tint-rose)'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-rose)' }}>
            task_alt
          </span>
          <h2
            style={{
              flex: 1, margin: 0,
              fontSize: 'var(--text-xl)', fontWeight: 600,
              color: 'var(--accent-rose-text)'
            }}
          >
            {editing ? 'Edit task' : 'New task'}
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            title="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.7)',
              cursor: saving ? 'default' : 'pointer',
              color: 'var(--text-muted)'
            }}
          >
            <span className="ms" style={{ fontSize: 16 }}>close</span>
          </button>
        </header>

        <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
          <Field label="Title" required error={errorField === 'title' ? error : null}>
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              maxLength={1500}
              status={errorField === 'title' ? 'error' : undefined}
            />
          </Field>

          <Field label="Description" error={errorField === 'body' ? error : null}>
            <Input.TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Anything worth remembering about it"
              rows={3}
              maxLength={5000}
              status={errorField === 'body' ? 'error' : undefined}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Field
              label="Due"
              required={!editing}
              error={errorField === 'dueDate' ? error : null}
            >
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                format="D MMM YYYY"
                placeholder="Pick a date"
                style={{ width: '100%' }}
                status={errorField === 'dueDate' ? 'error' : undefined}
              />
            </Field>

            {/* Only on create. Moving a task to a different contact isn't a
                field the CRM's update endpoint accepts, so offering it here
                would be a control that silently does nothing. */}
            {!editing && (
              <Field label="Contact" required error={errorField === 'contactId' ? error : null}>
                {/* Searches every contact in the sub-account, not just the ones
                    the caller happened to pass. On this page there is no deal in
                    scope, so the old Select was handed an empty list and
                    rendered DISABLED — a task could not be created here at all.
                    `seed` keeps the deal case a single click. */}
                <ContactPicker
                  value={contactId}
                  onChange={setContactId}
                  seed={contacts}
                  invalid={errorField === 'contactId'}
                />
              </Field>
            )}

            {/* In both create and edit mode: which deal and company a task is
                filed against is exactly what a rep corrects later. Rendered
                only when there is something to pick. */}
            {deals.length > 0 && (
              <Field label="Deal" error={errorField === 'opportunityId' ? error : null}>
                <Select
                  value={opportunityId || undefined}
                  onChange={(v) => setOpportunityId(v || null)}
                  disabled={saving}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Not linked to a deal"
                  options={deals.map((d) => ({
                    value: d.id,
                    label: d.dealTag || d.opportunityName || d.name || d.id
                  }))}
                  notFoundContent="No matching deal"
                  popupClassName="pp-menu"
                  style={{ width: '100%' }}
                />
              </Field>
            )}

            {businesses.length > 0 && (
              <Field label="Company" error={errorField === 'businessId' ? error : null}>
                <Select
                  value={businessId || undefined}
                  onChange={(v) => setBusinessId(v || null)}
                  disabled={saving}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Not linked to a company"
                  options={businesses.map((b) => ({ value: b.id, label: b.name || b.id }))}
                  notFoundContent="No matching company"
                  popupClassName="pp-menu"
                  style={{ width: '100%' }}
                />
              </Field>
            )}
          </div>

          {/* A task belongs to a contact, and that's worth saying once rather
              than leaving the rep to wonder why a deal isn't enough. */}
          {!editing && (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Tasks are stored against the contact, so it appears on their record
              and on any deal they're linked to.
            </p>
          )}

          {/* An error with no field of its own — a permission problem, a
              connection failure — needs somewhere to land. */}
          {error && !errorField && (
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 7,
                padding: '9px 11px',
                border: '1px solid var(--status-stuck)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--tint-rose)',
                fontSize: 'var(--text-md)', color: 'var(--status-stuck-text)'
              }}
            >
              <span className="ms" style={{ fontSize: 16, flex: 'none', marginTop: 1 }}>error</span>
              {error}
            </div>
          )}
        </div>

        <footer
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '11px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--gray-25)'
          }}
        >
          <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {saving ? 'Saving to your CRM…' : editing && !dirty ? 'No changes yet' : '⌘↵ to save'}
          </span>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              height: 32, padding: '0 14px',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              background: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
              color: 'var(--text-body)',
              cursor: saving ? 'default' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 32, padding: '0 16px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: canSave ? 'var(--brand-primary)' : 'var(--gray-200)',
              color: canSave ? '#fff' : 'var(--text-faint)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)', fontWeight: 500,
              cursor: canSave ? 'pointer' : 'default'
            }}
          >
            {saving && (
              <span className="ms pp-spin" style={{ fontSize: 15 }}>progress_activity</span>
            )}
            {saving ? 'Saving' : editing ? 'Save changes' : 'Create task'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({ label, required, error, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span
        style={{
          display: 'block', marginBottom: 5,
          fontSize: 'var(--text-xs)', fontWeight: 600,
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)'
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--status-stuck)' }}> *</span>}
      </span>
      {children}
      {error && (
        <span
          style={{
            display: 'block', marginTop: 4,
            fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)'
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}

// Task bodies come back as markup (the CRM's editor is rich text), but this
// form edits plain text — sending HTML the rep didn't write would compound
// every time they saved.
function stripHtml(html) {
  const raw = String(html || '')
  if (!raw) return ''
  if (!/<[a-z][^>]*>/i.test(raw)) return raw
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'))
  doc.querySelectorAll('p, div, li').forEach((el) => el.append('\n'))
  return (doc.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
