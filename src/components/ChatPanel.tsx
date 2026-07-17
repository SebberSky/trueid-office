import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatChannel, ChatMessage } from '../chat/types'
import './ChatPanel.css'

interface Props {
  channel: ChatChannel
  messages: ChatMessage[]
  enabled: boolean
  placeholder: string
  disabledHint?: string
  onSend: (text: string) => void
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

export function ChatPanel({
  channel,
  messages,
  enabled,
  placeholder,
  disabledHint,
  onSend,
  tools,
}: Props) {
  const [text, setText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, tools?.raisedHands])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!enabled || !text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <div className={`chat chat--${channel}`}>
      <div className="chat__head">
        <span className="chat__badge">{channel === 'global' ? 'Global' : 'Room WebRTC'}</span>
        <span className="chat__sub">
          {channel === 'global' ? 'ทั้งออฟฟิศ' : 'เฉพาะคนในห้อง'}
        </span>
      </div>

      {tools && tools.raisedHands.length > 0 && (
        <div className="chat__hands" title="คนที่ยกมือ">
          ✋ {tools.raisedHands.map((h) => h.name).join(', ')}
        </div>
      )}

      <div className="chat__list" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat__empty">
            {enabled ? 'ยังไม่มีข้อความ' : disabledHint || 'ไม่พร้อมใช้งาน'}
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.text.startsWith('✋') || m.text.startsWith('📊') ? 'chat__msg sys' : 'chat__msg'}
          >
            <strong>{m.fromName}</strong>
            <span>{m.text}</span>
            <time>
              {new Date(m.at).toLocaleTimeString('th-TH', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>
        ))}
      </div>

      {tools && (
        <div className="chat__tools">
          <button
            type="button"
            className={tools.handRaised ? 'tool on' : 'tool'}
            onClick={tools.onToggleHand}
            title={tools.handRaised ? 'ลงมือ' : 'ยกมือ'}
          >
            ✋ {tools.handRaised ? 'ลงมือ' : 'ยกมือ'}
          </button>
          <button type="button" className="tool" onClick={tools.onOpenPoll} title="Poll">
            📊 Poll
          </button>
          <div className="chat__emoji-wrap">
            <button
              type="button"
              className={emojiOpen ? 'tool on' : 'tool'}
              onClick={() => setEmojiOpen((v) => !v)}
              title="Emoji"
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
    </div>
  )
}
