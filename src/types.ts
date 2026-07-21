export type Species = 'male' | 'female' | 'animal'

/** Each kind has a unique silhouette + walk gait (no duplicates). */
export type AnimalKind =
  | 'cat' // feline pad
  | 'dog' // canine trot
  | 'bunny' // hop
  | 'bird' // flies while moving / over water
  | 'worm' // undulate
  | 'snake' // slither
  | 'dragon' // walks on land, flies over water, breathes fire (E)
  | 'yoda' // tiny shuffle

export const ANIMAL_KIND_LABELS: Record<AnimalKind, string> = {
  cat: 'แมว',
  dog: 'หมา',
  bunny: 'กระต่าย',
  bird: 'นก',
  worm: 'หนอน',
  snake: 'งู',
  dragon: 'มังกร',
  yoda: 'Yoda',
}

export const ANIMAL_KINDS = Object.keys(ANIMAL_KIND_LABELS) as AnimalKind[]

/** Migrate legacy saved looks (e.g. fox → bird). */
export function normalizeAnimalKind(kind: string | undefined): AnimalKind {
  if (kind === 'fox') return 'bird'
  if (
    kind === 'amongUs' ||
    kind === 'mechaChameleon' ||
    kind === 'darthVader' ||
    kind === 'superman' ||
    kind === 'batman' ||
    kind === 'spiderman'
  ) {
    return 'yoda'
  }
  if (kind && kind in ANIMAL_KIND_LABELS) return kind as AnimalKind
  return 'cat'
}

/** Birds and dragons can traverse water tiles by flying. */
export function canFlyOverWater(look: CharacterLook): boolean {
  if (look.species !== 'animal') return false
  const kind = normalizeAnimalKind(look.animalKind)
  return kind === 'bird' || kind === 'dragon'
}

export type HairStyle = 'short' | 'medium' | 'long' | 'spiky' | 'bun' | 'bald'

export type TopStyle = 'tee' | 'shirt' | 'hoodie' | 'vest'

export type BottomStyle = 'pants' | 'shorts' | 'skirt'

export interface CharacterLook {
  species: Species
  animalKind: AnimalKind
  displayName: string
  hairStyle: HairStyle
  hairColor: string
  skinColor: string
  furColor: string
  topStyle: TopStyle
  topColor: string
  bottomStyle: BottomStyle
  bottomColor: string
}

export interface UserSession {
  id: string
  email: string
  look: CharacterLook
}

export type TerrainType =
  | 'grass'
  | 'path'
  | 'floor'
  | 'water'
  | 'rock'
  | 'wall'
  | 'sand'
  | 'desk'
  | 'plant'
  | 'plaza'
  | 'plazaBorder'

export type SpaceKind = 'room' | 'plaza'

export interface RoomDef {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** 0 = unlimited (plaza) */
  capacity: number
  color: string
  door: 'n' | 's' | 'e' | 'w'
  kind: SpaceKind
}

export type DoorSide = RoomDef['door']

export interface PeerPresence {
  id: string
  email: string
  look: CharacterLook
  x: number
  y: number
  facing: Facing
  roomId: string | null
  voiceOn: boolean
  sharing: boolean
  /** Timestamp of last jump start — remotes replay the hop when this changes. */
  jumpAt?: number
  /** Timestamp of last dragon fire breath — remotes replay the VFX when this changes. */
  fireAt?: number
  updatedAt: number
}

export type Facing = 'down' | 'up' | 'left' | 'right'

export type AppScreen = 'login' | 'creator' | 'world'
