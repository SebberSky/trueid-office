import './FishingCatch.css'
import type { FishingCatch } from '../fishing/loot'

interface Props {
  catchItem: FishingCatch | null
}

/** Center-screen catch reveal for the local fisher only. */
export function FishingCatchOverlay({ catchItem }: Props) {
  if (!catchItem) return null
  return (
    <div className="fish-catch" role="status" aria-live="polite">
      <div className="fish-catch__frame">
        <span className="fish-catch__emoji">{catchItem.emoji}</span>
        <strong className="fish-catch__label">{catchItem.label}</strong>
        <span className="fish-catch__sub">ตกได้!</span>
      </div>
    </div>
  )
}
