import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { NpcPresence } from '../types'
import { actorLabel } from '../types'
import './NpcPanel.css'

type Props = {
  open: boolean
  npcs: NpcPresence[]
  onClose: () => void
  onWarp: (npc: NpcPresence) => void
  anchorRef?: RefObject<HTMLElement | null>
}

export function NpcPanel({ open, npcs, onClose, onWarp, anchorRef }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchorRef?.current?.contains(target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div className="npc-panel" ref={panelRef} role="dialog" aria-label="NPC ในแผนที่">
      <div className="npc-panel__head">
        <strong>NPC ในแผนที่</strong>
        <span>{npcs.length}</span>
        <button type="button" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <ul className="npc-panel__list">
        {npcs.map((npc) => (
          <li key={npc.npcKey}>
            <span className="npc-panel__dot" aria-hidden="true" />
            <div>
              <strong>{actorLabel(npc)}</strong>
              <small>{npc.behavior === 'patrol' ? 'กำลังเดินตรวจพื้นที่' : 'อยู่ประจำจุด'}</small>
            </div>
            <button
              type="button"
              className="npc-panel__warp"
              disabled={!npc.warpEnabled}
              title={npc.warpEnabled ? `วาปไปหา ${actorLabel(npc)}` : 'NPC นี้ไม่อนุญาตให้วาป'}
              onClick={() => {
                if (npc.warpEnabled) onWarp(npc)
              }}
            >
              {npc.warpEnabled ? 'วาป' : 'วาปไม่ได้'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
