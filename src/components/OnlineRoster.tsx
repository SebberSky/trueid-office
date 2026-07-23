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
  /** Unread DM count from this person. */
  dmUnread?: number
}

interface Props {
  open: boolean
  title: string
  people: RosterPerson[]
  onClose: () => void
  /** Anchor element for click-outside (optional). */
  anchorRef?: RefObject<HTMLElement | null>
  /** Start a private chat (server roster). */
  onStartDm?: (person: RosterPerson) => void
  /** Warp / teleport next to this person. */
  onWarp?: (person: RosterPerson) => void
}

export function OnlineRoster({
  open,
  title,
  people,
  onClose,
  anchorRef,
  onStartDm,
  onWarp,
}: Props) {
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
              <div className="roster__row">
                <div className="roster__info">
                  <div className="roster__name">
                    <span>{p.name}</span>
                    {p.isSelf && <em>คุณ</em>}
                  </div>
                  <div className="roster__meta">
                    {p.roomLabel ? <span className="roster__room">{p.roomLabel}</span> : null}
                    {p.voiceOn ? <span title="ไมค์เปิด">🎙</span> : null}
                    {p.sharing ? <span title="กำลังแชร์จอ">🖥</span> : null}
                  </div>
                </div>
                {!p.isSelf && (onWarp || onStartDm) && (
                  <div className="roster__actions">
                    {onWarp && (
                      <button
                        type="button"
                        className="roster__warp"
                        title={`วาปไปหา ${p.name}`}
                        aria-label={`วาปไปหา ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onWarp(p)
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z"
                          />
                        </svg>
                      </button>
                    )}
                    {onStartDm && (
                      <button
                        type="button"
                        className="roster__dm"
                        title={`แชทส่วนตัวกับ ${p.name}`}
                        aria-label={`แชทส่วนตัวกับ ${p.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onStartDm(p)
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"
                          />
                        </svg>
                        {(p.dmUnread ?? 0) > 0 && (
                          <span className="roster__dm-badge">
                            {p.dmUnread! > 9 ? '9+' : p.dmUnread}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
