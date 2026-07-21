import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import './OnlineRoster.css'

export type RosterPerson = {
  id: string
  name: string
  roomLabel?: string | null
  voiceOn?: boolean
  sharing?: boolean
  isSelf?: boolean
}

interface Props {
  open: boolean
  title: string
  people: RosterPerson[]
  onClose: () => void
  /** Anchor element for click-outside (optional). */
  anchorRef?: RefObject<HTMLElement | null>
}

export function OnlineRoster({ open, title, people, onClose, anchorRef }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPtr = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef?.current?.contains(t)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPtr)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPtr)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div className="roster" ref={panelRef} role="dialog" aria-label={title}>
      <div className="roster__head">
        <strong>{title}</strong>
        <span className="roster__count">{people.length}</span>
        <button type="button" className="roster__close" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      {people.length === 0 ? (
        <p className="roster__empty">ยังไม่มีใคร</p>
      ) : (
        <ul className="roster__list">
          {people.map((p) => (
            <li key={p.id} className={p.isSelf ? 'is-self' : undefined}>
              <div className="roster__name">
                <span>{p.name}</span>
                {p.isSelf && <em>คุณ</em>}
              </div>
              <div className="roster__meta">
                {p.roomLabel ? <span className="roster__room">{p.roomLabel}</span> : null}
                {p.voiceOn ? <span title="ไมค์เปิด">🎙</span> : null}
                {p.sharing ? <span title="กำลังแชร์จอ">🖥</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
