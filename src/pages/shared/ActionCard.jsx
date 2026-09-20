import React, { useState } from 'react'
import { aiAPI } from '../../api/ai'

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
              background: 'var(--brand-primary)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1
            }}
          >
            {busy ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ACTION_LABEL = {
  create_contact: 'Create contact',
  attach_contact: 'Attach contact to this deal',
  change_owner: 'Change deal owner',
  change_status: 'Change deal status',
  send_message: 'Send message'
}

// Editable-field layout, one per action type. Kept as plain inputs matching
// the composer/editor style elsewhere in this codebase rather than a form
// library — every field here is a single string, and the whole card is
// meant to be readable at a glance, not a settings page.
function ActionFields({ actionType, fields, setField }) {
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

  return null
}
