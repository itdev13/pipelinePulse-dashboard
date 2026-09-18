import React, { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Renders model-generated prose as real markdown — headings, bold, bullet
// lists, tables — matching GHL's Ask AI (ai-frontend's MarkdownRenderer.vue,
// which uses the same two libraries for the same reason).
//
// WHY THIS EXISTS. The answer prompt asks for plain prose, but the model
// reaches for **bold** and bullet lists regardless — the "which deal has more
// value" answer and the "how many exist" answer both did, unprompted. An
// earlier version hand-rolled a bold/italic-only parser for exactly the first
// case and then broke on the second, which needed real lists.
//
// WHY SANITIZED. This is MODEL output rendered as raw HTML. marked.parse()
// turns "<img onerror=alert(1)>" in a message the model quoted straight into
// a live handler if nothing stands between it and the DOM. DOMPurify is that
// step — the same pairing GHL's own renderer uses, not a substitute for it.
export default function MarkdownAnswer({ text, className }) {
  const html = useMemo(() => {
    if (!text) return ''
    const raw = marked.parse(String(text), {
      gfm: true,
      // Reps write "line one\nline two" expecting two lines; CommonMark's
      // default treats a single newline as the same paragraph, which read as
      // the model ignoring its own line breaks.
      breaks: true
    })
    return DOMPurify.sanitize(raw, {
      // No onClick handlers, no javascript: URLs, no <script>/<style> — this
      // is the model's own output, so it gets the same distrust an
      // arbitrary user's would.
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'code', 'pre',
        'ul', 'ol', 'li', 'blockquote',
        'h1', 'h2', 'h3', 'h4',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'hr'
      ],
      ALLOWED_ATTR: ['href']
    })
  }, [text])

  if (!html) return null

  return (
    <div
      className={`pp-md ${className || ''}`}
      // Safe: `html` above is the DOMPurify output, never the raw string.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
