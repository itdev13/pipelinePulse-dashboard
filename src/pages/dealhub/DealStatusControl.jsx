import React, { useState } from 'react'
import { Select, Input } from 'antd'
import {
  CLOSING_STATUSES, REASON_LABEL, REASON_PLACEHOLDER
} from '../../utils/outcomeReason'

// The deal's status, as a control rather than a badge.
//
// Deal Hub showed status as a read-only pill, and only once the deal was
// already closed — so an open deal displayed nothing at all and the only way
// to close one was the full editor on the Deals tab. This is the control a
// sales manager actually reaches for.
//
// WHY A DIALOG AND NOT A BARE DROPDOWN. Closing a deal REQUIRES a reason, and
// the reason lands in a different GHL field per outcome (the server maps
// won -> meddic_10, lost -> meddic_9, abandoned -> meddic_11). A dropdown that
// committed on change would have to either save without the reason — the
// thing we are trying to prevent — or pop the question afterwards, which
// leaves a closed deal on screen while the manager is still being asked why.
// So the choice is staged: pick, explain, then commit as one action.
//
// Reopening (-> Open) has no reason and commits immediately; there is no
// outcome to explain.

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'abandoned', label: 'Abandoned' }
]

// Each outcome's colour, matching StatusPill so the control and the badge
// never disagree about what "won" looks like.
const TONE = {
  open: { fg: 'var(--text-body)', bg: 'transparent' },
  won: { fg: 'var(--status-done-text)', bg: 'var(--status-done)' },
  lost: { fg: 'var(--status-stuck-text)', bg: 'var(--status-stuck)' },
  abandoned: { fg: 'var(--text-muted)', bg: 'var(--surface-sunken)' }
}

export default function DealStatusControl({
  status = 'open',
  // The reason already on record, so reopening a closed deal shows what was
  // said last time rather than an empty box.
  outcomeReason = null,
  onSave,
  saving = false,
  error = null,
  lostReasons = null,
  onNeedLostReasons
}) {
  // The outcome being explained. null = no dialog open.
  const [pending, setPending] = useState(null)
  const [reason, setReason] = useState('')
  const [lostReasonId, setLostReasonId] = useState(null)
  const [touched, setTouched] = useState(false)

  const current = String(status || 'open').toLowerCase()

  // Clear the pending choice once the save has landed — i.e. when the status
  // prop finally reports what was picked. Also clears it if the deal's status
  // changes underneath us (another tab, a webhook), since the dialog would
  // then be asking about a state that no longer applies.
  React.useEffect(() => {
    if (pending && current === pending) setPending(null)
  }, [current, pending])
  const tone = TONE[current] || TONE.open

  function pick(next) {
    if (next === current) return
    if (!CLOSING_STATUSES.includes(next)) {
      // Reopening. Nothing to explain.
      onSave && onSave({ status: next })
      return
    }
    setPending(next)
    setReason('')
    setLostReasonId(null)
    setTouched(false)
    // GHL's own lost-reason picklist is a separate fetch; ask for it only
    // when it is about to be shown.
    if (next === 'lost' && lostReasons === null && onNeedLostReasons) onNeedLostReasons()
  }

  function commit() {
    setTouched(true)
    if (!reason.trim()) return
    onSave && onSave({
      status: pending,
      reason: reason.trim(),
      lostReasonId: lostReasonId || undefined
    })
    // `pending` is NOT cleared here.
    //
    // The save is still in flight, and clearing it would drop the dropdown
    // back to the old status until the new one arrives — a visible flash of
    // "Open" on a deal the rep just marked lost. The effect below clears it
    // once the saved status actually matches, so the control moves exactly
    // once. A failed save leaves the choice on screen with the error, which
    // is what lets the rep retry without picking again.
  }

  const missing = touched && !reason.trim()

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <Select
        // The PENDING choice while the reason is being asked for, otherwise
        // the saved one.
        //
        // Bound to `current` alone, the dropdown snapped back to the saved
        // status the moment it was changed: the rep picked "Lost", the dialog
        // below correctly asked why the deal was lost, and the control above
        // it still read "Open". Two halves of the same question disagreeing.
        value={pending || current}
        onChange={pick}
        options={STATUS_OPTIONS}
        size="large"
        disabled={saving}
        loading={saving}
        popupClassName="pp-menu"
        style={{ width: '100%' }}
        // The closed states carry their colour into the closed control, so the
        // card reads as won/lost at a glance without a separate badge.
        styles={{ root: { fontWeight: current === 'open' ? 400 : 600, color: tone.fg } }}
      />

      {/* The reason already on record. Shown when the deal is closed and the
          dialog is not open — otherwise the manager sees two reason boxes. */}
      {!pending && outcomeReason && CLOSING_STATUSES.includes(current) && (
        <p style={{
          margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
          lineHeight: 1.45
        }}>
          {outcomeReason}
        </p>
      )}

      {pending && (
        <div
          style={{
            display: 'grid', gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-sunken)'
          }}
        >
          <label style={{
            fontSize: 'var(--text-sm)', fontWeight: 600,
            color: 'var(--text-heading)'
          }}>
            {REASON_LABEL[pending]}
          </label>

          {/* GHL's native lost-reason picklist, when marking lost. Kept
              alongside the free text rather than instead of it: the picklist
              is what GHL's own reporting reads, the sentence is what a person
              reads. The server records both. */}
          {pending === 'lost' && (
            <Select
              value={lostReasonId || undefined}
              onChange={setLostReasonId}
              showSearch
              optionFilterProp="label"
              loading={lostReasons === null}
              placeholder={lostReasons === null ? 'Loading…' : 'Pick a reason (optional)'}
              options={(lostReasons || []).map((r) => ({
                value: r.id || r.value,
                label: r.name || r.label
              }))}
              notFoundContent="No lost reasons configured in your CRM"
              popupClassName="pp-menu"
              allowClear
              style={{ width: '100%' }}
            />
          )}

          <Input.TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={REASON_PLACEHOLDER[pending]}
            rows={2}
            maxLength={2000}
            autoFocus
            status={missing ? 'error' : undefined}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commit()
              if (e.key === 'Escape') setPending(null)
            }}
          />

          {missing && (
            <p style={{
              margin: 0, fontSize: 'var(--text-sm)',
              color: 'var(--status-stuck-text)'
            }}>
              A reason is needed before this deal can be closed.
            </p>
          )}

          {error && (
            <p style={{
              margin: 0, fontSize: 'var(--text-sm)',
              color: 'var(--status-stuck-text)'
            }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={saving}
              className="pp-btn"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={saving}
              className="pp-btn-primary"
            >
              {saving ? 'Saving…' : `Mark ${pending}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
