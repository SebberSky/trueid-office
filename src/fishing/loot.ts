/** Weighted fishing loot — animals dominate; junk is uncommon; beer tower is rarest. */

export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'junk' | 'mythic'

export type FishingCatch = {
  id: string
  label: string
  emoji: string
  rarity: FishRarity
}

/** Relative drop weights — higher = more likely. */
const RARITY_WEIGHT: Record<FishRarity, number> = {
  common: 48,
  uncommon: 18,
  rare: 5,
  legendary: 1.2,
  junk: 48, // same tier as common (ธรรมดา)
  mythic: 0.15, // beer tower — lowest in the table
}

function a(
  id: string,
  label: string,
  emoji: string,
  rarity: Exclude<FishRarity, 'junk' | 'mythic'> = 'common',
): FishingCatch {
  return { id, label, emoji, rarity }
}

function junk(id: string, label: string, emoji: string): FishingCatch {
  return { id, label, emoji, rarity: 'junk' }
}

/** ~100 well-known aquatic creatures, ordered roughly by rarity tier. */
export const FISHING_ANIMALS: FishingCatch[] = [
  // —— Common (~common pond / market fish) ——
  a('goldfish', 'ปลาทอง', '🐠', 'common'),
  a('guppy', 'ปลาหางนกยูง', '🐟', 'common'),
  a('betta', 'ปลากัด', '🐟', 'common'),
  a('tilapia', 'ปลานิล', '🐟', 'common'),
  a('catfish', 'ปลาดุก', '🐟', 'common'),
  a('snakehead', 'ปลาช่อน', '🐟', 'common'),
  a('carp', 'ปลาคาร์ป', '🐟', 'common'),
  a('trout', 'ปลาเทราต์', '🐟', 'common'),
  a('sardine', 'ปลาซาร์ดีน', '🐟', 'common'),
  a('anchovy', 'ปลาแอนโชวี่', '🐟', 'common'),
  a('mackerel', 'ปลาแมกเคอเรล', '🐟', 'common'),
  a('herring', 'ปลาเฮอริ่ง', '🐟', 'common'),
  a('mackerel-scad', 'ปลาทู', '🐟', 'common'),
  a('silver-barb', 'ปลาตะเพียน', '🐟', 'common'),
  a('snakeskin-gourami', 'ปลาสลิด', '🐟', 'common'),
  a('climbing-perch', 'ปลากระดี่', '🐟', 'common'),
  a('mudfish', 'ปลากด', '🐟', 'common'),
  a('goby', 'ปลาบู่', '🐟', 'common'),
  a('rasbora', 'ปลาสร้อย', '🐟', 'common'),
  a('neon-tetra', 'ปลานีออน', '🐠', 'common'),
  a('clownfish', 'ปลาการ์ตูน', '🐠', 'common'),
  a('angelfish', 'ปลาเทวดา', '🐠', 'common'),
  a('discus', 'ปลาหมอสี', '🐠', 'common'),
  a('shrimp', 'กุ้ง', '🦐', 'common'),
  a('crab', 'ปู', '🦀', 'common'),
  a('squid', 'หมึกกล้วย', '🦑', 'common'),
  a('jellyfish', 'แมงกะพรุน', '🪼', 'common'),
  a('starfish', 'ดาวทะเล', '⭐', 'common'),
  a('sea-urchin', 'เม่นทะเล', '🟣', 'common'),
  a('clam', 'หอยลาย', '🐚', 'common'),
  a('mussel', 'หอยแมลงภู่', '🐚', 'common'),
  a('frog', 'กบ', '🐸', 'common'),
  a('tadpole', 'ลูกอ๊อด', '🫧', 'common'),
  a('pond-snail', 'หอยทากน้ำ', '🐌', 'common'),
  a('sea-cucumber', 'ปลิงทะเล', '🥒', 'common'),
  a('minnow', 'ปลาริ้ว', '🐟', 'common'),
  a('bass', 'ปลากะพง', '🐟', 'common'),
  a('perch', 'ปลาเพิร์ช', '🐟', 'common'),
  a('pike', 'ปลาไพค์', '🐟', 'common'),
  a('smelt', 'ปลาสเมลท์', '🐟', 'common'),
  a('whitebait', 'ปลากะตัก', '🐟', 'common'),
  a('mullet', 'ปลากระบอก', '🐟', 'common'),
  a('garfish', 'ปลากระโทงดาบเล็ก', '🐟', 'common'),
  a('halfbeak', 'ปลาเข็ม', '🐟', 'common'),
  a('glassfish', 'ปลาแก้ว', '🐟', 'common'),

  // —— Uncommon ——
  a('salmon', 'ปลาแซลมอน', '🍣', 'uncommon'),
  a('tuna', 'ปลาทูน่า', '🐟', 'uncommon'),
  a('sea-bass', 'ปลากะพงขาว', '🐟', 'uncommon'),
  a('grouper', 'ปลากะรัง', '🐟', 'uncommon'),
  a('snapper', 'ปลากะพงแดง', '🐟', 'uncommon'),
  a('cod', 'ปลาค็อด', '🐟', 'uncommon'),
  a('halibut', 'ปลาฮาลิบัต', '🐟', 'uncommon'),
  a('flounder', 'ปลาลิ้นหมา', '🐟', 'uncommon'),
  a('pufferfish', 'ปลาปักเป้า', '🐡', 'uncommon'),
  a('lionfish', 'ปลาสิงโต', '🦁', 'uncommon'),
  a('seahorse', 'ม้าน้ำ', '🦄', 'uncommon'),
  a('stingray', 'ปลากระเบน', '🦇', 'uncommon'),
  a('eel', 'ปลาไหล', '🐍', 'uncommon'),
  a('moray', 'ปลาไหลมอเรย์', '🐍', 'uncommon'),
  a('lobster', 'ล็อบสเตอร์', '🦞', 'uncommon'),
  a('prawn', 'กุ้งก้ามกราม', '🦐', 'uncommon'),
  a('mantis-shrimp', 'กั้ง', '🦐', 'uncommon'),
  a('hermit-crab', 'ปูเสฉวน', '🦀', 'uncommon'),
  a('blue-crab', 'ปูม้า', '🦀', 'uncommon'),
  a('oyster', 'หอยนางรม', '🦪', 'uncommon'),
  a('scallop', 'หอยเชลล์', '🐚', 'uncommon'),
  a('octopus', 'หมึกยักษ์', '🐙', 'uncommon'),
  a('cuttlefish', 'หมึกกระดอง', '🦑', 'uncommon'),
  a('turtle', 'เต่าน้ำ', '🐢', 'uncommon'),
  a('sea-turtle', 'เต่าทะเล', '🐢', 'uncommon'),
  a('newt', 'ซาลาแมนเดอร์น้ำ', '🦎', 'uncommon'),
  a('water-snake', 'งูน้ำ', '🐍', 'uncommon'),
  a('arowana', 'ปลาอโรวาน่า', '🐉', 'uncommon'),
  a('butterflyfish', 'ปลาผีเสื้อ', '🐠', 'uncommon'),
  a('parrotfish', 'ปลาแก้วมังกร', '🐠', 'uncommon'),
  a('surgeonfish', 'ปลาหมอทะเล', '🐠', 'uncommon'),
  a('barracuda', 'ปลากระโทงดาบ', '🐟', 'uncommon'),

  // —— Rare ——
  a('shark', 'ฉลาม', '🦈', 'rare'),
  a('hammerhead', 'ฉลามหัวค้อน', '🦈', 'rare'),
  a('tiger-shark', 'ฉลามเสือ', '🦈', 'rare'),
  a('dolphin', 'โลมา', '🐬', 'rare'),
  a('orca', 'วาฬเพชรฆาต', '🐋', 'rare'),
  a('seal', 'แมวน้ำ', '🦭', 'rare'),
  a('sea-lion', 'สิงโตทะเล', '🦭', 'rare'),
  a('penguin', 'เพนกวิน', '🐧', 'rare'),
  a('crocodile', 'จระเข้', '🐊', 'rare'),
  a('alligator', 'อัลลิเกเตอร์', '🐊', 'rare'),
  a('electric-eel', 'ปลาไหลไฟฟ้า', '⚡', 'rare'),
  a('swordfish', 'ปลากระโทงดาบยักษ์', '🗡️', 'rare'),
  a('marlin', 'ปลามาร์ลิน', '🐟', 'rare'),
  a('manta-ray', 'กระเบนราหู', '🦇', 'rare'),
  a('nautilus', 'นอติลุส', '🐚', 'rare'),
  a('horseshoe-crab', 'แมงดาทะเล', '🦠', 'rare'),
  a('giant-clam', 'หอยมือเสือ', '🐚', 'rare'),
  a('manatee', 'พะยูน', '🐋', 'rare'),
  a('otter', 'นากทะเล', '🦦', 'rare'),
  a('irrawaddy', 'โลมาอิรวดี', '🐬', 'rare'),

  // —— Legendary ——
  a('whale-shark', 'ฉลามวาฬ', '🦈', 'legendary'),
  a('great-white', 'ฉลามขาว', '🦈', 'legendary'),
  a('blue-whale', 'วาฬสีน้ำเงิน', '🐋', 'legendary'),
  a('humpback', 'วาฬหลังค่อม', '🐋', 'legendary'),
  a('giant-squid', 'หมึกยักษ์ลึก', '🦑', 'legendary'),
  a('mekong-giant', 'ปลาบึก', '🐟', 'legendary'),
  a('coelacanth', 'ปลาซีลาแคนท์', '🦕', 'legendary'),
  a('kraken', 'คราเคน', '🦑', 'legendary'),
]

export const FISHING_JUNK: FishingCatch[] = [
  junk('shoe', 'รองเท้า', '👟'),
  junk('can', 'กระป๋อง', '🥫'),
  junk('tire', 'ล้อยาง', '🛞'),
  junk('bottle', 'ขวดพลาสติก', '🍾'),
  junk('boot', 'รองเท้าบูท', '🥾'),
  junk('bag', 'ถุงพลาสติก', '🛍️'),
  junk('phone', 'มือถือเปียก', '📱'),
  junk('car', 'รถ', '🚗'),
  junk('gun', 'ปืน', '🔫'),
]

/** Rarest catch in the game. */
export const FISHING_MYTHIC: FishingCatch = {
  id: 'beer-tower',
  label: 'เบียร์ 1 ทาวเวอร์',
  emoji: '🍺',
  rarity: 'mythic',
}

export const FISHING_CATCHES: FishingCatch[] = [
  ...FISHING_ANIMALS,
  ...FISHING_JUNK,
  FISHING_MYTHIC,
]

export const FISH_WAIT_MIN_MS = 3000
export const FISH_WAIT_MAX_MS = 10000
export const FISH_CATCH_SHOW_MS = 2000

function weightOf(item: FishingCatch): number {
  return RARITY_WEIGHT[item.rarity]
}

/** Pick a catch by rarity weight (animals ≫ junk ≫ beer tower). */
export function randomFishingCatch(): FishingCatch {
  let total = 0
  for (const item of FISHING_CATCHES) total += weightOf(item)
  let roll = Math.random() * total
  for (const item of FISHING_CATCHES) {
    roll -= weightOf(item)
    if (roll <= 0) return item
  }
  return FISHING_CATCHES[FISHING_CATCHES.length - 1]!
}

export function randomFishWaitMs(): number {
  return FISH_WAIT_MIN_MS + Math.random() * (FISH_WAIT_MAX_MS - FISH_WAIT_MIN_MS)
}

/** Approx drop % for UI / debug — sums to ~100. */
export function fishingDropRates(): { rarity: FishRarity; count: number; pct: number }[] {
  let total = 0
  const byRarity = new Map<FishRarity, number>()
  for (const item of FISHING_CATCHES) {
    const w = weightOf(item)
    total += w
    byRarity.set(item.rarity, (byRarity.get(item.rarity) ?? 0) + w)
  }
  return (['common', 'uncommon', 'rare', 'legendary', 'junk', 'mythic'] as FishRarity[]).map(
    (rarity) => ({
      rarity,
      count: FISHING_CATCHES.filter((c) => c.rarity === rarity).length,
      pct: total > 0 ? ((byRarity.get(rarity) ?? 0) / total) * 100 : 0,
    }),
  )
}
