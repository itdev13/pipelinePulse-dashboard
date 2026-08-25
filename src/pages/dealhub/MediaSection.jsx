import React, { useMemo, useState } from 'react'

// Media — every file attached to a message on this deal.
//
// No new endpoint: the timeline already carries `attachments` on each message
// (extractAttachments in routes/deals.js pulls them out of raw_message), so
// this is a different view of data the page has already fetched. That's why it
// ships now rather than being a permanently disabled tab.
//
// GHL is inconsistent about attachments — email carries `attachments` with
// filenames, SMS and WhatsApp carry `mediaUrls` with no filename at all — so a
// missing name is normal and gets a channel-derived label rather than a blank.

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']

export default function MediaSection({ messages = [], onJumpToMessage }) {
  const [kind, setKind] = useState('all')

  // Flattened from the messages already in memory, newest first, keeping the
  // message each file came from so a click can jump back to its context.
  const files = useMemo(() => {
    const out = []
    for (const m of messages) {
      for (const att of m.attachments || []) {
        out.push({
          ...att,
          messageId: m.id,
          channel: m.channel,
          channelAccent: m.channelAccent,
          sender: m.senderName,
          ts: m.ts,
          isImage: IMAGE_EXT.includes(extOf(att.name))
        })
      }
    }
    return out
  }, [messages])

  const shown = kind === 'all'
    ? files
    : files.filter((f) => (kind === 'images' ? f.isImage : !f.isImage))

  const imageCount = files.filter((f) => f.isImage).length

  return (
    <section
      style={{
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
        ['--panel-accent']: 'var(--accent-plum-text)',
        ['--panel-tint']: 'var(--tint-plum)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        overflow: 'hidden'
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
        <span className="ms" style={{ fontSize: 20, color: 'var(--accent-plum-text)' }}>
          folder_open
        </span>
        <h3
          style={{
            fontSize: 'var(--text-xl)', fontWeight: 600,
            color: 'var(--accent-plum-text)', margin: 0, flex: 1,
            letterSpacing: '-0.01em'
          }}
        >
          Media
        </h3>
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
          {files.length === 0
            ? 'No files'
            : `${files.length} ${files.length === 1 ? 'file' : 'files'}`}
        </span>
      </header>

      {files.length === 0 ? (
        <p
          style={{
            margin: 0, padding: 'var(--space-5)',
            textAlign: 'center',
            fontSize: 'var(--text-md)', color: 'var(--text-muted)'
          }}
        >
          Nothing attached to this deal yet. Files sent or received on any
          channel appear here.
        </p>
      ) : (
        <>
          {/* Only offer the filter when there's a mix — two chips where every
              file is an image is a control that can't do anything. */}
          {imageCount > 0 && imageCount < files.length && (
            <div
              style={{
                display: 'flex', gap: 'var(--space-2)',
                padding: '10px var(--space-4)',
                borderBottom: '1px solid var(--border-default)'
              }}
            >
              {[
                ['all', 'All', files.length],
                ['images', 'Images', imageCount],
                ['docs', 'Documents', files.length - imageCount]
              ].map(([id, label, n]) => (
                <button
                  key={id}
                  onClick={() => setKind(id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer',
                    height: 30, padding: '0 12px',
                    border: kind === id
                      ? '1px solid var(--brand-primary)'
                      : '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-pill)',
                    background: kind === id ? 'var(--brand-primary)' : '#fff',
                    color: kind === id ? '#fff' : 'var(--text-body)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-base)', fontWeight: kind === id ? 600 : 400
                  }}
                >
                  {label}
                  <span style={{ opacity: 0.75 }}>{n}</span>
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)'
            }}
          >
            {shown.map((f, i) => (
              <FileCard
                key={`${f.messageId}-${f.name}-${i}`}
                file={f}
                onJump={() => onJumpToMessage && onJumpToMessage(f.messageId)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function FileCard({ file, onJump }) {
  const accent = `var(--accent-${file.channelAccent || 'gray'})`
  return (
    <button
      onClick={onJump}
      title={`${file.name || 'File'} — click to find it in the timeline`}
      style={{
        display: 'grid', gap: 'var(--space-2)',
        textAlign: 'left', cursor: 'pointer',
        padding: 'var(--space-3)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        background: '#fff',
        fontFamily: 'var(--font-sans)'
      }}
    >
      <span
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 76,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--gray-50)', color: accent
        }}
      >
        <span className="ms" style={{ fontSize: 30 }}>{iconFor(file)}</span>
      </span>

      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: 'var(--text-md)', fontWeight: 600,
            color: 'var(--text-heading)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}
        >
          {/* SMS and WhatsApp media arrive with no filename. A channel-derived
              label beats an empty line. */}
          {file.name || `${file.channel || 'File'} attachment`}
        </span>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
          {[file.sender, formatSize(file.sizeBytes)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}

function extOf(name) {
  return String(name || '').split('.').pop().toLowerCase()
}

function iconFor(file) {
  if (file.isImage) return 'image'
  const ext = extOf(file.name)
  if (ext === 'pdf') return 'picture_as_pdf'
  if (ext === 'dwg' || ext === 'dxf') return 'architecture'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'table_chart'
  if (['doc', 'docx'].includes(ext)) return 'description'
  if (['zip', 'rar', '7z'].includes(ext)) return 'folder_zip'
  return 'attach_file'
}

function formatSize(bytes) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
