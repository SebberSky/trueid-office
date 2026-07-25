import './NpcDialoguePanel.css'

export type NpcDialogueChoice = { id: string; label: string }

type Props = {
  open: boolean
  npcName: string
  text: string
  choices: NpcDialogueChoice[]
  streaming?: boolean
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
  onChoose,
  onClose,
}: Props) {
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
        <p className="npc-dialogue__text">
          {text}
          {streaming ? <span className="npc-dialogue__cursor" aria-hidden="true" /> : null}
        </p>
        {choices.length > 0 ? (
          <ul className="npc-dialogue__choices">
            {choices.map((choice, index) => (
              <li key={choice.id}>
                <button type="button" onClick={() => onChoose(choice.id)}>
                  <span className="npc-dialogue__idx">{index + 1}.</span>
                  {choice.label}
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
