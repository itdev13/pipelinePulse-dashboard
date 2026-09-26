import React, { useState } from 'react'
import { DatePicker } from 'antd'
import dayjs from 'dayjs'
import { aiAPI } from '../../api/ai'
import SenderPicker from '../../components/SenderPicker'

// A proposed CRM write, rendered inline under an AI answer — "Create
// contact: Jane Doe · jane@x.com", "Attach Priya Nair to this deal", etc.
// Shared by the portfolio Co-Pilot tab and Deal Hub's per-deal Co-Pilot:
// same card either way, since a propose tool (server/services/ai/tools/
// registry.js) only ever inserts a row into ai_actions regardless of which
// surface asked the question.
//
// Nothing here calls GHL. Confirm/Reject both go through
// server/routes/ai.js's /api/ai/actions/:id/confirm|reject, which is the
// ONLY place a proposed write actually reaches GHL — same non-negotiable
// rule every other write in this app already follows: a UI, a
// confirmation, an audit trail.
//
// Fields are editable before confirming (like NoteEditor/TaskEditor's
// create-mode draft pattern) — a rep fixing a typo'd phone number shouldn't
// have to redo the whole exchange with the model.
export default function ActionCard({ actionId, actionType, proposed, onResolved }) {
  const [fields, setFields] = useState(() => ({ ...proposed }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [resolved, setResolved] = useState(null) // 'confirmed' | 'rejected' | null

  const setField = (key, value) => setFields((f) => ({ ...f, [key]: value }))

  // Only the fields that actually changed from what the model proposed —
  // the server merges these over proposed_payload, so an untouched field
  // isn't resent (and can't accidentally be blanked by a stale local copy).
  const editsOnly = () => {
    const edits = {}
    for (const [key, value] of Object.entries(fields)) {
      if (proposed[key] !== value) edits[key] = value
    }
    return Object.keys(edits).length ? edits : null
  }

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await aiAPI.confirmAction(actionId, editsOnly())
      setResolved('confirmed')
      onResolved?.('confirmed')
    } catch (err) {
      setError(err?.message || 'Could not complete this action')
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await aiAPI.rejectAction(actionId)
      setResolved('rejected')
      onResolved?.('rejected')
    } catch (err) {
      setError(err?.message || 'Could not dismiss this proposal')
    } finally {
      setBusy(false)
    }
  }

  if (resolved) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 13px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--gray-25)',
        fontSize: 'var(--text-base)', color: 'var(--text-muted)'
      }}>
        <span className="ms" style={{
          fontSize: 17,
          color: resolved === 'confirmed' ? 'var(--status-done)' : 'var(--text-faint)'
        }}>
          {resolved === 'confirmed' ? 'check_circle' : 'cancel'}
        </span>
        {resolved === 'confirmed'
          ? `${ACTION_LABEL[actionType] || 'Action'} confirmed`
          : 'Dismissed — nothing was changed'}
      </div>
    )
  }

  return (
    <div style={{
      border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-md)',
      background: '#fff',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 13px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--tint-plum)'
      }}>
        <span className="ms" style={{ fontSize: 17, color: 'var(--accent-plum-text)' }}>
          bolt
        </span>
        <span style={{
          fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-heading)'
        }}>
          {ACTION_LABEL[actionType] || 'Proposed action'}
        </span>
      </div>

      <div style={{ padding: 13, display: 'grid', gap: 10 }}>
        <ActionFields actionType={actionType} fields={fields} setField={setField} />

        {error && (
          <p style={{
            margin: 0, padding: '8px 10px',
            border: '1px solid var(--status-stuck)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--tint-rose)',
            fontSize: 'var(--text-sm)', color: 'var(--status-stuck-text)'
          }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={reject}
            disabled={busy}
            style={{
              height: 32, padding: '0 13px',
              border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
              background: '#fff', color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: busy ? 'default' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            style={{
              height: 32, padding: '0 13px',
              border: 'none', borderRadius: 'var(--radius-md)',
              background: DESTRUCTIVE.has(actionType) ? 'var(--status-stuck)' : 'var(--brand-primary)',
              color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1
            }}
          >
            {busy
              ? (DESTRUCTIVE.has(actionType) ? 'Deleting…' : 'Confirming…')
              : (DESTRUCTIVE.has(actionType) ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

const ACTION_LABEL = {
  create_contact: 'Create contact',
  attach_contact: 'Attach contact to this deal',
  remove_contact: 'Remove contact from this deal',
  create_deal: 'Create deal',
  update_deal: 'Edit deal',
  change_owner: 'Change deal owner',
  change_status: 'Change deal status',
  send_message: 'Send message',
  create_task: 'Create task',
  complete_task: 'Update task',
  update_task: 'Edit task',
  delete_task: 'Delete task',
  create_note: 'Add note',
  update_note: 'Edit note',
  delete_note: 'Delete note',
  add_tags: 'Add tags',
  remove_tags: 'Remove tags',
  update_contact: 'Update contact',
  delete_deal: 'Delete deal',
  create_business: 'Create business',
  update_business: 'Update business',
  delete_business: 'Delete business',
  add_followers: 'Add followers',
  remove_followers: 'Remove followers'
}

// action types whose confirm button should read differently — a delete is
// not "Confirm", it's "Delete", and looks it: same red the rest of this
// codebase uses for a destructive action (ConfirmDialog, RowAction).
const DESTRUCTIVE = new Set(['delete_task', 'delete_note', 'delete_deal', 'delete_business'])

// Editable-field layout, one per action type. Kept as plain inputs matching
// the composer/editor style elsewhere in this codebase rather than a form
// library — every field here is a single string, and the whole card is
// meant to be readable at a glance, not a settings page.
// "not the main contact" — shown when a message or task is aimed at one of a
// deal's ADDITIONAL people rather than its primary.
//
// A deal has one primary contact and any number of others: the architect, the
// QS, a second decision-maker. Messaging them is routine, so this is not a
// warning — but "To pra" and "To bindu" read identically on the card, and only
// one is who a rep glancing at a deal would assume. The tag is the difference
// between confirming deliberately and confirming by habit.
function AdditionalContactTag({ on }) {
  if (!on) return null
  return (
    <span
      title="This is an additional contact on the deal, not its main one"
      style={{
        fontSize: 'var(--text-xs)', fontWeight: 600,
        color: 'var(--accent-plum-text)', background: 'var(--tint-plum)',
        padding: '1px 7px', borderRadius: 'var(--radius-pill)'
      }}
    >
      not the main contact
    </span>
  )
}

function ActionFields({ actionType, fields, setField }) {
  // The due date, as the rest of the app draws it.
  //
  // This was <input type="date">, which the BROWSER renders with the OS's own
  // calendar — unstyleable, a different typeface and chrome from everything
  // around it, and a dd/mm/yyyy placeholder no token can reach. The app already
  // standardised on antd's DatePicker with the .pp-cal treatment in four other
  // places (TaskEditor, DealSection, DealEditPanel, DealCreatePanel); this was
  // the one control still falling back to the OS.
  //
  // The payload keeps its ISO string — antd works in dayjs objects, so the
  // conversion happens here rather than changing what the server receives.
  // dayjs(null) is an INVALID date, not an empty one, so an unset due date has
  // to become null explicitly or the field renders as "Invalid Date".
  const dueDateField = (label) => (
    <label>
      <span style={labelStyle}>{label}</span>
      <DatePicker
        popupClassName="pp-cal"
        value={fields.dueDate ? dayjs(fields.dueDate) : null}
        // Plain toISOString, matching TaskEditor/DealEditPanel — the whole app
        // sends the picked instant and lets the server own the day. Normalising
        // to startOf('day') here would have made this one control disagree with
        // the other four, which is a worse bug than the one it fixes.
        onChange={(d) => setField('dueDate', d ? d.toISOString() : null)}
        format="D MMM YYYY"
        placeholder="Pick a date"
        style={{ width: '100%' }}
      />
    </label>
  )

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px',
    border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--text-heading)'
  }
  const labelStyle = {
    display: 'block', marginBottom: 4,
    fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
    textTransform: 'uppercase', color: 'var(--text-muted)'
  }

  if (actionType === 'create_contact') {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <span style={labelStyle}>First name</span>
            <input
              style={inputStyle}
              value={fields.firstName || ''}
              onChange={(e) => setField('firstName', e.target.value)}
            />
          </label>
          <label>
            <span style={labelStyle}>Last name</span>
            <input
              style={inputStyle}
              value={fields.lastName || ''}
              onChange={(e) => setField('lastName', e.target.value)}
            />
          </label>
        </div>
        <label>
          <span style={labelStyle}>Phone</span>
          <input
            style={inputStyle}
            value={fields.phone || ''}
            onChange={(e) => setField('phone', e.target.value)}
          />
        </label>
        <label>
          <span style={labelStyle}>Email</span>
          <input
            style={inputStyle}
            type="email"
            value={fields.email || ''}
            onChange={(e) => setField('email', e.target.value)}
          />
        </label>
      </>
    )
  }

  if (actionType === 'attach_contact') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        Attach <strong>{fields.contactName || 'this contact'}</strong> to this deal.
      </p>
    )
  }

  if (actionType === 'remove_contact') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        Remove <strong>{fields.contactName || 'this contact'}</strong> from this deal.
      </p>
    )
  }

  if (actionType === 'create_deal') {
    return (
      <>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          For <strong>{fields.contactName || 'this contact'}</strong> · {fields.pipelineName}
          {fields.stageName ? ` · ${fields.stageName}` : ''}
        </p>
        <label>
          <span style={labelStyle}>Deal name</span>
          <input style={inputStyle} value={fields.name || ''}
            onChange={(e) => setField('name', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>Value</span>
          <input style={inputStyle} type="number" value={fields.value ?? ''}
            onChange={(e) => setField('value', e.target.value === '' ? null : Number(e.target.value))} />
        </label>
      </>
    )
  }

  if (actionType === 'update_deal') {
    return (
      <>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Editing <strong>{fields.dealName || 'this deal'}</strong>
        </p>
        <label>
          <span style={labelStyle}>New name</span>
          <input style={inputStyle} placeholder="Leave blank to keep the current name"
            value={fields.name || ''} onChange={(e) => setField('name', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>New value</span>
          <input style={inputStyle} type="number" placeholder="Leave blank to keep the current value"
            value={fields.value ?? ''}
            onChange={(e) => setField('value', e.target.value === '' ? null : Number(e.target.value))} />
        </label>
        {fields.stageName && (
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            New stage: <strong>{fields.stageName}</strong>
          </p>
        )}
      </>
    )
  }

  if (actionType === 'change_owner') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        Reassign this deal to <strong>{fields.ownerName || 'this team member'}</strong>.
      </p>
    )
  }

  if (actionType === 'change_status') {
    return (
      <>
        <label>
          <span style={labelStyle}>New status</span>
          <select
            style={inputStyle}
            value={fields.status || 'open'}
            onChange={(e) => setField('status', e.target.value)}
          >
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </label>
        {fields.status === 'lost' && (
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            A lost reason was already collected before this was proposed —
            confirming keeps it attached.
          </p>
        )}
      </>
    )
  }

  if (actionType === 'send_message') {
    const isEmail = fields.type === 'Email'
    return (
      <>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          To <strong>{fields.contactName || 'this contact'}</strong> · {fields.type}
        </p>
        {/* Renders nothing when the channel has a single sender, which is the
            common case — see SenderPicker's own note on why it decides that
            itself rather than taking a prop. */}
        <SenderPicker
          channel={fields.type}
          value={fields.conversationProviderId ?? null}
          onChange={(id) => setField('conversationProviderId', id)}
        />
        {isEmail && (
          <label>
            <span style={labelStyle}>Subject</span>
            <input
              style={inputStyle}
              value={fields.subject || ''}
              onChange={(e) => setField('subject', e.target.value)}
            />
          </label>
        )}
        <label>
          <span style={labelStyle}>{isEmail ? 'Content' : 'Message'}</span>
          <textarea
            style={{
              ...inputStyle, height: 'auto', minHeight: 90, padding: '8px 10px',
              resize: 'vertical', fontFamily: 'var(--font-sans)'
            }}
            value={isEmail ? (fields.html || fields.message || '') : (fields.message || '')}
            onChange={(e) => setField(isEmail ? 'html' : 'message', e.target.value)}
          />
        </label>
      </>
    )
  }

  if (actionType === 'create_task') {
    return (
      <>
        <p style={{
          margin: 0, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
          fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
        }}>
          <span>For <strong>{fields.contactName || 'this contact'}</strong></span>
          <AdditionalContactTag on={fields.isAdditionalContact} />
        </p>
        <label>
          <span style={labelStyle}>Title</span>
          <input
            style={inputStyle}
            value={fields.title || ''}
            onChange={(e) => setField('title', e.target.value)}
          />
        </label>
        <label>
          <span style={labelStyle}>Details</span>
          <textarea
            style={{
              ...inputStyle, height: 'auto', minHeight: 70, padding: '8px 10px',
              resize: 'vertical', fontFamily: 'var(--font-sans)'
            }}
            value={fields.body || ''}
            onChange={(e) => setField('body', e.target.value)}
          />
        </label>
        {dueDateField('Due date')}
      </>
    )
  }

  if (actionType === 'complete_task') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        {fields.completed === false ? 'Reopen' : 'Mark done'}: <strong>{fields.taskTitle || 'this task'}</strong>
      </p>
    )
  }

  if (actionType === 'update_task') {
    return (
      <>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Editing <strong>{fields.taskTitle || 'this task'}</strong>
        </p>
        <label>
          <span style={labelStyle}>New title</span>
          <input
            style={inputStyle}
            placeholder="Leave blank to keep the current title"
            value={fields.title || ''}
            onChange={(e) => setField('title', e.target.value)}
          />
        </label>
        <label>
          <span style={labelStyle}>New details</span>
          <textarea
            style={{
              ...inputStyle, height: 'auto', minHeight: 70, padding: '8px 10px',
              resize: 'vertical', fontFamily: 'var(--font-sans)'
            }}
            value={fields.body || ''}
            onChange={(e) => setField('body', e.target.value)}
          />
        </label>
        {dueDateField('New due date')}
      </>
    )
  }

  if (actionType === 'delete_task') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        Permanently delete <strong>{fields.taskTitle || 'this task'}</strong>. This cannot be undone.
      </p>
    )
  }

  if (actionType === 'create_note') {
    return (
      <>
        <p style={{
          margin: 0, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
          fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
        }}>
          <span>For <strong>{fields.contactName || 'this contact'}</strong></span>
          <AdditionalContactTag on={fields.isAdditionalContact} />
        </p>
        <label>
          <span style={labelStyle}>Note</span>
          <textarea
            style={{
              ...inputStyle, height: 'auto', minHeight: 90, padding: '8px 10px',
              resize: 'vertical', fontFamily: 'var(--font-sans)'
            }}
            value={fields.body || ''}
            onChange={(e) => setField('body', e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={fields.pinned === true}
            onChange={(e) => setField('pinned', e.target.checked)}
          />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>Pin this note</span>
        </label>
      </>
    )
  }

  if (actionType === 'update_note') {
    return (
      <>
        <label>
          <span style={labelStyle}>New text</span>
          <textarea
            style={{
              ...inputStyle, height: 'auto', minHeight: 90, padding: '8px 10px',
              resize: 'vertical', fontFamily: 'var(--font-sans)'
            }}
            placeholder="Leave blank to keep the current text"
            value={fields.body || ''}
            onChange={(e) => setField('body', e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={fields.pinned === true}
            onChange={(e) => setField('pinned', e.target.checked)}
          />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>Pinned</span>
        </label>
      </>
    )
  }

  if (actionType === 'delete_note') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        Permanently delete this note. This cannot be undone.
      </p>
    )
  }

  if (actionType === 'add_tags' || actionType === 'remove_tags') {
    const verb = actionType === 'add_tags' ? 'Add' : 'Remove'
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        {verb} {(fields.tags || []).map((t) => `"${t}"`).join(', ') || 'these tags'} {actionType === 'add_tags' ? 'to' : 'from'}{' '}
        <strong>{fields.contactName || 'this contact'}</strong>
      </p>
    )
  }

  if (actionType === 'update_contact') {
    return (
      <>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          Editing <strong>{fields.contactName || 'this contact'}</strong>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <span style={labelStyle}>First name</span>
            <input style={inputStyle} value={fields.firstName || ''}
              onChange={(e) => setField('firstName', e.target.value)} />
          </label>
          <label>
            <span style={labelStyle}>Last name</span>
            <input style={inputStyle} value={fields.lastName || ''}
              onChange={(e) => setField('lastName', e.target.value)} />
          </label>
        </div>
        <label>
          <span style={labelStyle}>Email</span>
          <input style={inputStyle} type="email" value={fields.email || ''}
            onChange={(e) => setField('email', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>Phone</span>
          <input style={inputStyle} value={fields.phone || ''}
            onChange={(e) => setField('phone', e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>Address</span>
          <input style={inputStyle} value={fields.address || ''}
            onChange={(e) => setField('address', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <span style={labelStyle}>City</span>
            <input style={inputStyle} value={fields.city || ''}
              onChange={(e) => setField('city', e.target.value)} />
          </label>
          <label>
            <span style={labelStyle}>Company</span>
            <input style={inputStyle} value={fields.companyName || ''}
              onChange={(e) => setField('companyName', e.target.value)} />
          </label>
        </div>
      </>
    )
  }

  if (actionType === 'delete_deal') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        Permanently delete <strong>{fields.dealName || 'this deal'}</strong>. GHL has no restore for a deleted deal.
      </p>
    )
  }

  if (actionType === 'create_business' || actionType === 'update_business') {
    return (
      <>
        {actionType === 'update_business' && (
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Editing <strong>{fields.businessName || 'this business'}</strong>
          </p>
        )}
        <label>
          <span style={labelStyle}>Name</span>
          <input style={inputStyle} value={fields.name || ''}
            onChange={(e) => setField('name', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <span style={labelStyle}>Email</span>
            <input style={inputStyle} type="email" value={fields.email || ''}
              onChange={(e) => setField('email', e.target.value)} />
          </label>
          <label>
            <span style={labelStyle}>Phone</span>
            <input style={inputStyle} value={fields.phone || ''}
              onChange={(e) => setField('phone', e.target.value)} />
          </label>
        </div>
        <label>
          <span style={labelStyle}>Website</span>
          <input style={inputStyle} value={fields.website || ''}
            onChange={(e) => setField('website', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <span style={labelStyle}>Address</span>
            <input style={inputStyle} value={fields.address || ''}
              onChange={(e) => setField('address', e.target.value)} />
          </label>
          <label>
            <span style={labelStyle}>City</span>
            <input style={inputStyle} value={fields.city || ''}
              onChange={(e) => setField('city', e.target.value)} />
          </label>
        </div>
      </>
    )
  }

  if (actionType === 'delete_business') {
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        Permanently delete <strong>{fields.businessName || 'this business'}</strong>.
      </p>
    )
  }

  if (actionType === 'add_followers' || actionType === 'remove_followers') {
    const verb = actionType === 'add_followers' ? 'Add' : 'Remove'
    return (
      <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        {verb} <strong>{fields.followerNames || 'these team members'}</strong> {actionType === 'add_followers' ? 'as followers on' : 'from'} this deal.
      </p>
    )
  }

  return null
}
