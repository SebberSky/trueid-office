import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatChannel, ChatMessage, PinnedMessage } from '../chat/types'
import { linkifyText } from '../chat/linkify'
import './ChatPanel.css'

interface Props {
  channel: ChatChannel
  messages: ChatMessage[]
  enabled: boolean
  placeholder: string
  disabledHint?: string
  onSend: (text: string) => void
  /** Collapse to a one-line latest-message preview (global chat in-room). */
  collapsed?: boolean
  /** Show chevron to expand/collapse. */
  onToggleCollapse?: () => void
  /** Room pin (one per room). */
  pinned?: PinnedMessage | null
  onPinMessage?: (message: ChatMessage) => void
  onUnpin?: () => void
  /** Room tools */
  tools?: {
    handRaised: boolean
    raisedHands: { id: string; name: string }[]
    onToggleHand: () => void
    onOpenPoll: () => void
    onEmoji: (emoji: string) => void
    emojis: string[]
  }
}

function isSysMessage(m: ChatMessage) {
  return m.fromId === 'system' || m.text.startsWith('✋') || m.text.startsWith('📊') || m.text.startsWith('📌')
}

export function ChatPanel({
  channel,
  messages,
  enabled,
  placeholder,
  disabledHint,
  onSend,
  collapsed = false,
  onToggleCollapse,
  pinned,
  onPinMessage,
  onUnpin,
  tools,
}: Props) {
  const [text, setText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const canPin = channel === 'room' && !!onPinMessage && !!onUnpin
  const latest = messages.length > 0 ? messages[messages.length - 1]! : null

  useEffect(() => {
    if (collapsed) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, tools?.raisedHands, pinned?.messageId, collapsed])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!enabled || !text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <div
      className={[
        'chat',
        `chat--${channel}`,
        collapsed ? 'is-collapsed' : '',
        onToggleCollapse ? 'is-collapsible' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="chat__head">
        <span className="chat__badge">{channel === 'global' ? 'Global' : 'Room WebRTC'}</span>
        {!collapsed && (
          <span className="chat__sub">
            {channel === 'global' ? 'ทั้งออฟฟิศ' : 'เฉพาะคนในห้อง'}
          </span>
        )}
        {collapsed && (
          <p className="chat__preview" title={latest ? `${latest.fromName}: ${latest.text}` : undefined}>
            {latest ? (
              <>
                <strong>{latest.fromName}</strong>
                <span>{latest.text}</span>
              </>
            ) : (
              <span className="chat__preview-empty">ยังไม่มีข้อความ</span>
            )}
          </p>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            className="chat__chevron"
            onClick={onToggleCollapse}
            title={collapsed ? 'ขยาย Global chat' : 'หุบ Global chat'}
            aria-label={collapsed ? 'ขยาย Global chat' : 'หุบ Global chat'}
            aria-expanded={!collapsed}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              {collapsed ? (
                <path
                  fill="currentColor"
                  d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"
                />
              ) : (
                <path
                  fill="currentColor"
                  d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"
                />
              )}
            </svg>
          </button>
        )}
      </div>

      {!collapsed && pinned && (
        <div className="chat__pin">
          <div className="chat__pin-body">
            <span className="chat__pin-label">📌 ปักหมุด</span>
            <strong>{pinned.fromName}</strong>
            <span className="chat__pin-text">{linkifyText(pinned.text)}</span>
            <span className="chat__pin-by">โดย {pinned.pinnedByName}</span>
          </div>
          {canPin && (
            <button type="button" className="chat__pin-unpin" onClick={onUnpin} title="เลิกปักหมุด">
              เลิกปัก
            </button>
          )}
        </div>
      )}

      {!collapsed && tools && tools.raisedHands.length > 0 && (
        <div className="chat__hands" title="คนที่ยกมือ">
          ✋ {tools.raisedHands.map((h) => h.name).join(', ')}
        </div>
      )}

      {!collapsed && (
        <div className="chat__list" ref={listRef}>
          {messages.length === 0 && (
            <p className="chat__empty">
              {enabled ? 'ยังไม่มีข้อความ' : disabledHint || 'ไม่พร้อมใช้งาน'}
            </p>
          )}
          {messages.map((m) => {
            const sys = isSysMessage(m)
            const isPinned = pinned?.messageId === m.id
            return (
              <div
                key={m.id}
                className={[
                  'chat__msg',
                  sys ? 'sys' : '',
                  isPinned ? 'is-pinned' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <strong>{m.fromName}</strong>
                <span>{linkifyText(m.text)}</span>
                <time>
                  {new Date(m.at).toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                {canPin && !sys && (
                  <button
                    type="button"
                    className={isPinned ? 'chat__msg-pin on' : 'chat__msg-pin'}
                    title={isPinned ? 'เลิกปักหมุด' : 'ปักหมุดข้อความนี้'}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (isPinned) onUnpin?.()
                      else onPinMessage?.(m)
                    }}
                  >
                    📌
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!collapsed && tools && (
        <div className="chat__tools">
          <button
            type="button"
            className={tools.handRaised ? 'tool on' : 'tool'}
            onClick={tools.onToggleHand}
            title={tools.handRaised ? 'ลงมือ' : 'ยกมือ'}
            aria-label={tools.handRaised ? 'ลงมือ' : 'ยกมือ'}
          >
            ✋
          </button>
          <button
            type="button"
            className="tool"
            onClick={tools.onOpenPoll}
            title="Poll"
            aria-label="Poll"
          >
            📊
          </button>
          <div className="chat__emoji-wrap">
            <button
              type="button"
              className={emojiOpen ? 'tool on' : 'tool'}
              onClick={() => setEmojiOpen((v) => !v)}
              title="Emoji"
              aria-label="Emoji"
            >
              😊
            </button>
            {emojiOpen && (
              <div className="chat__emoji-pop">
                {tools.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      tools.onEmoji(e)
                      setEmojiOpen(false)
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!collapsed && (
        <form className="chat__form" onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={enabled ? placeholder : disabledHint || placeholder}
            disabled={!enabled}
            maxLength={280}
          />
          <button type="submit" disabled={!enabled || !text.trim()}>
            ส่ง
          </button>
        </form>
      )}
    </div>
  )
}
