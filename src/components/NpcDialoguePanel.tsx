import { useEffect, useRef } from 'react'
import './NpcDialoguePanel.css'

export type NpcDialogueChoice = {
  id: string
  label: string
  responseMode?: 'immediate' | 'async'
  loadingLabel?: string
}

const DEFAULT_LOADING_LABEL = 'กำลังตอบ…'

type Props = {
  open: boolean
  npcName: string
  text: string
  choices: NpcDialogueChoice[]
  streaming?: boolean
  pendingChoiceId?: string | null
  onChoose: (optionId: string) => void
  onClose: () => void
}

/** Ragnarok-style bottom dialogue panel (private 1:1). */
export function NpcDialoguePanel({
  open,
  npcName,
  text,
  choices,
  streaming = false,
  pendingChoiceId = null,
  onChoose,
  onClose,
}: Props) {
  const textRef = useRef<HTMLParagraphElement>(null)

  // Streaming: follow the newest line. New static node: start at the top.
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.scrollTop = streaming ? el.scrollHeight : 0
  }, [text, streaming])

  if (!open) return null

  return (
    <div className="npc-dialogue" role="dialog" aria-label={`คุยกับ ${npcName}`}>
      <div className="npc-dialogue__chrome">
        <div className="npc-dialogue__head">
          <strong>{npcName}</strong>
          <button type="button" className="npc-dialogue__close" onClick={onClose} aria-label="ปิด">
            Esc
          </button>
        </div>
        <p className="npc-dialogue__text" ref={textRef}>
          {text}
          {streaming ? <span className="npc-dialogue__cursor" aria-hidden="true" /> : null}
        </p>
        {choices.length > 0 ? (
          <ul className="npc-dialogue__choices">
            {choices.map((choice, index) => (
              <li key={choice.id}>
                <button
                  type="button"
                  disabled={pendingChoiceId !== null}
                  onClick={() => onChoose(choice.id)}
                >
                  <span className="npc-dialogue__idx">{index + 1}.</span>
                  {choice.label}
                  {pendingChoiceId === choice.id ? (
                    <span className="npc-dialogue__choice-loading">
                      {choice.loadingLabel ?? DEFAULT_LOADING_LABEL}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="npc-dialogue__hint">กด Esc เพื่อปิด</p>
        )}
      </div>
    </div>
  )
}
