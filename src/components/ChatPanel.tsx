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
  /** Mute public (global/room) chat alert sound. */
  alertMuted?: boolean
  onToggleAlertMute?: () => void
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
  alertMuted = false,
  onToggleAlertMute,
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
        {onToggleAlertMute || onToggleCollapse ? (
          <div className="chat__head-actions">
            {onToggleAlertMute && (
              <button
                type="button"
                className={`chat__mute${alertMuted ? ' is-muted' : ''}`}
                onClick={onToggleAlertMute}
                title={
                  alertMuted
                    ? 'เปิดเสียงแจ้งเตือน Global/Room'
                    : 'ปิดเสียงแจ้งเตือน Global/Room'
                }
                aria-label={
                  alertMuted
                    ? 'เปิดเสียงแจ้งเตือน Global/Room'
                    : 'ปิดเสียงแจ้งเตือน Global/Room'
                }
                aria-pressed={alertMuted}
              >
                {alertMuted ? (
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                    />
                  </svg>
                )}
              </button>
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
        ) : null}
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
