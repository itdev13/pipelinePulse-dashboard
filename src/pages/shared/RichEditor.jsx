import React, { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { sanitiseHtml, htmlToText, isHtmlEmpty } from '../../utils/sanitiseHtml'

// The note/task body editor.
//
// WHY RICH TEXT AT ALL. GoHighLevel stores a note body as HTML — the network
// payload for its own editor is
// `<p style="margin: 0px">text<strong>bold</strong></p>`. Our editor was a
// plain <textarea> that ran stripHtml() on the way in and sent plain text on
// the way out, so a note written with formatting in GHL LOST that formatting
// the moment a rep edited it here. That is data loss, not a missing feature.
//
// WHY TIPTAP RATHER THAN contentEditable. Browser-native editing
// (document.execCommand) is deprecated and its list and paste behaviour
// diverges between engines. TipTap sits on ProseMirror, which holds an explicit
// document model and applies changes as transactions — so a paste from Word or
// Gmail resolves to a predictable tree instead of whatever the browser felt
// like inserting.
//
// PASTE IS SANITISED ON THE WAY IN, not only on save. Two reasons: what the rep
// sees in the editor should be what gets stored, and ProseMirror's own schema
// filtering is about document validity, not safety.
export default function RichEditor({
  value = '',
  onChange,
  placeholder = 'Write a note…',
  disabled = false,
  // Rendered under the editor. GHL's own limit is 65000; the caller passes its
  // own so this component does not encode a server rule.
  maxLength = null,
  minHeight = 150,
  invalid = false,
  autoFocus = false
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Off deliberately, each for a reason:
        //   heading    — a note is not a document; H1 inside a timeline row
        //                fights the row's own heading
        //   codeBlock  — nothing in this workflow pastes code, and it swallows
        //                Enter
        //   horizontalRule — no use in a note, and it is easy to insert by
        //                accident with '---'
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        // Link is configured separately below, so the StarterKit copy would
        // register a duplicate extension and warn.
        link: false
      }),
      Underline,
      Link.configure({
        openOnClick: false,          // clicking inside an editor should place the cursor
        autolink: true,              // typing a URL makes it a link
        defaultProtocol: 'https',
        // ProseMirror's own href guard. Belt and braces with sanitiseHtml:
        // this stops a javascript: link being CREATED, the sanitiser stops one
        // being stored or rendered.
        protocols: ['http', 'https', 'mailto', 'tel']
      })
    ],
    // Sanitised on the way IN as well. `value` may be a note written in GHL
    // (or by an integration) and we are about to hand it to a contentEditable.
    content: sanitiseHtml(value),
    editable: !disabled,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'pp-editor-content',
        // Announced to screen readers as a rich text field.
        role: 'textbox',
        'aria-multiline': 'true'
      },
      // THE PASTE HOOK. Without this, pasting from Word or a web page inserts
      // its markup — including `<script>`-adjacent constructs and pages of
      // inline styles — and ProseMirror keeps whatever its schema permits.
      transformPastedHTML: (html) => sanitiseHtml(html)
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      // ProseMirror emits '<p></p>' for an empty document. Reporting that as
      // content would make a required-field check pass on an empty note.
      onChange?.(isHtmlEmpty(html) ? '' : html)
    }
  })

  // Keep the editor in step when the caller replaces `value` wholesale — a
  // different note opened in the same dialog, or a save echoing GHL's version
  // back.
  //
  // Guarded against the feedback loop: onUpdate → caller setState → new
  // `value` → setContent → onUpdate. Comparing to the editor's current HTML
  // means a value we ourselves just emitted is a no-op.
  useEffect(() => {
    if (!editor) return
    const incoming = sanitiseHtml(value)
    if (incoming === editor.getHTML()) return
    if (isHtmlEmpty(incoming) && isHtmlEmpty(editor.getHTML())) return
    // `false` — do not emit an update for a programmatic change, or opening a
    // note would immediately mark the form dirty.
    editor.commands.setContent(incoming, false)
  }, [value, editor])

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [disabled, editor])

  if (!editor) return null

  const count = maxLength ? htmlToText(editor.getHTML()).length : 0
  const over = maxLength ? count > maxLength : false

  return (
    <div>
      <div
        className="pp-editor"
        style={{
          border: `1px solid ${invalid || over ? 'var(--status-stuck)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--radius-md)',
          background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
          overflow: 'hidden'
        }}
      >
        <Toolbar editor={editor} disabled={disabled} />
        <EditorContent
          editor={editor}
          style={{ minHeight }}
          // The placeholder is CSS-driven (see .pp-editor-content:empty::before)
          // because ProseMirror always has a paragraph node, so an empty
          // document is not an empty element.
          data-placeholder={placeholder}
        />
      </div>

      {maxLength && (
        <div
          style={{
            marginTop: 4, textAlign: 'right',
            fontSize: 'var(--text-sm)',
            color: over ? 'var(--status-stuck-text)' : 'var(--text-faint)'
          }}
        >
          {/* Counts TEXT, not markup. A body of 300 visible characters can be
              3000 of HTML, and GHL's limit is on what it stores — so counting
              the HTML would refuse notes the server would accept. */}
          {count.toLocaleString()} / {maxLength.toLocaleString()}
        </div>
      )}
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────
//
// Mirrors the controls GHL's own editor offers, minus the ones its buttons
// expose that our schema does not support (colour pickers, alignment) — a
// button that cannot round-trip through our sanitiser would be a control that
// silently loses its effect.
function Toolbar({ editor, disabled }) {
  const btn = (label, icon, isActive, run, title) => (
    <button
      key={label}
      type="button"
      // onMouseDown + preventDefault, NOT onClick: a click moves focus out of
      // the contentEditable first, which collapses the selection — so bolding
      // selected text would apply to nothing.
      onMouseDown={(e) => { e.preventDefault(); run() }}
      disabled={disabled}
      title={title || label}
      aria-label={title || label}
      aria-pressed={isActive}
      className={isActive ? 'pp-tb-btn pp-tb-on' : 'pp-tb-btn'}
    >
      <span className="ms" style={{ fontSize: 17 }}>{icon}</span>
    </button>
  )

  const link = () => {
    const existing = editor.getAttributes('link')?.href || ''
    // eslint-disable-next-line no-alert
    const url = window.prompt('Link URL', existing)
    if (url === null) return                       // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    // Validated by running it through the sanitiser: if the href does not
    // survive, it was not a safe scheme. One rule for creating and storing
    // links rather than two that can disagree.
    const probe = sanitiseHtml(`<a href="${url.replace(/"/g, '&quot;')}">x</a>`)
    if (!/href=/.test(probe)) {
      window.alert('That link is not allowed. Use http, https, mailto or tel.')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="pp-toolbar">
      {btn('Bold', 'format_bold', editor.isActive('bold'),
        () => editor.chain().focus().toggleBold().run(), 'Bold (⌘B)')}
      {btn('Italic', 'format_italic', editor.isActive('italic'),
        () => editor.chain().focus().toggleItalic().run(), 'Italic (⌘I)')}
      {btn('Underline', 'format_underlined', editor.isActive('underline'),
        () => editor.chain().focus().toggleUnderline().run(), 'Underline (⌘U)')}
      {btn('Strike', 'strikethrough_s', editor.isActive('strike'),
        () => editor.chain().focus().toggleStrike().run(), 'Strikethrough')}

      <span className="pp-tb-sep" />

      {btn('Bullets', 'format_list_bulleted', editor.isActive('bulletList'),
        () => editor.chain().focus().toggleBulletList().run(), 'Bulleted list')}
      {btn('Numbers', 'format_list_numbered', editor.isActive('orderedList'),
        () => editor.chain().focus().toggleOrderedList().run(), 'Numbered list')}
      {btn('Quote', 'format_quote', editor.isActive('blockquote'),
        () => editor.chain().focus().toggleBlockquote().run(), 'Quote')}

      <span className="pp-tb-sep" />

      {btn('Link', 'link', editor.isActive('link'), link, 'Add or edit a link')}
      {btn('Clear', 'format_clear', false,
        () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
        'Remove formatting')}

      <span style={{ flex: 1 }} />

      {btn('Undo', 'undo', false,
        () => editor.chain().focus().undo().run(), 'Undo (⌘Z)')}
      {btn('Redo', 'redo', false,
        () => editor.chain().focus().redo().run(), 'Redo (⇧⌘Z)')}
    </div>
  )
}
