import React, { useMemo, useState } from 'react'
import { Select, Input, DatePicker } from 'antd'
import dayjs from 'dayjs'

// Custom fields, grouped into the folders GHL puts them in.
//
// SHARED between contacts and opportunities. Both objects have folders, both
// render as sections, and the only difference is the wire spelling on save
// (field_value for contacts, fieldValue for opportunities) — which is the
// caller's business, not this component's.
//
// WHY FOLDERS. GHL's own panel renders one collapsible section per
// folder — "General Info", "Website Form", "Charlie lead upload (Crittall)" —
// and a rep navigates by them. Our editor showed no custom fields at all: the
// definitions were synced (migration 023) but never sent to the client, and
// the folder each belongs to was not stored until migration 064.
//
// COLLAPSED BY DEFAULT, except the first. A location with eight folders and
// forty fields would otherwise bury the contact's name, email and phone under
// a wall of inputs. The first section is open so the panel does not read as
// empty.
//
// WHAT IS EDITABLE. Everything except FILE_UPLOAD, which the server flags
// `readOnly` because there is no OAuth documents API — a control that could
// never save would be a lie. Those render their stored value with a note.

// GHL's dataType values, mapped to how each is edited. Unknown types fall
// through to a text box: a field we do not recognise is still better shown
// than hidden, and text round-trips through GHL unchanged.
const MULTI = new Set(['CHECKBOX', 'MULTIPLE_OPTIONS'])
const SINGLE = new Set(['SINGLE_OPTIONS', 'DROPDOWN', 'RADIO'])

export default function CustomFieldSections({
  groups = [],
  // { [fieldId]: value } — only what has been edited, so a save sends the
  // changed fields rather than rewriting all forty.
  draft = {},
  onChange,
  disabled = false
}) {
  // The first section open, the rest closed. Held as a Set of ids rather than
  // a per-section boolean so "expand all" stays a one-liner later.
  const [open, setOpen] = useState(() =>
    new Set(groups.length ? [groups[0].id ?? '__ungrouped__'] : []))

  if (!groups.length) return null

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {groups.map((g) => {
        const key = g.id ?? '__ungrouped__'
        const isOpen = open.has(key)
        // How many fields in this folder actually have a value — shown on the
        // collapsed header so a rep can tell which sections hold data without
        // opening each one.
        const filled = g.fields.filter((f) => {
          const v = draft[f.id] !== undefined ? draft[f.id] : f.value
          return v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
        }).length

        return (
          <section key={key} className="pp-cf-group">
            <button
              type="button"
              className="pp-cf-head"
              onClick={() => toggle(key)}
              aria-expanded={isOpen}
            >
              <span className="ms pp-cf-chev">
                {isOpen ? 'expand_more' : 'chevron_right'}
              </span>
              <span className="pp-cf-name">{g.name}</span>
              {/* Says what is inside, so a collapsed section is not opaque. */}
              <span className="pp-cf-count">
                {filled > 0 ? `${filled} of ${g.fields.length}` : `${g.fields.length}`}
              </span>
            </button>

            {isOpen && (
              <div className="pp-cf-body">
                {g.fields.map((f) => (
                  <CustomField
                    key={f.id}
                    field={f}
                    value={draft[f.id] !== undefined ? draft[f.id] : f.value}
                    dirty={draft[f.id] !== undefined}
                    onChange={(v) => onChange(f.id, v)}
                    disabled={disabled}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CustomField({ field, value, dirty, onChange, disabled }) {
  const type = String(field.type || 'TEXT').toUpperCase()
  const options = useMemo(
    () => (field.options || []).map((o) => ({ value: o, label: o })),
    [field.options]
  )

  // Marks a field whose value differs from what is saved, matching the rest
  // of the form — it is how a rep knows what pressing Save will send.
  const dirtyStyle = dirty
    ? { borderColor: 'var(--brand-primary)', background: 'var(--tint-pine)' }
    : undefined

  let control
  if (field.readOnly) {
    // FILE_UPLOAD. Shown rather than hidden: a rep needs to know the field
    // exists and whether a file is on it, even though we cannot change it.
    control = (
      <div className="pp-cf-readonly">
        {value
          ? <span className="pp-cf-file">{String(value)}</span>
          : <span className="pp-cf-empty">No file</span>}
        <span className="pp-cf-note">Upload files in your CRM</span>
      </div>
    )
  } else if (MULTI.has(type)) {
    control = (
      <Select
        mode="multiple"
        value={Array.isArray(value) ? value : value ? [value] : []}
        onChange={onChange}
        options={options}
        disabled={disabled}
        placeholder="None selected"
        style={{ width: '100%' }}
        popupClassName="pp-menu"
        allowClear
      />
    )
  } else if (SINGLE.has(type)) {
    control = (
      <Select
        value={value || undefined}
        onChange={(v) => onChange(v ?? '')}
        options={options}
        disabled={disabled}
        placeholder="Not set"
        style={{ width: '100%' }}
        popupClassName="pp-menu"
        allowClear
        showSearch
        // Server-side options are already the full list; antd's own filter is
        // right here because there is no request behind it.
        optionFilterProp="label"
      />
    )
  } else if (type === 'DATE') {
    control = (
      <DatePicker
        value={value ? dayjs(value) : null}
        onChange={(d) => onChange(d ? d.format('YYYY-MM-DD') : '')}
        disabled={disabled}
        style={{ width: '100%' }}
        format="D MMM YYYY"
        placeholder="Not set"
      />
    )
  } else if (type === 'TEXTBOX_LIST' || type === 'LARGE_TEXT' || type === 'TEXTAREA') {
    control = (
      <Input.TextArea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={field.placeholder || 'Not set'}
        autoSize={{ minRows: 2, maxRows: 6 }}
        style={dirtyStyle}
      />
    )
  } else {
    // TEXT, NUMERICAL, PHONE, MONETARY and anything unrecognised.
    control = (
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={field.placeholder || 'Not set'}
        inputMode={type === 'NUMERICAL' || type === 'MONETARY' ? 'decimal' : undefined}
        style={dirtyStyle}
      />
    )
  }

  return (
    <label className="pp-cf-field">
      <span className="pp-cf-label">{field.label}</span>
      {control}
    </label>
  )
}
