import React, { useState } from 'react'

// Qualification — the deal's own custom field values, against the headings
// configured in GoHighLevel.
//
// Not AI output, and deliberately not AI INPUT either. These are the
// opportunity's meddic_1..10 columns — what a REP typed. A filled heading is
// something a person wrote and a missing one is a real gap in the record.
//
// THE AI DOES NOT READ THESE. get_deal_detail used to return the values, so
// the model saw a rep's own summary beside the conversation and could not
// tell the two apart — it would state "the budget is £40k" from a field
// someone typed months ago and cite it as fact, quoting the record back at
// the person who wrote it. The headings themselves are still in the system
// prompt, so the model knows what to file evidence under; it simply never
// sees the answers. A rep who wants the AI to consider something pastes it
// into a message or a note.
//
// Editable here because the alternative was leaving the CRM to fill one in.
//
// The missing count is the point of the panel. A heading with no value is a
// question nobody has answered on this deal, which is exactly what a manager
// reviewing it wants to see first.

export default function QualificationSection({ qualification = [], onSave, savingField }) {
  // Collapsed by default. Ten rows of "Not filled yet" is the longest panel in
  // the rail and the least actionable — the counts in the header already say
  // everything a reviewer needs, so the detail is opt-in.
  const [open, setOpen] = useState(false)
  // Which heading is being edited, and the text in the box. One at a time:
  // these are long free-text answers, and a panel of ten open textareas is a
  // form nobody finishes.
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')

  if (qualification.length === 0) return null

  // No handler, or a field with no GHL id, means read-only. The id is what
  // the opportunity patch writes against (opportunityPatch.js prefers it
  // over the key), so without one there is nothing to save to — and a box
  // that looks editable but cannot save is worse than plain text.
  const canEdit = typeof onSave === 'function'

  const commit = async (q) => {
    const next = draft.trim()
    // Unchanged: close without a round trip. An empty box on an already
    // empty heading is the common accidental case.
    if (next === (q.value || '')) { setEditing(null); setDraft(''); return }
    // The same shape the deal card's own custom-field pickers use, so this
    // goes through one write path rather than inventing a second.
    await onSave('customField', { id: q.fieldId, value: next, dealKey: null })
    setEditing(null)
    setDraft('')
  }

  const busy = savingField != null

  const missing = qualification.filter((q) => !q.filled)
  const filled = qualification.length - missing.length

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-gold-text)',
        ['--panel-tint']: 'var(--tint-gold)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? 'Hide the headings' : 'Show all ten headings'}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          width: '100%', cursor: 'pointer', textAlign: 'left',
          padding: 'var(--space-3) var(--space-4)',
          border: 'none',
          // The divider belongs to the open state — closed, the header IS the
          // whole panel and a bottom rule would read as an empty body.
          borderBottom: open ? '1px solid var(--border-default)' : 'none',
          background: '#fff',
          fontFamily: 'var(--font-sans)'
        }}
      >
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-gold)' }}>
          checklist
        </span>
        <h3
          style={{
            fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--accent-gold)',
            margin: 0, flex: 1
          }}
        >
          Qualification
        </h3>
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
          {filled} of {qualification.length}
        </span>
        {missing.length > 0 && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center',
              height: 22, padding: '0 9px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--tint-rose)', color: 'var(--status-stuck)',
              fontSize: 'var(--text-sm)', fontWeight: 600
            }}
          >
            {missing.length} missing
          </span>
        )}
        <span
          className="ms"
          style={{ fontSize: 'var(--text-xl)', color: 'var(--text-faint)', flex: 'none' }}
        >
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div>
          {qualification.map((q, i) => (
            <div
              key={q.fieldKey}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(150px, 210px) 1fr',
                gap: 'var(--space-4)', alignItems: 'baseline',
                padding: '11px var(--space-4)',
                borderBottom: i === qualification.length - 1
                  ? 'none'
                  : '1px solid var(--border-default)',
                // Faint rose wash on the rows that need attention, so the gaps
                // read at a glance without hunting for empty cells.
                background: q.filled ? 'transparent' : 'var(--tint-rose)'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-heading)'
                  }}
                >
                  {q.name}
                </span>
                {/* The heading's own question, from GHL's placeholder — so a rep
                    filling a gap knows what's being asked. */}
                {q.description && (
                  <span
                    style={{
                      display: 'block', marginTop: 2,
                      fontSize: 'var(--text-sm)', lineHeight: 1.4, color: 'var(--text-faint)'
                    }}
                  >
                    {q.description}
                  </span>
                )}
              </div>

              {editing === q.fieldKey ? (
                <div style={{ display: 'grid', gap: 7, maxWidth: 620 }}>
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Escape abandons. Enter inserts a newline, as it must
                      // in a free-text answer — Cmd/Ctrl+Enter commits, which
                      // is the convention everywhere else in the app.
                      if (e.key === 'Escape') { setEditing(null); setDraft('') }
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(q)
                    }}
                    rows={3}
                    style={{
                      width: '100%', padding: '8px 10px',
                      border: '1px solid var(--accent-gold-text)',
                      borderRadius: 'var(--radius-sm)',
                      fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
                      lineHeight: 1.5, color: 'var(--text-body)',
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => commit(q)}
                      disabled={busy}
                      style={{
                        height: 28, padding: '0 12px',
                        border: 'none', borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent-gold-text)', color: '#fff',
                        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                        fontWeight: 600, cursor: busy ? 'progress' : 'pointer'
                      }}
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(null); setDraft('') }}
                      disabled={busy}
                      style={{
                        height: 28, padding: '0 12px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-sm)',
                        background: '#fff', color: 'var(--text-heading)',
                        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                      Only the rep sees this — the AI reads the conversation, not these fields.
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { if (canEdit) { setEditing(q.fieldKey); setDraft(q.value || '') } }}
                  disabled={!canEdit}
                  title={canEdit ? `Edit ${q.name}` : undefined}
                  style={{
                    display: 'block', width: '100%', maxWidth: 620,
                    padding: 0, border: 'none', background: 'none',
                    textAlign: 'left',
                    // A text caret over prose you are about to edit, a
                    // pointer over the Add chip — the chip is a control, and
                    // a caret over it contradicts the border saying so.
                    cursor: !canEdit ? 'default' : (q.filled ? 'text' : 'pointer'),
                    fontFamily: 'var(--font-sans)'
                  }}
                >
                  {q.filled ? (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--text-md)', lineHeight: 1.5,
                        color: 'var(--text-body)', whiteSpace: 'pre-line'
                      }}
                    >
                      {q.value}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        // A DASHED CHIP, not bare text. It said "click to
                        // add" while looking like a sentence, so nothing
                        // about it invited a click — the one hint was the
                        // wording itself.
                        //
                        // Same treatment the deal card's unset field chips
                        // already use (DealSection's FieldPicker): dashed
                        // border, tinted fill, pill height. Rose rather than
                        // gold because this row is already a rose wash, and a
                        // gold chip on it reads as a second, unrelated state.
                        //
                        // Only when it is actually clickable — read-only, it
                        // stays plain text, since a button that does nothing
                        // is worse than a label.
                        ...(canEdit ? {
                          height: 30, padding: '0 11px',
                          border: '1px dashed var(--status-stuck)',
                          borderRadius: 'var(--radius-md)',
                          background: '#fff'
                        } : null),
                        fontSize: 'var(--text-base)', color: 'var(--status-stuck)'
                      }}
                    >
                      <span className="ms" style={{ fontSize: 15 }}>add</span>
                      {/* "Add answer", not bare "Add": the row is a question
                          and the panel's whole point is which ones are
                          unanswered. "Add" alone names the action but drops
                          the state, and a manager scanning the rail is
                          reading for the gaps. */}
                      {canEdit ? 'Add answer' : 'Not filled yet'}
                    </span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* The footnote explains the rows, so it belongs with them — showing it
          under a collapsed header would describe a list nobody can see. */}
      {open && (
        <p
          style={{
            margin: 0, padding: '10px var(--space-4)',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--gray-25)',
            fontSize: 'var(--text-base)', color: 'var(--text-muted)'
          }}
        >
          {missing.length === 0
            ? 'Every heading filled on this deal.'
            : `${missing.length} of ${qualification.length} headings are not filled on this deal${canEdit ? ' — click one to fill it in.' : ' — edit the opportunity in your CRM to fill them in.'}`}
        </p>
      )}
    </section>
  )
}
