import React, { useEffect, useMemo, useRef, useState } from 'react'
import { aiAPI } from '../../api/ai'
import { SkeletonStyles, Bar } from '../shared/ListChrome'

// Deal Hub — Co-Pilot panel.
//
// Two-column composition:
//   Left  · chat history — past questions on this deal, server-backed
//   Right · Co-Pilot: starter chips, the transcript, and the composer
//
// The five starters are written for a sales manager reviewing the deal (next
// step, biggest risk, undelivered promises, missing qualification, coaching the
// rep on price objections). They were cards in the left rail; as chips in the
// Co-Pilot header they sit where the question actually gets asked.
//
// Backend wiring lands next — for now the ask box just captures locally and
// the prompt cards echo the pick into the ask box so the manager can edit
// before hitting Ask. `onAsk` is the single seam that will call the LLM
// endpoint once it exists; nothing else in this file cares which model
// answers.
//
// Every prompt has its own accent (pine / rose / clay / gold / plum). The
// accent is applied to the icon chip + a subtle left rule; the card body
// stays neutral so a row of five cards doesn't turn into a rainbow.

const PROMPTS = [
  // `label` is the full question — it's what lands in the composer when picked.
  // `chipLabel` is the two-or-three-word form the chip shows; the full question
  // and the hint are both in the chip's tooltip.
  {
    id: 'next-step',
    icon: 'arrow_forward',
    accent: 'pine',
    chipLabel: 'Next step',
    label: 'What should I do next?',
    hint: 'Fills the next step and drafts a message'
  },
  {
    id: 'risk',
    icon: 'warning',
    accent: 'rose',
    chipLabel: 'Biggest risk',
    label: 'What is the biggest risk here?',
    hint: "Reads this deal's messages"
  },
  {
    id: 'promises',
    icon: 'handshake',
    accent: 'clay',
    chipLabel: 'Undelivered promises',
    label: 'What have we promised and not delivered?',
    hint: 'Checks commitments against the timeline'
  },
  {
    id: 'qualification',
    icon: 'rule',
    accent: 'gold',
    chipLabel: 'Missing qualification',
    label: 'What qualification is still missing?',
    hint: 'Against the gate for this stage'
  },
  {
    id: 'coaching',
    icon: 'psychology',
    accent: 'plum',
    chipLabel: 'Coach the rep',
    label: 'How should the rep handle the price objection?',
    hint: 'Coaching view for the manager'
  }
]
// Mirrors the server's limits in routes/ai.js — validated there too, since a
// client check is a courtesy and not a guarantee.
const MAX_ATTACHMENTS = 3
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
// Total across all attachments — must match MAX_TOTAL_BYTES in routes/ai.js.
// Enforced here so an oversized set is refused before it's read and uploaded,
// rather than after a 5MB round trip.
const MAX_TOTAL_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
function mbLabel(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AskDeal({ dealId, onAsk, onJumpToMessage, beforeAsk, messages = [] }) {
  const [q, setQ] = useState('')
  // Transcript of this deal's Q&A. Client-held: it's scratch context for
  // follow-ups, and every question is already persisted server-side in
  // ai_runs for the audit trail.
  const [turns, setTurns] = useState([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const [available, setAvailable] = useState(null)
  const scrollRef = useRef(null)

  // Is the AI layer configured at all? Without this the panel would offer a
  // button that always 503s.
  useEffect(() => {
    let alive = true
    aiAPI.status()
      .then((r) => alive && setAvailable(!!r.available))
      .catch(() => alive && setAvailable(false))
    return () => { alive = false }
  }, [])

  // Past chats for this deal, from ai_runs. Loading these is what makes the
  // panel resumable across reloads.
  const [history, setHistory] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [toast, setToast] = useState(null)
  // Per-question channel scope. Transient: narrows this answer only.
  const [channels, setChannels] = useState([])
  // Which run's "messages considered" modal is open.
  const [inspectRunId, setInspectRunId] = useState(null)
  const [composerFocused, setComposerFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Which attachment is open full-size. Null = closed.
  const [preview, setPreview] = useState(null)
  // Monotonic id source for attachments — see the note where they're built.
  const attachSeq = useRef(0)

  // Attached images — a question aid, not evidence. They help the model
  // understand what is being asked; every claim still needs a message quote.
  const [attachments, setAttachments] = useState([])
  const fileRef = useRef(null)

  const addFiles = async (fileList) => {
    const picked = Array.from(fileList || [])
    if (!picked.length) return
    const room = MAX_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setError(`At most ${MAX_ATTACHMENTS} images per question.`)
      return
    }

    // Counts what's already attached, so the running total spans both the
    // existing attachments and the ones being added now.
    let runningTotal = attachments.reduce((n, a) => n + (a.bytes || 0), 0)

    const next = []
    for (const file of picked.slice(0, room)) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setError('Images only — JPEG, PNG, GIF or WebP.')
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`${file.name} is ${mbLabel(file.size)} — images must be under 5 MB.`)
        continue
      }
      // Refuse before reading: three 4MB images each pass the per-image check
      // but together exceed what one request can carry.
      if (runningTotal + file.size > MAX_TOTAL_BYTES) {
        setError(
          `${file.name} would take the attachments over 5 MB in total. Remove one first.`
        )
        continue
      }
      runningTotal += file.size
      // Strip the data: prefix — the API wants bare base64, and leaving it on
      // is the mistake the server rejects with a 400.
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(r.error)
        r.readAsDataURL(file)
      })
      next.push({
        // Pasted screenshots all arrive as "image.png" with the same size, so
        // name+size+index collides across separate paste actions — two pastes
        // would produce duplicate React keys and the remove button would
        // delete the wrong thumbnail. attachSeq is monotonic per session.
        id: `att-${attachSeq.current++}`,
        // A clipboard image has no meaningful filename. "Pasted image" is
        // honest; "image.png" three times over is not.
        name: file.name && file.name !== 'image.png' ? file.name : 'Pasted image',
        bytes: file.size,
        mediaType: file.type,
        previewUrl: dataUrl,
        data: dataUrl.split(',')[1] || ''
      })
    }
    if (next.length) setAttachments((prev) => [...prev, ...next])
  }
  const inputRef = useRef(null)

  // ── Dictation ────────────────────────────────────────────────────────
  //
  // Web Speech API. Chromium and Safari only — Firefox has never shipped it —
  // so the mic is disabled with a reason rather than present and dead.
  //
  // The composer swaps into a recording state while this runs, the way a
  // messaging app does: live transcript, elapsed timer, and an explicit
  // cancel. A mic that silently fills the box gives you no way to abandon a
  // mis-heard sentence without deleting it by hand.
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')        // live transcript, this session
  const [elapsed, setElapsed] = useState(0)     // seconds
  const recognitionRef = useRef(null)
  const baseTextRef = useRef('')                // what was typed before recording
  const cancelledRef = useRef(false)
  const timerRef = useRef(null)

  const speechSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startDictation = (e) => {
    e?.stopPropagation()
    if (!speechSupported || listening) return

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new Ctor()
    rec.lang = 'en-GB'
    rec.interimResults = true
    // Continuous, because the overlay gives an explicit stop. Without one you
    // get a single utterance and the mic closes itself mid-thought.
    rec.continuous = true
    recognitionRef.current = rec

    // Keep whatever was already typed — tapping the mic part-way through a
    // question means "carry on", not "start again".
    baseTextRef.current = q
    cancelledRef.current = false
    setHeard('')
    setElapsed(0)

    rec.onresult = (ev) => {
      let text = ''
      for (let i = 0; i < ev.results.length; i++) {
        text += ev.results[i][0].transcript
      }
      setHeard(text.trimStart())
    }
    rec.onend = () => {
      stopTimer()
      setListening(false)
      recognitionRef.current = null
      // Commit unless the user cancelled. Reading the transcript from state
      // here would be stale inside this closure, so the commit happens in the
      // effect below, keyed on `listening` going false.
    }
    rec.onerror = (ev) => {
      // 'no-speech' and 'aborted' are ordinary — someone tapped the mic and
      // said nothing. A permission denial is worth surfacing, since the
      // control looks broken otherwise.
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
        setError('Microphone access is blocked — allow it in your browser to dictate.')
        cancelledRef.current = true
      }
      stopTimer()
      setListening(false)
      recognitionRef.current = null
    }

    try {
      rec.start()
      setListening(true)
      timerRef.current = window.setInterval(() => setElapsed((n) => n + 1), 1000)
    } catch {
      stopTimer()
      setListening(false)
    }
  }

  // Finish and keep what was heard.
  const finishDictation = (e) => {
    e?.stopPropagation()
    cancelledRef.current = false
    recognitionRef.current?.stop()
  }

  // Abandon: the mic closes and nothing reaches the composer.
  const cancelDictation = (e) => {
    e?.stopPropagation()
    cancelledRef.current = true
    recognitionRef.current?.abort?.() ?? recognitionRef.current?.stop()
    setHeard('')
  }

  // Commit the transcript once recording actually stops. Doing this in
  // rec.onend would read a stale `heard` from the closure that created the
  // recogniser.
  useEffect(() => {
    if (listening) return
    if (cancelledRef.current) { setHeard(''); return }
    const text = heard.trim()
    if (!text) return
    const base = baseTextRef.current
    setQ((base ? `${base.replace(/\s+$/, '')} ` : '') + text)
    setHeard('')
    inputRef.current?.focus()
    // `heard` is intentionally the only trigger alongside `listening`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening])

  // Leaving the deal mid-dictation must release the microphone, or the browser
  // keeps its recording indicator on after the panel is gone.
  useEffect(() => () => {
    stopTimer()
    recognitionRef.current?.abort?.() ?? recognitionRef.current?.stop()
  }, [])

  // Per-channel counts of what the AI would read right now, derived from the
  // live timeline rows rather than fetched — the server count would lag a
  // channel toggle, and the stale number is precisely the one the rep is
  // reading while deciding what to ask.
  const scope = useMemo(() => {
    const byChannel = {}
    let readable = 0
    let untranscribedCalls = 0
    let notes = 0
    let total = 0

    for (const m of messages) {
      // Events (opp created, DND enabled, …) aren't evidence.
      if (m.event) continue
      // Tasks share the timeline but aren't conversation evidence, so they
      // don't belong in a message count. Notes DO count — they're written
      // context the agent reads.
      if (m.kind === 'task') continue
      total++
      if (!m.readable) { untranscribedCalls++; continue }
      if (m.channel === 'NOTE' || m.kind === 'note') { notes++; readable++; continue }
      const key = String(m.channel || '').toLowerCase()
      byChannel[key] = (byChannel[key] || 0) + 1
      readable++
    }

    const unreadReasons = []
    if (untranscribedCalls > 0) {
      unreadReasons.push(
        `${untranscribedCalls} call${untranscribedCalls === 1 ? '' : 's'} not transcribed`
      )
    }

    return {
      readable,
      notes,
      byChannel,
      coverage: { messagesTotal: total, messagesRead: readable, unreadReasons }
    }
  }, [messages])

  const loadHistory = () => {
    if (!dealId) return Promise.resolve()
    return aiAPI.askHistory(dealId)
      .then((r) => setHistory(r.chats || []))
      .catch(() => {})
  }

  // Switching deals clears the live transcript — the thread it was grounded
  // in is gone — and pulls that deal's own history.
  useEffect(() => {
    setTurns([])
    setError(null)
    setQ('')
    setActiveChatId(null)
    setHistory([])
    setChannels([])
    setInspectRunId(null)
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId])

  // Reopen a past chat into the live transcript. It becomes the conversation,
  // so a follow-up carries its context.
  const reopen = (chat) => {
    setTurns([
      { role: 'user', content: chat.question },
      {
        role: 'assistant',
        answerText: chat.answerText,
        citations: chat.citations || [],
        confidence: chat.confidence,
        answered: chat.answered,
        coverage: chat.coverage,
        cached: true,
        runId: chat.id,
        readMessageIds: chat.readMessageIds || []
      }
    ])
    setActiveChatId(chat.id)
    setError(null)
    setToast('Chat reopened')
    window.setTimeout(() => setToast(null), 2200)
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns, pending])

  const submit = async (override) => {
    const value = String(override ?? q).trim()
    if (!value || pending) return
    if (onAsk) onAsk(value)

    setQ('')
    // The auto-grow sets an inline height on the textarea; clearing the value
    // doesn't undo it, so without this the box stays as tall as the question
    // that was just sent.
    if (inputRef.current) inputRef.current.style.height = 'auto'
    // Capture the attachments for THIS question and clear the composer. Read
    // into a local first: setState is async, so referencing `attachments`
    // inside the request below would race with the clear.
    const sentImages = attachments
    setAttachments([])
    setError(null)
    setPending(true)
    // Show the question immediately; the answer lands under it.
    setTurns((t) => [...t, { role: 'user', content: value }])

    // Flush any pending include/exclude ticks first. The server derives the
    // message set itself, so an unsaved checkbox would silently not apply to
    // this question.
    if (beforeAsk) {
      try { await beforeAsk() } catch (err) { /* the toggle rolls itself back */ }
    }

    // Send only prior *answered* turns as history, so a failed attempt
    // doesn't poison the follow-up context.
    const history = turns
      .filter((t) => t.role === 'user' || (t.role === 'assistant' && t.answerText))
      .map((t) => ({
        role: t.role,
        content: t.role === 'user' ? t.content : t.answerText
      }))

    try {
      const res = await aiAPI.ask(dealId, {
        question: value,
        history,
        channels: channels.length ? channels : null
        ,
        images: sentImages.map(({ mediaType, data }) => ({ mediaType, data }))
      })
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          answerText: res.answerText,
          citations: res.citations || [],
          confidence: res.confidence,
          answered: res.answered !== false,
          coverage: res.coverage,
          cached: res.cached,
          runId: res.runId,
          readMessageIds: res.readMessageIds || [],
          channelScope: res.channelScope || null
        }
      ])
      setActiveChatId(res.runId)
      // The answer is now a resumable chat — pull it into the list.
      loadHistory()
    } catch (err) {
      // Named failure states, never a permanent spinner (spec §5).
      const code = err.code
      setError(
        code === 'AI_NOT_CONFIGURED'
          ? 'The AI layer is not configured on the server yet.'
          : code === 'TIMEOUT'
          ? 'The model took too long. Try again — long threads can be slow.'
          : code === 'MALFORMED'
          ? 'The model returned something unreadable. Try rephrasing the question.'
          : code === 'RATE_LIMITED'
          ? 'Rate limited. Wait a moment and try again.'
          : err.message || 'Could not get an answer.'
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        // Chat history is the narrow rail, Co-Pilot the wide panel — the
        // conversation is the work, the history is navigation.
        gridTemplateColumns: 'minmax(300px, 1.15fr) minmax(0, 3fr)',
        gap: 14,
        // Each panel owns its height and they align to the top. `stretch` (the
        // grid default) tied them together — whichever panel was taller drove
        // the row, so a long chat history stretched Co-Pilot and left it with a
        // blank middle. They now set their own height: 410 for the rail, 560 for
        // Co-Pilot, which needs the room for the transcript and composer.
        alignItems: 'start'
      }}
    >
      {preview && (
        <ImagePreview
          attachment={preview}
          onClose={() => setPreview(null)}
        />
      )}

      {inspectRunId && (
        <MessagesConsideredModal
          runId={inspectRunId}
          onClose={() => setInspectRunId(null)}
          onJumpToMessage={onJumpToMessage}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'absolute', right: 0, bottom: -6,
            zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 14px',
            borderRadius: 'var(--radius-md)',
            background: '#fff',
            boxShadow: 'var(--shadow-overlay)',
            fontSize: 'var(--text-md)', color: 'var(--text-heading)'
          }}
        >
          <span className="ms" style={{ fontSize: 17, color: 'var(--status-done)' }}>
            check_circle
          </span>
          {toast}
        </div>
      )}
      {/* Left rail — Chat history. Server-backed (ai_runs), so a rep who
          reloads or comes back tomorrow still has the thread of what was
          asked. */}
      <section
        style={{
          border: '2px solid var(--brand-primary)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          // Its own height, independent of Co-Pilot. 410 = the previous shared
          // 560 less the 150 asked for.
          height: 410
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '13px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--panel-tint, var(--gray-25))'
          }}
        >
          <span className="ms" style={{ fontSize: 19, color: 'var(--brand-primary)' }}>
            history
          </span>
          <h3
            style={{
              fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--brand-primary)',
              margin: 0, flex: 1
            }}
          >
            Chat history
          </h3>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
            {history.length} {history.length === 1 ? 'chat' : 'chats'}
          </span>
        </header>

        {/* flex:1 + minHeight:0 lets the list shrink below its content height.
            Without the minHeight override a flex item refuses to shrink past
            its content and the overflow silently never engages. */}
        <div
          style={{
            // The whole rail is the history now that the starters have moved
            // into Co-Pilot's header as chips.
            flex: 1, minHeight: 0, overflowY: 'auto',
            padding: 12
          }}
        >
          <ChatHistory
            chats={history}
            activeId={activeChatId}
            onReopen={reopen}
            onInspect={setInspectRunId}
          />
        </div>

      </section>

      {/* Co-Pilot — the wide panel. */}
      <section
        style={{
          border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-teal-text)',
        ['--panel-tint']: 'var(--tint-teal)',
          borderRadius: 'var(--radius-md)',
          background: '#fff',
          display: 'flex', flexDirection: 'column',
          // Taller than the history rail: this panel holds the transcript and
          // the composer, so it needs the room. Sized independently now.
          height: 560
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: '13px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--panel-tint, var(--gray-25))'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)' }}>
            forum
          </span>
          <h3
            style={{
              fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--accent-teal)',
              margin: 0, flex: 1
            }}
          >
            Co-Pilot
          </h3>
        </header>

        {/* Starter chips. Moved out of the left rail — as full cards they took
            ~600px there and left the chat history one row tall. As chips they
            sit where the question gets asked, which is also where you'd reach
            for one. */}
        <div
          style={{
            display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap',
            padding: '11px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--gray-25)'
          }}
        >
          {PROMPTS.map((p) => (
            <PromptChip
              key={p.id}
              prompt={p}
              onPick={() => {
                setQ(p.label)
                // Land the cursor in the composer so the chip is a starting
                // point you can edit, not a committed question.
                inputRef.current?.focus()
              }}
            />
          ))}
        </div>

        <div
          style={{
            padding: 16, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
            // Fill the panel: the transcript takes the slack (min-height 0 so
            // it can shrink and scroll), the composer is pinned below it.
            flex: 1, minHeight: 0
          }}
        >
          {/* Empty state.
              Was a one-line grey note pinned to the top, leaving ~600px of
              blank panel below it — the composer sat at the bottom and nothing
              occupied the middle. Now it fills the space and explains the two
              things worth knowing before you ask. */}
          {turns.length === 0 && (
            <div
              style={{
                flex: 1, minHeight: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 'var(--space-3)', padding: 'var(--space-5)',
                textAlign: 'center'
              }}
            >
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 52, height: 52,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--tint-teal)', color: 'var(--accent-teal-text)'
                }}
              >
                <span className="ms" style={{ fontSize: 26 }}>forum</span>
              </span>

              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-xl)', fontWeight: 600,
                    color: 'var(--text-heading)'
                  }}
                >
                  Ask anything about this deal
                </p>
                <p
                  style={{
                    margin: '5px auto 0', maxWidth: 380,
                    fontSize: 'var(--text-md)', lineHeight: 'var(--leading-normal)',
                    color: 'var(--text-muted)'
                  }}
                >
                  Start with a chip above, or type your own question below.
                </p>
              </div>

              {/* The two guarantees worth stating up front — they're what makes
                  an answer trustworthy, and they were buried in a grey line. */}
              <div
                style={{
                  display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap',
                  justifyContent: 'center', marginTop: 'var(--space-1)'
                }}
              >
                {[
                  ['task_alt', 'Every claim carries a quote you can click'],
                  ['visibility', "Reads only this deal's messages"]
                ].map(([icon, text]) => (
                  <span
                    key={icon}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 'var(--text-base)', color: 'var(--text-muted)'
                    }}
                  >
                    <span
                      className="ms"
                      style={{ fontSize: 16, color: 'var(--accent-pine-text)' }}
                    >
                      {icon}
                    </span>
                    {text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {available === false && (
            <p
              style={{
                margin: 0, padding: '10px var(--space-3)',
                borderLeft: '3px solid var(--status-working)',
                background: 'var(--tint-gold)',
                fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-body)'
              }}
            >
              The AI layer is not configured on this server yet — set
              ANTHROPIC_API_KEY to enable it.
            </p>
          )}

          {(turns.length > 0 || pending) && (
            <div
              ref={scrollRef}
              style={{
                display: 'grid', gap: 'var(--space-3)',
                // Takes whatever height is going and scrolls inside itself, so
                // a long conversation never pushes the composer off-panel.
                flex: 1, minHeight: 0, overflowY: 'auto'
              }}
            >
              {turns.map((t, i) =>
                t.role === 'user' ? (
                  <p
                    key={i}
                    style={{
                      margin: 0, justifySelf: 'end', maxWidth: '85%',
                      padding: '9px 13px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-selected)',
                      color: 'var(--text-heading)',
                      fontSize: 'var(--text-md)', lineHeight: 1.5
                    }}
                  >
                    {t.content}
                  </p>
                ) : (
                  <Answer
                    key={i}
                    turn={t}
                    onJumpToMessage={onJumpToMessage}
                    onInspect={t.runId ? () => setInspectRunId(t.runId) : undefined}
                  />
                )
              )}
              {pending && <Thinking />}
            </div>
          )}

          {error && (
            <p
              style={{
                margin: 0, padding: '10px var(--space-3)',
                borderLeft: '3px solid var(--status-stuck)',
                background: 'var(--tint-rose)',
                fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--status-stuck)'
              }}
            >
              {error}
            </p>
          )}

          {/* Composer — pinned to the bottom of the panel. marginTop:auto does
              the pinning when the transcript is empty; once it has content the
              transcript's flex:1 has already claimed the space. */}
          <div
            style={{
              marginTop: 'auto', flex: 'none',
              display: 'grid', gap: 'var(--space-2)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--border-default)'
            }}
          >
          <ChannelScope value={channels} onChange={setChannels} scope={scope} />

          {/* While dictating, the composer IS the recorder — the same box, a
              different state. A separate floating panel would leave a dead
              text field underneath it. */}
          {listening ? (
            <RecordingBar
              heard={heard}
              elapsed={elapsed}
              onCancel={cancelDictation}
              onFinish={finishDictation}
            />
          ) : (
          <div
            onClick={() => inputRef.current?.focus()}
            // Drag an image onto the composer. Same path as paste and the
            // attach button — one validation and read routine for all three.
            onDragOver={(e) => {
              if (![...(e.dataTransfer?.items || [])].some((it) => it.kind === 'file')) return
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => {
              // Fires when crossing into a child too, so ignore anything that
              // didn't actually leave the wrapper — otherwise the highlight
              // flickers as the cursor moves over the textarea.
              if (e.currentTarget.contains(e.relatedTarget)) return
              setDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer?.files)
            }}
            style={{
              display: 'grid', gap: 'var(--space-2)',
              padding: '12px 14px',
              // 2px and a brand-tinted ring on focus. A 1px hairline round the
              // most-used control on the panel read as faint — this is the
              // "bold, vibrant" the client asked for.
              border: dragging
                ? '2px dashed var(--brand-primary)'
                : `2px solid ${composerFocused ? 'var(--brand-primary)' : 'var(--border-strong)'}`,
              borderRadius: 'var(--radius-lg)',
              background: dragging ? 'var(--tint-pine)' : '#fff',
              boxShadow: composerFocused || dragging
                ? '0 0 0 4px rgba(22, 133, 95, 0.12)'
                : 'var(--shadow-card)',
              cursor: 'text'
            }}
          >
            {/* Thumbnails, above the text — you see what's attached before you
                finish typing the question about it. */}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreview(a) }}
                      aria-label={`View ${a.name}`}
                      style={{
                        display: 'inline-flex', padding: 0,
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--gray-50)',
                        cursor: 'zoom-in', overflow: 'hidden'
                      }}
                    >
                      <img
                        src={a.previewUrl}
                        alt={a.name}
                        // A blank square gives no clue whether the file failed
                        // to read or the image just can't render. Swap in an
                        // icon so the state is legible.
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const box = e.currentTarget.parentElement
                          if (box) box.dataset.failed = 'true'
                        }}
                        style={{
                          display: 'block',
                          width: 56, height: 56, objectFit: 'cover'
                        }}
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                      }}
                      aria-label={`Remove ${a.name}`}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, padding: 0,
                        border: 'none', borderRadius: '50%',
                        background: 'var(--gray-800)', color: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      <span className="ms" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <textarea
              ref={inputRef}
              // The wrapper draws the focus border and ring; without this the
              // global :focus-visible rule adds a second one around the text.
              className="pp-focus-inherit"
              rows={1}
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                // Grow with the content to a cap, so a long question stays
                // visible while typing instead of scrolling inside one line.
                const el = e.target
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 132)}px`
              }}
              // Paste an image straight into the box — screenshot, then ⌘V.
              // Clipboard items expose .getAsFile(), which yields a real File,
              // so this reuses addFiles rather than duplicating the read,
              // validation and base64 path.
              onPaste={(e) => {
                const files = [...(e.clipboardData?.items || [])]
                  .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
                  .map((it) => it.getAsFile())
                  .filter(Boolean)
                if (!files.length) return   // plain text — let it paste normally
                // Copying from Word or a browser puts BOTH text and an image on
                // the clipboard. Attach the image and let the text paste too,
                // rather than silently dropping half of what was copied.
                const hasText = !!e.clipboardData?.getData('text/plain')
                if (!hasText) e.preventDefault()
                addFiles(files)
              }}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              disabled={pending || available === false}
              placeholder={pending ? 'Reading the thread…' : 'Ask anything about this deal…'}
              style={{
                width: '100%', boxSizing: 'border-box',
                minHeight: 28, maxHeight: 140, resize: 'none',
                border: 'none', outline: 'none', background: 'transparent',
                padding: 0,
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xl)',
                lineHeight: 1.45, color: 'var(--text-heading)'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              {/* Attach an image. A question AID — it tells the model what
                  you're asking about; claims still have to quote the thread. */}
              <IconButton
                icon="add"
                label={
                  attachments.length >= MAX_ATTACHMENTS
                    ? `${MAX_ATTACHMENTS} images is the limit`
                    : 'Attach an image to this question'
                }
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                disabled={
                  pending || available === false || attachments.length >= MAX_ATTACHMENTS
                }
              />
              <input
                ref={fileRef}
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                multiple
                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                style={{ display: 'none' }}
              />

              <span style={{ flex: 1 }} />

              <IconButton
                icon="mic"
                label={
                  speechSupported
                    ? 'Dictate your question'
                    : 'Dictation needs Chrome, Edge or Safari'
                }
                onClick={startDictation}
                disabled={!speechSupported || pending || available === false}
              />

              {(() => {
                const ready = !!q.trim() && !pending && available !== false
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); submit() }}
                    disabled={!ready}
                    // aria-label, not title: a native tooltip here would pop
                    // the same dark OS box beside the mic.
                    aria-label={pending ? 'Reading the thread' : 'Ask'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flex: 'none',
                      width: 38, height: 38, padding: 0,
                      border: 'none', borderRadius: 'var(--radius-pill)',
                      background: ready ? 'var(--brand-primary)' : 'var(--gray-200)',
                      color: '#fff',
                      boxShadow: ready ? '0 2px 6px rgba(13, 91, 64, 0.32)' : 'none',
                      cursor: ready ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <span className="ms" style={{ fontSize: 21 }}>
                      {pending ? 'more_horiz' : 'arrow_upward'}
                    </span>
                  </button>
                )
              })()}
            </div>
          </div>
          )}
          </div>
        </div>
      </section>

    </div>
  )
}

// A starter as a chip: icon + short label, with the hint on hover.
//
// The old card carried a title and a description on two lines; a chip has room
// for neither, so `chipLabel` is the shortened form and the full question still
// goes into the composer when picked.
function PromptChip({ prompt, onPick }) {
  const accent = `var(--accent-${prompt.accent})`
  const tint = `var(--tint-${prompt.accent})`
  return (
    <button
      onClick={onPick}
      title={`${prompt.label} — ${prompt.hint}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: 'pointer',
        height: 34, padding: '0 13px 0 10px',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-pill)',
        background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-md)',
        fontWeight: 500,
        color: 'var(--text-body)',
        transition: 'background 0.15s ease-out, border-color 0.15s ease-out'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = tint
        e.currentTarget.style.borderColor = accent
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#fff'
        e.currentTarget.style.borderColor = 'var(--border-default)'
      }}
    >
      <span className="ms" style={{ fontSize: 18, color: accent }}>{prompt.icon}</span>
      {prompt.chipLabel || prompt.label}
    </button>
  )
}

function ChatHistory({ chats, activeId, onReopen, onInspect }) {
  if (!chats || chats.length === 0) {
    return (
      <p
        style={{
          margin: 0, padding: '10px var(--space-3)',
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-base)', lineHeight: 1.5, color: 'var(--text-muted)'
        }}
      >
        No chats yet. Questions you ask are kept here, so you can pick the
        thread back up later.
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <div style={{ display: 'grid', gap: 6 }}>
          {chats.map((c) => {
            const active = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => onReopen(c)}
                title={`${c.question} — click to reopen`}
                style={{
                  display: 'grid', gap: 4,
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                  padding: '10px var(--space-3)',
                  border: active
                    ? '1px solid var(--brand-primary)'
                    : '1px solid var(--border-default)',
                  borderLeft: active
                    ? '3px solid var(--brand-primary)'
                    : '3px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  // A solid brand fill made the question and answer text
                  // unreadable. The selected row is marked by a left rail and a
                  // tint instead.
                  background: active ? 'var(--tint-pine)' : '#fff',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                {/* The question wraps to two lines instead of truncating on one.
                    Six chats all asking "What is the biggest risk here?" were
                    clipped to "What is the biggest risk her…" — identical and
                    unreadable, which made the whole rail useless. */}
                <span
                  style={{
                    fontSize: 'var(--text-md)', fontWeight: 600,
                    lineHeight: 1.35, color: 'var(--text-heading)',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}
                >
                  {c.question}
                </span>

                <span
                  style={{
                    fontSize: 'var(--text-base)', lineHeight: 1.45, color: 'var(--text-muted)',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}
                >
                  {c.answerText}
                </span>

                {/* Time and message count on one quiet line. These were two
                    separate rows, and "5 messages considered · show more"
                    repeated verbatim on every card — three lines of chrome per
                    entry for a rail that only needs to say which chat is which. */}
                <span
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                    fontSize: 'var(--text-sm)', color: 'var(--text-faint)'
                  }}
                >
                  <span>{askedAtLabel(c.askedAt)}</span>
                  {c.readMessageIds?.length > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span
                        role="button"
                        tabIndex={0}
                        title="See exactly which messages this answer read"
                        onClick={(e) => { e.stopPropagation(); onInspect(c.id) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault(); e.stopPropagation(); onInspect(c.id)
                          }
                        }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          cursor: 'pointer', color: 'var(--text-link)'
                        }}
                      >
                        <span className="ms" style={{ fontSize: 13 }}>visibility</span>
                        {c.readMessageIds.length}
                      </span>
                    </>
                  )}
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}

// "Yesterday · 16:20" near now, an absolute date further back — matching how
// the design words it.
function askedAtLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const days = Math.round((startOfToday - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return time
  if (days === 1) return `Yesterday · ${time}`
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${time}`
}

// One answer turn: prose, the coverage stamp, and clickable citations.
//
// The coverage stamp is rendered above every AI output per spec §1F — it is
// computed server-side in app code, never asked of the model, so it cannot be
// hallucinated. It's also what makes a thin answer trustworthy: "read 6 of 8,
// 2 calls not transcribed" tells the rep why the answer is thin.
function Answer({ turn, onJumpToMessage, onInspect }) {
  const cov = turn.coverage
  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--accent-teal)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
      }}
    >
      {cov && (
        <CoverageStamp
          coverage={cov}
          cached={turn.cached}
          confidence={turn.confidence}
          readMessageIds={turn.readMessageIds}
          channelScope={turn.channelScope}
          onInspect={onInspect}
        />
      )}

      <p
        style={{
          margin: 0, padding: 'var(--space-3) 14px',
          fontSize: 'var(--text-md)', lineHeight: 1.6, color: 'var(--text-body)',
          whiteSpace: 'pre-line'
        }}
      >
        {turn.answerText}
      </p>

      {/* Quote attributions, inline under the prose — the mockup reads them
          as part of the answer, not as a separate evidence list. */}
      {turn.citations?.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'grid', gap: 6 }}>
          {turn.citations.map((c, i) => (
            <button
              key={`${c.messageId}-${i}`}
              onClick={() => onJumpToMessage && onJumpToMessage(c.messageId)}
              title={onJumpToMessage ? 'Jump to this message in the timeline' : undefined}
              style={{
                display: 'block', textAlign: 'left', width: '100%',
                padding: 0, border: 'none', background: 'none',
                cursor: onJumpToMessage ? 'pointer' : 'default',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-md)', lineHeight: 1.55, color: 'var(--text-body)'
              }}
            >
              <span style={{ fontStyle: 'italic' }}>&ldquo;{c.quoteText}&rdquo;</span>
              {c.sourceLabel && (
                <span style={{ color: 'var(--text-muted)' }}> — {c.sourceLabel}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* BASED ON — which messages the answer came from, and the verification
          line. The verification is a code-level guarantee, not a claim the
          model makes: each quote is checked character-exact against its source
          before the answer is shown, and anything unquotable is dropped. */}
      {turn.citations?.length > 0 && (
        <div
          style={{
            padding: '10px 14px var(--space-3)',
            borderTop: '1px solid var(--border-default)'
          }}
        >
          <span
            style={{
              display: 'block', marginBottom: 6,
              fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase', color: 'var(--text-muted)'
            }}
          >
            Based on
          </span>
          <div style={{ display: 'grid', gap: 3 }}>
            {sourceLines(turn.citations).map((line) => (
              <span key={line} style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>
                {line}
              </span>
            ))}
          </div>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginTop: 7,
              fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
            }}
          >
            <span className="ms" style={{ fontSize: 14, color: 'var(--status-done)' }}>
              verified
            </span>
            {turn.citations.length}{' '}
            {turn.citations.length === 1 ? 'quote' : 'quotes'} verified
            character-exact against{' '}
            {turn.citations.length === 1 ? 'its source message' : 'their source messages'}
          </span>
        </div>
      )}

      {/* An answer with no citations is either "the thread doesn't say" — a
          valid answer — or a claim we could not verify. Say which. */}
      {turn.citations?.length === 0 && turn.answered && (
        <p
          style={{
            margin: 0, padding: 'var(--space-2) 14px var(--space-3)',
            fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
          }}
        >
          No verifiable quote was attached to this answer — treat it with care.
        </p>
      )}

      {/* Actions. Both write to GHL, which this app has never done — no POST
          path, no write scopes. Present but disabled rather than absent, so the
          shape of the finished panel is visible and nothing silently no-ops. */}
      {turn.answered && (
        <div
          style={{
            display: 'flex', gap: 6, flexWrap: 'wrap',
            padding: '10px 14px var(--space-3)',
            borderTop: '1px solid var(--border-default)'
          }}
        >
          <AnswerAction icon="sticky_note_2" label="Save as note" />
          <AnswerAction icon="task_alt" label="Create task" />
        </div>
      )}
    </div>
  )
}

// "Email · James Halloran · sent 9 Aug 2026", one line per distinct source
// message. Deduped: two quotes from the same email are one source, and listing
// it twice would overstate how much the answer rests on.
function sourceLines(citations) {
  const seen = new Set()
  const out = []
  for (const c of citations) {
    const line = c.sourceLabel
      ? `${c.sourceLabel}`
      : [c.channelLabel, c.senderName].filter(Boolean).join(' · ')
    if (!line || seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}

// An answer action. Disabled until the write path exists — saving a note or
// creating a task has to reach GHL, and this app has never written to it.
function AnswerAction({ icon, label }) {
  return (
    <button
      disabled
      title="Coming next — this writes back to GoHighLevel"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: 'not-allowed',
        height: 30, padding: '0 var(--space-3)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-pill)',
        background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)',
        color: 'var(--text-faint)',
        opacity: 0.7
      }}
    >
      <span className="ms" style={{ fontSize: 15 }}>{icon}</span>
      {label}
    </button>
  )
}

function CoverageStamp({ coverage, cached, confidence, readMessageIds, channelScope, onInspect }) {
  const partial =
    coverage.messagesRead != null &&
    coverage.messagesTotal != null &&
    coverage.messagesRead < coverage.messagesTotal

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap',
        padding: '7px 14px',
        borderBottom: '1px solid var(--border-default)',
        background: partial ? 'var(--tint-gold)' : 'var(--gray-50)',
        fontSize: 'var(--text-sm)', color: 'var(--text-muted)'
      }}
    >
      <span className="ms" style={{ fontSize: 14 }}>
        {partial ? 'visibility_off' : 'visibility'}
      </span>
      <span
        title={
          readMessageIds?.length
            ? `Message ids read:\n${readMessageIds.join('\n')}`
            : undefined
        }
        style={{ cursor: readMessageIds?.length ? 'help' : 'default' }}
      >
        Read {coverage.messagesRead} of {coverage.messagesTotal}{' '}
        {coverage.messagesTotal === 1 ? 'message' : 'messages'}
      </span>
      {coverage.unreadReasons?.length > 0 && (
        <span style={{ color: 'var(--accent-clay)' }}>
          · {coverage.unreadReasons.join(' · ')}
        </span>
      )}
      {confidence && confidence !== 'high' && (
        <span
          style={{
            padding: '1px 7px', borderRadius: 'var(--radius-pill)',
            background: confidence === 'low' ? 'var(--tint-rose)' : 'var(--tint-gold)',
            color: confidence === 'low' ? 'var(--status-stuck)' : 'var(--accent-gold)',
            fontWeight: 600
          }}
        >
          {confidence} confidence
        </span>
      )}
      {channelScope?.length > 0 && (
        <span
          title="This answer was scoped to these channels"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
            padding: '1px 7px', borderRadius: 'var(--radius-pill)',
            background: 'var(--tint-teal)', color: 'var(--accent-teal-text)',
            fontWeight: 600
          }}
        >
          <span className="ms" style={{ fontSize: 12 }}>filter_alt</span>
          {channelScope.map((c) => c.toUpperCase()).join(' · ')}
        </span>
      )}
      {onInspect && (
        <button
          onClick={onInspect}
          style={{
            border: 'none', background: 'none', padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--text-link)', textDecoration: 'underline'
          }}
        >
          Show more
        </button>
      )}
      {cached && (
        <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>cached</span>
      )}
    </div>
  )
}

function Thinking() {
  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--accent-teal)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        padding: 'var(--space-3) 14px', display: 'grid', gap: 'var(--space-2)'
      }}
    >
      <SkeletonStyles />
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
        Reading the thread…
      </span>
      <Bar w="88%" h={11} />
      <Bar w="72%" h={11} />
      <Bar w="54%" h={11} />
    </div>
  )
}

// Per-question channel scope. "Ask about SMS only" without touching the
// standing inclusion state the timeline checkboxes drive — two different
// ideas, so two different controls.
//
// Nothing selected means every channel, which is why there's no explicit
// "All" chip: an empty selection already says it, and an All chip that
// deselects everything else invites the "did I mean none?" confusion.
const SCOPE_CHANNELS = [
  ['email', 'Email', 'mail'],
  ['sms', 'SMS', 'sms'],
  ['whatsapp', 'WhatsApp', 'chat'],
  ['call', 'Calls', 'call'],
  ['note', 'Notes', 'sticky_note_2']
]

// A composer control: square, quiet, and icon-only. Sized to sit level with the
// send button without competing with it — the send button is the primary action,
// these are secondary.
// The composer while dictating — WhatsApp's recording state, in our palette.
//
// A pulsing dot and a timer say it's live, the transcript appears as it's
// heard, and there are exactly two ways out: bin it or keep it. The bin
// matters — without it a mis-heard sentence has to be deleted by hand, which
// is worse than not offering dictation at all.
function RecordingBar({ heard, elapsed, onCancel, onFinish }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: '12px 14px',
        border: '2px solid var(--status-stuck)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--tint-rose)',
        boxShadow: '0 0 0 4px rgba(220, 38, 38, 0.10)'
      }}
    >
      <style>{RECORDING_CSS}</style>

      {/* Discard. Left, away from the send button, so the two are hard to
          confuse under a moving cursor. */}
      <button
        onClick={onCancel}
        aria-label="Discard this recording"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flex: 'none', width: 38, height: 38, padding: 0,
          border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'transparent', color: 'var(--status-stuck)',
          cursor: 'pointer'
        }}
      >
        <span className="ms" style={{ fontSize: 22 }}>delete</span>
      </button>

      <span
        aria-hidden
        className="pp-rec-dot"
        style={{
          width: 10, height: 10, flex: 'none',
          borderRadius: '50%', background: 'var(--status-stuck)'
        }}
      />

      <span
        style={{
          flex: 'none',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)',
          fontWeight: 600, color: 'var(--status-stuck)',
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {formatElapsed(elapsed)}
      </span>

      {/* Waveform. Decorative — the Web Speech API gives no amplitude, so
          animating to real levels would need a parallel getUserMedia stream
          and an analyser node for no functional gain. It signals "listening",
          which is its whole job. */}
      <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 'none' }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span
            key={i}
            className="pp-rec-bar"
            style={{
              width: 3, borderRadius: 2,
              background: 'var(--status-stuck)',
              animationDelay: `${i * 0.09}s`
            }}
          />
        ))}
      </span>

      {/* What's been heard so far. Scrolls rather than growing the bar, so a
          long dictation doesn't push the buttons off-screen. */}
      <span
        style={{
          flex: 1, minWidth: 0, maxHeight: 46, overflowY: 'auto',
          fontSize: 'var(--text-md)', lineHeight: 'var(--leading-snug)',
          color: heard ? 'var(--text-heading)' : 'var(--text-muted)',
          fontStyle: heard ? 'normal' : 'italic'
        }}
      >
        {heard || 'Listening…'}
      </span>

      <button
        onClick={onFinish}
        aria-label="Stop recording and keep the text"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flex: 'none', width: 38, height: 38, padding: 0,
          border: 'none', borderRadius: 'var(--radius-pill)',
          background: 'var(--brand-primary)', color: '#fff',
          boxShadow: '0 2px 6px rgba(13, 91, 64, 0.32)',
          cursor: 'pointer'
        }}
      >
        <span className="ms" style={{ fontSize: 21 }}>check</span>
      </button>
    </div>
  )
}

const RECORDING_CSS = `
@keyframes pp-rec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.35; transform: scale(0.82); }
}
@keyframes pp-rec-wave {
  0%, 100% { height: 7px; }
  50%      { height: 20px; }
}
.pp-rec-dot { animation: pp-rec-pulse 1.1s ease-in-out infinite; }
.pp-rec-bar { height: 7px; animation: pp-rec-wave 0.9s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .pp-rec-dot, .pp-rec-bar { animation: none; }
  .pp-rec-bar { height: 13px; }
}
`

// "0:07" / "1:24".
function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Full-size view of an attached image.
//
// Rendered inside the panel rather than as a portal — the Deal Hub lives in a
// GHL iframe, so a fixed overlay is bounded by the iframe anyway and a portal
// buys nothing.
function ImagePreview({ attachment, onClose }) {
  // Escape closes, and focus moves to the dialog so a keyboard user isn't left
  // tabbing through the composer behind it.
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.name}
      ref={ref}
      tabIndex={-1}
      // Click the backdrop to dismiss. The check keeps a click INSIDE the
      // image from closing it — otherwise you couldn't select or right-click
      // the picture you opened.
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-5)',
        background: 'rgba(20, 25, 34, 0.72)',
        outline: 'none'
      }}
    >
      <div
        style={{
          display: 'grid', gap: 0,
          maxWidth: 'min(920px, 100%)', maxHeight: '100%',
          borderRadius: 'var(--radius-lg)',
          background: '#fff',
          boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <span
            style={{
              flex: 1, minWidth: 0,
              fontSize: 'var(--text-lg)', fontWeight: 600,
              color: 'var(--text-heading)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
          >
            {attachment.name}
          </span>
          <span style={{ flex: 'none', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            {formatBytes(attachment.bytes)}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flex: 'none', width: 32, height: 32, padding: 0,
              border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <span className="ms" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* The image scrolls inside its own box rather than growing the dialog
            past the viewport — a tall screenshot would otherwise push the
            header off-screen. */}
        <div style={{ overflow: 'auto', background: 'var(--gray-50)', minHeight: 0 }}>
          <img
            src={attachment.previewUrl}
            alt={attachment.name}
            style={{ display: 'block', maxWidth: '100%', margin: '0 auto' }}
          />
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function IconButton({ icon, label, onClick, disabled, active }) {
  // Our own tooltip, not the browser's `title`. A native title renders as a
  // dark OS-styled box that ignores the design and takes ~1s to appear — it
  // read as a bug in the middle of the composer.
  const [hint, setHint] = useState(false)

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      {hint && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3, whiteSpace: 'nowrap', pointerEvents: 'none',
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--gray-800)', color: '#fff',
            fontSize: 'var(--text-sm)', fontWeight: 500,
            boxShadow: 'var(--shadow-raised)'
          }}
        >
          {label}
        </span>
      )}
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active ? true : undefined}
        onMouseEnter={() => setHint(true)}
        onMouseLeave={() => setHint(false)}
        onFocus={() => setHint(true)}
        onBlur={() => setHint(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, padding: 0,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          background: active ? 'var(--status-stuck)' : 'transparent',
          color: active
            ? '#fff'
            : disabled ? 'var(--gray-400)' : 'var(--text-muted)',
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
        onMouseOver={(e) => {
          if (!disabled && !active) e.currentTarget.style.background = 'var(--gray-100)'
        }}
        onMouseOut={(e) => {
          if (!active) e.currentTarget.style.background = 'transparent'
        }}
      >
        <span className="ms" style={{ fontSize: 21 }}>{icon}</span>
      </button>
    </span>
  )
}

function ChannelScope({ value, onChange, scope }) {
  const toggle = (key) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key])

  const counts = scope?.byChannel || {}
  // Notes aren't a message channel in the payload — they're separate evidence
  // — so their count comes from its own field.
  const countFor = (key) => (key === 'note' ? scope?.notes ?? null : counts[key] ?? null)

  // How many messages this question will actually read. Nothing selected means
  // everything, which is the number a rep most wants to see before asking.
  const selectedCount = value.length === 0
    ? scope?.readable ?? null
    : value.reduce((n, k) => n + (countFor(k) || 0), 0)

  // Only offer channels that exist on this deal — a chip reading "Email · 0"
  // is a dead end, and offering it invites an empty answer.
  const available = SCOPE_CHANNELS.filter(([key]) => {
    if (!scope) return true          // pre-load: show all rather than flicker
    return (countFor(key) || 0) > 0
  })

  if (scope && available.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span
        style={{
          fontSize: 'var(--text-sm)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2
        }}
      >
        Ask about
      </span>
      {available.map(([key, label, icon]) => {
        const on = value.includes(key)
        const n = countFor(key)
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            title={
              n != null
                ? `${n} ${label} message${n === 1 ? '' : 's'} the AI can read — ` +
                  'excludes unticked rows and calls without a transcript, so this ' +
                  'can be lower than the timeline filter above'
                : undefined
            }
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              cursor: 'pointer',
              height: 26, padding: '0 10px',
              border: on ? '1.5px solid var(--accent-teal)' : '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-pill)',
              background: on ? 'var(--tint-teal)' : '#fff',
              color: on ? 'var(--accent-teal)' : 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)', fontWeight: on ? 600 : 400
            }}
          >
            <span className="ms" style={{ fontSize: 13 }}>{icon}</span>
            {label}
            {n != null && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                  opacity: 0.75
                }}
              >
                {n}
              </span>
            )}
          </button>
        )
      })}

      {/* The number that matters: what this question will read. */}
      {selectedCount != null && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
            fontSize: 'var(--text-sm)', fontWeight: 600,
            color: selectedCount === 0 ? 'var(--status-stuck)' : 'var(--text-muted)'
          }}
        >
          <span className="ms" style={{ fontSize: 13 }}>visibility</span>
          {selectedCount} message{selectedCount === 1 ? '' : 's'}
          {value.length === 0 && ' (all channels)'}
        </span>
      )}

      {value.length > 0 && (
        <button
          onClick={() => onChange([])}
          style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--text-link)', textDecoration: 'underline'
          }}
        >
          clear
        </button>
      )}

      {/* Excluded / unreadable messages are worth naming here too, so a low
          count doesn't look like missing data. */}
      {scope?.coverage?.unreadReasons?.length > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-clay)' }}>
          · {scope.coverage.unreadReasons.join(' · ')}
        </span>
      )}
    </div>
  )
}

// "What did this answer actually read?" — resolved from the ids stored on the
// run, not recomputed from the deal. So an old chat shows what it truly read
// even after the thread has grown or the inclusion state changed.
function MessagesConsideredModal({ runId, onClose, onJumpToMessage }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    aiAPI.runMessages(runId)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setErr(e.message || 'Could not load messages'))
    return () => { alive = false }
  }, [runId])

  // Escape to close — a modal you can only dismiss by aiming at a small × is
  // a modal people fight with.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        background: 'rgba(31, 36, 48, 0.45)'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 100%)', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          borderRadius: 'var(--radius-lg)',
          background: '#fff', boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden'
        }}
      >
        <header
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '14px var(--space-4)',
            borderBottom: '1px solid var(--border-default)',
          background: 'var(--panel-tint, var(--gray-25))'
          }}
        >
          <span className="ms" style={{ fontSize: 20, color: 'var(--accent-teal)', marginTop: 1 }}>
            visibility
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              Messages considered
            </h3>
            {data && (
              <p style={{ margin: '3px 0 0', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
                {data.items.length} of {data.messagesTotal} on this deal
                {data.unreadReasons?.length > 0 && ` · ${data.unreadReasons.join(' · ')}`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2
            }}
          >
            <span className="ms" style={{ fontSize: 20 }}>close</span>
          </button>
        </header>

        {data?.question && (
          <p
            style={{
              margin: 0, padding: '10px var(--space-4)',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--gray-50)',
              fontSize: 'var(--text-md)', color: 'var(--text-body)'
            }}
          >
            <strong style={{ fontWeight: 600 }}>Asked:</strong> {data.question}
          </p>
        )}

        <div style={{ overflowY: 'auto', padding: 'var(--space-2) 0' }}>
          {err && (
            <p style={{ margin: 0, padding: 16, fontSize: 'var(--text-md)', color: 'var(--status-stuck)' }}>
              {err}
            </p>
          )}
          {!data && !err && (
            <p style={{ margin: 0, padding: 16, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
              Loading…
            </p>
          )}
          {data?.items?.length === 0 && (
            <p style={{ margin: 0, padding: 16, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
              This answer read no messages — it was based on the deal facts alone.
            </p>
          )}
          {data?.items?.map((m) => (
            <button
              key={`${m.kind}-${m.id}`}
              onClick={() => {
                if (m.kind === 'message' && onJumpToMessage) {
                  onJumpToMessage(m.id)
                  onClose()
                }
              }}
              style={{
                display: 'grid', gap: 3, width: '100%', textAlign: 'left',
                padding: '10px var(--space-4)',
                border: 'none',
                borderBottom: '1px solid var(--border-default)',
                background: '#fff',
                cursor: m.kind === 'message' && onJumpToMessage ? 'pointer' : 'default',
                fontFamily: 'var(--font-sans)'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: 'var(--tracking-label)',
                    textTransform: 'uppercase',
                    padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--gray-100)', color: 'var(--text-muted)'
                  }}
                >
                  {m.channel}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {m.direction === 'in' ? 'In ←' : '→ Out'}
                </span>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {m.who}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
                  {shortDate(m.at)}
                </span>
              </span>
              <span
                style={{
                  fontSize: 'var(--text-base)', lineHeight: 1.45, color: 'var(--text-body)',
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}
              >
                {m.body || '(no readable text)'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function shortDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
