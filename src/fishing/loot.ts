export type FishingCatchId =
  | 'fish'
  | 'shoe'
  | 'can'
  | 'crocodile'
  | 'shark'
  | 'car'
  | 'gun'
  | 'tire'

export type FishingCatch = {
  id: FishingCatchId
  label: string
  emoji: string
}

export const FISHING_CATCHES: FishingCatch[] = [
  { id: 'fish', label: 'ปลา', emoji: '🐟' },
  { id: 'shoe', label: 'รองเท้า', emoji: '👟' },
  { id: 'can', label: 'กระป๋อง', emoji: '🥫' },
  { id: 'crocodile', label: 'จระเข้', emoji: '🐊' },
  { id: 'shark', label: 'ฉลาม', emoji: '🦈' },
  { id: 'car', label: 'รถ', emoji: '🚗' },
  { id: 'gun', label: 'ปืน', emoji: '🔫' },
  { id: 'tire', label: 'ล้อยาง', emoji: '🛞' },
]

export const FISH_WAIT_MIN_MS = 3000
export const FISH_WAIT_MAX_MS = 10000
export const FISH_CATCH_SHOW_MS = 2000

export function randomFishingCatch(): FishingCatch {
  return FISHING_CATCHES[Math.floor(Math.random() * FISHING_CATCHES.length)]!
}

export function randomFishWaitMs(): number {
  return FISH_WAIT_MIN_MS + Math.random() * (FISH_WAIT_MAX_MS - FISH_WAIT_MIN_MS)
}
