import React, { useState } from 'react'
import PanelHead from './PanelHead'

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
        overflow: 'hidden',
        // Its own spacing now that it is a full-width section rather than an
        // item in the rail's gap-14 column — without this it sat flush
        // against Co-Pilot's band below it.
        marginTop: 14
      }}
    >
      <PanelHead
        as="button"
        icon="checklist"
        title="Qualification"
        accent="gold"
        subtitle={`${filled} of ${qualification.length}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        tooltip={open ? 'Hide the headings' : 'Show all ten headings'}
        // Closed, the header IS the whole panel — a bottom rule would read as
        // an empty body below it.
        style={{ borderBottom: open ? undefined : 'none' }}
        action={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            {missing.length > 0 && (
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  height: 22, padding: '0 9px',
                  borderRadius: 'var(--radius-pill)',
                  // Inverted on the solid band: rose-on-gold is unreadable,
                  // and a white chip is how the count badge reads elsewhere.
                  background: '#fff', color: 'var(--status-stuck)',
                  fontSize: 'var(--text-sm)', fontWeight: 600
                }}
              >
                {missing.length} missing
              </span>
            )}
            <span className="ms" style={{ fontSize: 'var(--text-xl)', color: '#fff' }}>
              {open ? 'expand_less' : 'expand_more'}
            </span>
          </span>
        }
      />

      {open && (
        // TWO COLUMNS, the client's design. Ten headings in one column is a
        // very tall panel for a section that is mostly skimmed; paired up it
        // fits a screen. The 1px gaps are the background showing through —
        // cells drawing their own borders would double up where they meet.
        <div
          style={{
            display: 'grid',
            // One column when the panel is narrow: side by side, a question
            // and its answer box share ~300px and both become unreadable.
            gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
            gap: 1,
            background: 'var(--border-default)'
          }}
        >
          {qualification.map((q) => {
            const saving = savingField === q.fieldKey
            return (
            <div
              key={q.fieldKey}
              style={{
                display: 'grid',
                // The heading column is fixed so every answer box on a row
                // starts at the same x — ragged left edges across ten rows
                // read as a broken grid.
                gridTemplateColumns: 'minmax(140px, 260px) 1fr',
                gap: 'var(--space-3)',
                alignItems: 'start',
                padding: '12px var(--space-4)',
                background: '#fff'
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
                      fontSize: 'var(--text-sm)', lineHeight: 1.4, color: 'var(--text-muted)'
                    }}
                  >
                    {q.description}
                  </span>
                )}
              </div>

              {editing === q.fieldKey ? (
                <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
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
                  <span style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => commit(q)}
                      // Per-FIELD, not a global "something is saving" flag:
                      // only this row's own write should grey its own button.
                      disabled={saving}
                      style={{
                        height: 28, padding: '0 12px',
                        border: 'none', borderRadius: 'var(--radius-pill)',
                        background: 'var(--green-500)', color: '#fff',
                        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                        fontWeight: 600, cursor: saving ? 'progress' : 'pointer'
                      }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(null); setDraft('') }}
                      // Cancel is disabled mid-write too: abandoning the box
                      // while the PATCH is in flight leaves the rep looking at
                      // the old value with a save still landing behind it.
                      disabled={saving}
                      style={{
                        height: 28, padding: '0 12px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-pill)',
                        background: '#fff', color: 'var(--text-body)',
                        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </span>
                </div>
              ) : (
                // A BOX THAT LOOKS LIKE THE INPUT IT BECOMES, which is the
                // design's "Add answer…" field. The dashed rose chip this
                // replaced named the state well but did not look like
                // somewhere you type, so the panel read as a report rather
                // than a form.
                //
                // Read-only (no saver wired) renders the same box without the
                // affordances — a button that does nothing is worse than a
                // label.
                <button
                  type="button"
                  onClick={() => { if (canEdit) { setEditing(q.fieldKey); setDraft(q.value || '') } }}
                  disabled={!canEdit}
                  title={canEdit ? `Edit ${q.name}` : undefined}
                  style={{
                    display: 'block', width: '100%', minWidth: 0,
                    minHeight: 64, padding: '9px 11px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    background: '#fff',
                    textAlign: 'left',
                    cursor: canEdit ? 'text' : 'default',
                    fontFamily: 'var(--font-sans)'
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--text-md)', lineHeight: 1.5,
                      whiteSpace: 'pre-line',
                      // The placeholder is faint, a real answer is not —
                      // same contract as every input in the app.
                      color: q.filled ? 'var(--text-body)' : 'var(--text-faint)'
                    }}
                  >
                    {q.filled ? q.value : (canEdit ? 'Add answer…' : 'Not filled yet')}
                  </span>
                </button>
              )}
            </div>
            )
          })}
          {/* An odd number of headings leaves half a row, where the grid's gap
              colour would otherwise show as a grey block. */}
          {qualification.length % 2 === 1 && <div style={{ background: '#fff' }} />}
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
