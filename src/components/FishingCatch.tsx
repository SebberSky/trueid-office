import './FishingCatch.css'
import type { FishRarity, FishingCatch } from '../fishing/loot'

interface Props {
  catchItem: FishingCatch | null
}

const RARITY_LABEL: Record<FishRarity, string> = {
  common: 'ธรรมดา',
  uncommon: 'พบได้บ้าง',
  rare: 'หายาก',
  legendary: 'ตำนาน',
  junk: 'ธรรมดา',
  mythic: 'สุดหายาก!!!',
}

/** Center-screen catch reveal for the local fisher only. */
export function FishingCatchOverlay({ catchItem }: Props) {
  if (!catchItem) return null
  return (
    <div className={`fish-catch rarity-${catchItem.rarity}`} role="status" aria-live="polite">
      <div className="fish-catch__frame">
        <span className="fish-catch__rarity">{RARITY_LABEL[catchItem.rarity]}</span>
        <span className="fish-catch__emoji">{catchItem.emoji}</span>
        <strong className="fish-catch__label">{catchItem.label}</strong>
        <span className="fish-catch__sub">ตกได้!</span>
      </div>
    </div>
  )
}
