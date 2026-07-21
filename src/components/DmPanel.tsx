import { useEffect, useRef, useState, type FormEvent } from 'react'
import { linkifyText } from '../chat/linkify'
import type { DmMessage } from '../chat/types'
import './DmPanel.css'

interface Props {
  peerName: string
  messages: DmMessage[]
  selfId: string
  onSend: (text: string) => void
  onClose: () => void
}

export function DmPanel({ peerName, messages, selfId, onSend, onClose }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <div className="dm" role="dialog" aria-label={`แชทกับ ${peerName}`}>
      <div className="dm__head">
        <div className="dm__title">
          <span className="dm__badge">DM</span>
          <strong>{peerName}</strong>
        </div>
        <button type="button" className="dm__close" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <p className="dm__hint">ประวัติเก็บในคุกกี้เครื่องคุณ · หมดอายุ 24 ชม.</p>
      <div className="dm__list" ref={listRef}>
        {messages.length === 0 && <p className="dm__empty">เริ่มคุยกันได้เลย</p>}
        {messages.map((m) => {
          const mine = m.fromId === selfId
          return (
            <div key={m.id} className={mine ? 'dm__msg is-mine' : 'dm__msg'}>
              {!mine && <strong>{m.fromName}</strong>}
              <span>{linkifyText(m.text)}</span>
              <time>
                {new Date(m.at).toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          )
        })}
      </div>
      <form className="dm__form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`ข้อความถึง ${peerName}…`}
          maxLength={280}
          autoFocus
        />
        <button type="submit" disabled={!text.trim()}>
          ส่ง
        </button>
      </form>
    </div>
  )
}
