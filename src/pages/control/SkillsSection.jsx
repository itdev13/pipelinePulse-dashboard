import React, { useEffect, useRef, useState } from 'react'
import { Select } from 'antd'
import { controlAPI } from '../../api/control'
import SectionCard, { PrimaryButton, GhostButton } from './SectionCard'

// AI skills — point the AI at a database view.
//
// WHAT THIS IS FOR. Every answer today comes from SQL written into the app.
// A skill lets the data team's own views answer questions instead, without a
// deploy: name the view, say which columns can be filtered on, and the AI
// gains a new tool.
//
// WHAT IT DELIBERATELY IS NOT. There is no SQL box. A form that executes
// typed SQL is arbitrary query execution behind an HTTP endpoint, and no
// read-only role makes that comfortable. The view is written in a migration
// where it gets reviewed; this page points at it.
//
// THE FORM'S ONE REAL IDEA: check the view as soon as its name is entered,
// then drive every column picker from what actually came back. Nobody types a
// column name, so nobody mistypes one — and an unusable view (missing,
// a table, no security_invoker) is refused at the point of entry rather than
// inside a rep's question three weeks later.

const BLANK = {
  name: '', description: '', viewName: '',
  params: [], columns: [], orderBy: '', rowLimit: 50,
  // Insights AI only by default. Deal AI's answer path is a single
  // schema-constrained call with no tool support, so a skill cannot run
  // there — defaulting it on would tick a box that does nothing.
  surfaces: ['portfolio'], isEnabled: true
}

const TYPES = ['text', 'int', 'number', 'bool', 'date']
const OPS = [
  ['eq', 'equals'], ['neq', 'is not'], ['contains', 'contains'],
  ['gt', 'greater than'], ['gte', 'at least'],
  ['lt', 'less than'], ['lte', 'at most'], ['in', 'is one of']
]

export default function SkillsSection() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // a skill, BLANK, or null
  const [error, setError] = useState(null)

  const load = () => controlAPI.listSkills()
    .then((r) => setSkills(r?.skills || []))
    .catch((e) => setError(e?.message || 'Could not load skills'))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const enabled = skills.filter((s) => s.isEnabled).length

  return (
    <SectionCard
      icon="database"
      title="AI skills"
      accent="plum"
      // "0 of 0 active" is a count of nothing presented as a statistic. With no
      // skills the empty state below already says so; the meta slot stays empty.
      meta={loading || skills.length === 0 ? null : `${enabled} of ${skills.length} active`}
      help={
        'Point the AI at a database view and it becomes a tool it can use to answer '
        + 'questions — no deploy needed. The view itself is created by whoever owns the '
        + 'data; this page only says which ones the AI may read and how.'
      }
    >
      {/* SectionCard renders children with no padding of its own — each
          section pads its own body (see MeddicMappingSection). Without this
          the form ran flush to the card edges. */}
      <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'grid', gap: 12 }}>
      {error && <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>}

      {editing ? (
        <SkillForm
          skill={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      ) : (
        <>
          {loading ? (
            <Muted>Loading…</Muted>
          ) : skills.length === 0 ? (
            <Empty onAdd={() => setEditing(BLANK)} />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {skills.map((s) => (
                <SkillRow
                  key={s.id}
                  skill={s}
                  onEdit={() => setEditing(s)}
                  onToggled={load}
                  onDeleted={load}
                  onError={setError}
                />
              ))}
            </div>
          )}
          {skills.length > 0 && (
            <div>
              <PrimaryButton onClick={() => setEditing(BLANK)}>Add a skill</PrimaryButton>
            </div>
          )}
        </>
      )}
      </div>
    </SectionCard>
  )
}

// ── One saved skill ──────────────────────────────────────────────────

function SkillRow({ skill, onEdit, onToggled, onDeleted, onError }) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      await controlAPI.updateSkill(skill.id, { isEnabled: !skill.isEnabled })
      onToggled()
    } catch (e) {
      onError(e?.message || 'Could not change that skill')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await controlAPI.deleteSkill(skill.id)
      onDeleted()
    } catch (e) {
      onError(e?.message || 'Could not delete that skill')
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        padding: '11px 13px',
        background: skill.isEnabled ? '#fff' : 'var(--gray-50)',
        opacity: skill.isEnabled ? 1 : 0.72
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <code style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)',
          fontWeight: 600, color: 'var(--text-heading)'
        }}>
          skill_{skill.name}
        </code>
        {skill.surfaces?.map((s) => (
          <Pill key={s} tone={s === 'deal' ? 'gold' : 'plum'}>
            {s === 'deal' ? 'Deal AI' : 'Insights AI'}
          </Pill>
        ))}
        {!skill.isEnabled && <Pill tone="gray">Off</Pill>}
        <span style={{ flex: 1 }} />
        {/* Usage is how you find a skill with a bad description: the AI only
            picks a tool it understands, so one never used is usually one
            nobody explained properly. */}
        {skill.useCount > 0 && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            used {skill.useCount}×
          </span>
        )}
      </div>

      <p style={{
        margin: '5px 0 0', fontSize: 'var(--text-base)', color: 'var(--text-body)'
      }}>
        {skill.description}
      </p>

      <p style={{
        margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)'
      }}>
        {skill.viewName}
        {skill.params?.length > 0 && ` · ${skill.params.map((p) => p.name).join(', ')}`}
      </p>

      <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
        <GhostButton onClick={onEdit} disabled={busy}>Edit</GhostButton>
        <GhostButton onClick={toggle} disabled={busy}>
          {skill.isEnabled ? 'Turn off' : 'Turn on'}
        </GhostButton>
        <span style={{ flex: 1 }} />
        {confirming ? (
          <>
            <span style={{
              fontSize: 'var(--text-sm)', color: 'var(--text-muted)', alignSelf: 'center'
            }}>
              Delete this skill?
            </span>
            <GhostButton onClick={() => setConfirming(false)} disabled={busy}>Keep</GhostButton>
            <GhostButton onClick={remove} disabled={busy} danger>Delete</GhostButton>
          </>
        ) : (
          <GhostButton onClick={() => setConfirming(true)} disabled={busy} danger>Delete</GhostButton>
        )}
      </div>
    </div>
  )
}

// ── The form ─────────────────────────────────────────────────────────

function SkillForm({ skill, onCancel, onSaved }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...skill }))
  const [cols, setCols] = useState(null)        // the view's real columns
  const [colDocs, setColDocs] = useState({})    // column -> what it means
  const [viewDoc, setViewDoc] = useState(null)  // the view's own description
  const [checking, setChecking] = useState(false)
  const [viewError, setViewError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [errorField, setErrorField] = useState(null)
  const checkSeq = useRef(0)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Columns worth offering. location_id is hidden everywhere: a skill only
  // runs scoped to one sub-account, so filtering or sorting by it can only
  // match everything or nothing, and returning it repeats a value the caller
  // already knew on every row. Offering it invites a filter that does nothing.
  const usable = (cols || []).filter((c) => c !== 'location_id')

  // Check the view as soon as its name settles. Everything below — the column
  // pickers, the sort field — is driven by what comes back, so there is no
  // free-text column entry anywhere and no chance to mistype one.
  useEffect(() => {
    const name = form.viewName?.trim()
    if (!name) { setCols(null); setViewError(null); return }
    const seq = ++checkSeq.current
    setChecking(true)
    const id = window.setTimeout(() => {
      controlAPI.describeView(name)
        .then((r) => {
          if (seq !== checkSeq.current) return   // a newer keystroke won
          setCols(r?.columns || [])
          setColDocs(r?.columnComments || {})
          setViewDoc(r?.viewComment || null)
          setViewError(null)
          // Prefill the description from the view's own comment, but only
          // when the field is untouched — overwriting something someone typed
          // because they paused on the view name would be infuriating.
          setForm((f) => (f.description.trim() || !r?.viewComment
            ? f
            : { ...f, description: r.viewComment }))
        })
        .catch((e) => {
          if (seq !== checkSeq.current) return
          setCols(null)
          setColDocs({})
          setViewDoc(null)
          setViewError(e?.message || 'That view could not be used')
        })
        .finally(() => { if (seq === checkSeq.current) setChecking(false) })
    }, 400)
    return () => window.clearTimeout(id)
  }, [form.viewName])

  const save = async () => {
    setSaving(true); setError(null); setErrorField(null)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        viewName: form.viewName.trim(),
        params: form.params,
        // Always [] now that the form has no column picker. The server
        // resolves this to the view's full list at save time — sending the
        // stored list back would silently freeze a skill's columns as they
        // were the day it was created, so a column added to the view later
        // would never reach the AI.
        columns: [],
        orderBy: form.orderBy?.trim() || null,
        rowLimit: Number(form.rowLimit) || 50,
        surfaces: form.surfaces,
        isEnabled: form.isEnabled
      }
      if (form.id) await controlAPI.updateSkill(form.id, body)
      else await controlAPI.createSkill(body)
      onSaved()
    } catch (e) {
      setError(e?.message || 'Could not save that skill')
      // The server names the field that failed, so the form can point at it
      // instead of showing a banner and leaving someone to hunt.
      //
      // `e.data`, not `e.response.data`: the API client's interceptor rejects
      // with its own Error carrying the body on `.data` (see api/client.js),
      // so reaching for `.response` here would silently never match and no
      // field would ever highlight.
      setErrorField(e?.data?.field || null)
      setSaving(false)
    }
  }

  const addParam = () => set('params', [...form.params, {
    name: '', column: usable[0] || '', type: 'text', op: 'eq', description: ''
  }])
  const setParam = (i, patch) =>
    set('params', form.params.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const removeParam = (i) => set('params', form.params.filter((_, j) => j !== i))

  const ready = form.name.trim() && form.description.trim().length >= 20 && cols?.length

  // What is stopping the save, in the order someone fills the form in. One
  // reason at a time: a list of four faults on an empty form is noise.
  const blocker =
    !form.viewName.trim() ? 'Enter a view to get started'
      : checking ? null
        : !cols?.length ? null              // the view error already shows above
          : !form.name.trim() ? 'Give the skill a name'
            : form.description.trim().length < 20 ? 'Add a description'
              : !form.surfaces.length ? 'Pick where it can be used'
                : null

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {error && <Banner tone="error">{error}</Banner>}

      <Field
        label="Database view"
        hint="The view the AI reads. Created by whoever owns the data, in a migration."
        error={errorField === 'viewName' ? error : viewError}
      >
        {/* Capped rather than full-bleed: a view name is ~30 characters, and a
            900px input with a short placeholder adrift in it reads as an
            unfinished layout. The status sits beside it, not under, so the
            row stays one line once a view resolves. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            style={{ ...input(viewError), maxWidth: 340, fontFamily: 'var(--font-mono)' }}
            value={form.viewName}
            onChange={(e) => set('viewName', e.target.value)}
            placeholder="vw_quiet_deals_by_rep"
            spellCheck={false}
            autoComplete="off"
          />
          {checking && (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Checking…
            </span>
          )}
          {cols && !checking && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 'var(--text-sm)', color: 'var(--accent-pine-text)'
            }}>
              <span className="ms" style={{ fontSize: 15 }}>check_circle</span>
              {cols.length} column{cols.length === 1 ? '' : 's'} · access rules confirmed
            </span>
          )}
        </div>
        {/* What the view is for, in its author's words. Confirms at a glance
            that the right view was named — a typo that happens to match
            another real view is otherwise invisible. */}
        {viewDoc && !checking && (
          <p style={{
            margin: '7px 0 0', padding: '8px 11px',
            background: 'var(--gray-50)',
            borderLeft: '2px solid var(--accent-plum-text)',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--text-body)'
          }}>
            {viewDoc}
          </p>
        )}
      </Field>

      {/* Everything past this point needs the view's real columns, so it stays
          hidden until one resolves. A form that lets you fill in parameters
          for a view that does not exist is a form that wastes your time. */}
      {cols?.length > 0 && (
        <>
          <Field
            label="Skill name"
            hint="What the AI calls it. Lower case, no spaces."
            error={errorField === 'name' ? error : null}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, maxWidth: 340 }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)',
                color: 'var(--text-faint)', padding: '0 2px 0 10px',
                border: '1px solid var(--border-default)', borderRight: 'none',
                borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                height: 32, display: 'flex', alignItems: 'center',
                background: 'var(--gray-50)'
              }}>
                skill_
              </span>
              <input
                style={{
                  ...input(),
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  maxWidth: 280, fontFamily: 'var(--font-mono)'
                }}
                value={form.name}
                onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="quiet_deals_by_rep"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </Field>

          <Field
            label="When should the AI use this?"
            hint="The AI picks tools almost entirely on this text — describe the questions it answers, in the words a rep would use."
            error={errorField === 'description' ? error : null}
          >
            <textarea
              style={{ ...input(), height: 'auto', minHeight: 62, padding: '8px 10px', resize: 'vertical' }}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Deals with no customer reply for a number of days, by owner. Use for 'which of Sarah's deals have gone quiet'."
            />
            {form.description.trim().length > 0 && form.description.trim().length < 20 && (
              <Muted small>A little more detail — the AI needs to know when to reach for this.</Muted>
            )}
          </Field>

          <Field
            label="Filters the AI can apply"
            hint="Optional. Each one becomes something the AI can narrow by."
            error={errorField === 'params' ? error : null}
          >
            {form.params.length === 0 && (
              <Muted small>No filters — the AI always gets the whole view.</Muted>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {form.params.map((p, i) => (
                <ParamRow
                  key={i}
                  param={p}
                  columns={usable}
                  docs={colDocs}
                  onChange={(patch) => setParam(i, patch)}
                  onRemove={() => removeParam(i)}
                />
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <GhostButton onClick={addParam}>Add a filter</GhostButton>
            </div>
          </Field>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Sort by" error={errorField === 'orderBy' ? error : null}>
              {/* antd, not a native <select>: a browser renders <option> with
                  the OS's own menu, which cannot be styled, sized or given the
                  app's type. Every other picker in the app uses this treatment
                  — see TasksTab, DealsTab, TaskEditor. */}
              <Select
                value={form.orderBy || ''}
                onChange={(v) => set('orderBy', v)}
                popupClassName="pp-menu"
                style={{ width: '100%', maxWidth: 300 }}
                styles={{ root: { height: 32 } }}
                options={[
                  { value: '', label: 'No particular order' },
                  ...usable.flatMap((c) => [
                    { value: c, label: `${c} — ascending` },
                    { value: `${c} DESC`, label: `${c} — descending` }
                  ])
                ]}
              />
            </Field>

            <Field label="Most rows to return" hint="1–500.">
              <input
                style={{ ...input(), maxWidth: 110 }}
                type="number"
                min={1}
                max={500}
                value={form.rowLimit}
                onChange={(e) => set('rowLimit', e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Available in"
            hint="Which assistant may use it."
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {[['portfolio', 'Insights AI'], ['deal', 'Deal AI']].map(([key, label]) => {
                const on = form.surfaces.includes(key)
                // Deal AI cannot run a skill: its answer path is one
                // schema-constrained call with no tool support. The option
                // stays visible rather than being hidden — it is on the
                // roadmap, and a silently absent choice is harder to ask
                // about than a disabled one — but it cannot be ticked into a
                // setting that does nothing.
                const unavailable = key === 'deal'
                if (unavailable) {
                  return (
                    <span
                      key={key}
                      title="Deal AI cannot run skills yet"
                      style={{
                        padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                        border: '1px dashed var(--border-default)',
                        background: 'var(--gray-50)', color: 'var(--text-faint)',
                        fontSize: 'var(--text-base)', cursor: 'not-allowed'
                      }}
                    >
                      {label} · not yet
                    </span>
                  )
                }
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set('surfaces',
                      on ? form.surfaces.filter((s) => s !== key) : [...form.surfaces, key])}
                    style={{
                      padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                      border: `1px solid ${on ? 'var(--accent-plum-text)' : 'var(--border-default)'}`,
                      background: on ? 'var(--tint-plum)' : '#fff',
                      color: on ? 'var(--accent-plum-text)' : 'var(--text-muted)',
                      fontSize: 'var(--text-base)', fontWeight: on ? 600 : 400,
                      fontFamily: 'var(--font-sans)', cursor: 'pointer'
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {form.surfaces.length === 0 && (
              <Muted small>Pick at least one, or nothing can use this skill.</Muted>
            )}
          </Field>
        </>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingTop: 12, borderTop: '1px solid var(--border-default)'
      }}>
        <PrimaryButton onClick={save} disabled={!ready || !form.surfaces.length || saving}>
          {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create skill'}
        </PrimaryButton>
        <GhostButton onClick={onCancel} disabled={saving}>Cancel</GhostButton>
        {/* A greyed-out button with no reason beside it reads as broken. Say
            what is still missing — this is the first thing anyone sees on an
            empty form, where nothing is filled in yet and Create is off. */}
        {!saving && blocker && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {blocker}
          </span>
        )}
      </div>
    </div>
  )
}

function ParamRow({ param, columns, docs = {}, onChange, onRemove }) {
  return (
    <div style={{
      border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
      padding: 9, display: 'grid', gap: 7, background: 'var(--gray-50)'
    }}>
      {/* Weighted, not four equal columns: a column name like
          `closed_without_win` needs the room, while "equals" and "text" do
          not. minmax(0, …) so a long option cannot push the row wider than
          its card. */}
      <div style={{
        display: 'grid', gap: 7, alignItems: 'center',
        gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.6fr) minmax(0, 1.1fr) minmax(0, 0.8fr) auto'
      }}>
        <input
          style={input()}
          value={param.name}
          onChange={(e) => onChange({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
          placeholder="rep"
          spellCheck={false}
        />
        <Select
          value={param.column}
          onChange={(v) => onChange({ column: v })}
          popupClassName="pp-menu"
          style={{ width: '100%' }}
          styles={{ root: { height: 32 } }}
          // The column's meaning, where the view's author recorded it — shown
          // on the closed control and on each option.
          title={docs[param.column] || undefined}
          options={columns.map((c) => ({
            value: c,
            label: docs[c] ? <span title={docs[c]}>{c}</span> : c
          }))}
        />
        <Select
          value={param.op}
          onChange={(v) => onChange({ op: v })}
          popupClassName="pp-menu"
          style={{ width: '100%' }}
          styles={{ root: { height: 32 } }}
          options={OPS.map(([v, label]) => ({ value: v, label }))}
        />
        <Select
          value={param.type}
          onChange={(v) => onChange({ type: v })}
          popupClassName="pp-menu"
          style={{ width: '100%' }}
          styles={{ root: { height: 32 } }}
          options={TYPES.map((t) => ({ value: t, label: t }))}
        />
        <GhostButton onClick={onRemove}>Remove</GhostButton>
      </div>
      <input
        style={input()}
        value={param.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="What this filter means, e.g. “the rep who owns the deal”"
      />
    </div>
  )
}

// ── Small shared bits ────────────────────────────────────────────────

const input = (hasError) => ({
  width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px',
  border: `1px solid ${hasError ? 'var(--status-stuck)' : 'var(--border-default)'}`,
  borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-base)', color: 'var(--text-heading)', background: '#fff'
})

function Field({ label, hint, error, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', marginBottom: 4,
        fontSize: 'var(--text-xs)', fontWeight: 600,
        letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
        color: 'var(--text-muted)'
      }}>
        {label}
      </span>
      {hint && (
        <span style={{
          display: 'block', marginBottom: 5,
          fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
        }}>
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span style={{
          display: 'block', marginTop: 4,
          fontSize: 'var(--text-sm)', color: 'var(--status-stuck)'
        }}>
          {error}
        </span>
      )}
    </label>
  )
}

function Banner({ tone, children, onDismiss }) {
  return (
    <p style={{
      margin: 0, padding: '9px 12px', borderRadius: 'var(--radius-sm)',
      background: tone === 'error' ? 'var(--tint-rose)' : 'var(--gray-50)',
      border: `1px solid ${tone === 'error' ? 'var(--status-stuck)' : 'var(--border-default)'}`,
      color: tone === 'error' ? 'var(--status-stuck-text)' : 'var(--text-body)',
      fontSize: 'var(--text-base)',
      display: 'flex', alignItems: 'flex-start', gap: 8
    }}>
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            color: 'inherit', padding: 0, fontSize: 'var(--text-base)'
          }}
        >
          ×
        </button>
      )}
    </p>
  )
}

function Muted({ children, small }) {
  return (
    <p style={{
      margin: small ? '4px 0 0' : 0,
      fontSize: small ? 'var(--text-sm)' : 'var(--text-base)',
      color: 'var(--text-muted)'
    }}>
      {children}
    </p>
  )
}

function Pill({ tone, children }) {
  const color = tone === 'gray' ? 'var(--text-muted)' : `var(--accent-${tone}-text)`
  const bg = tone === 'gray' ? 'var(--gray-100)' : `var(--tint-${tone})`
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 'var(--radius-pill)',
      background: bg, color, fontSize: 'var(--text-xs)', fontWeight: 600
    }}>
      {children}
    </span>
  )
}

function Empty({ onAdd }) {
  return (
    <div style={{ textAlign: 'center', padding: '18px 0' }}>
      <p style={{ margin: '0 0 3px', fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
        No skills yet.
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
        Add one and the AI can answer questions straight from your own views.
      </p>
      <PrimaryButton onClick={onAdd}>Add a skill</PrimaryButton>
    </div>
  )
}
