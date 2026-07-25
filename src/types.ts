export type Species = 'male' | 'female' | 'animal'

/** Each kind has a unique silhouette + walk gait (no duplicates). */
export type AnimalKind =
  | 'cat' // feline pad
  | 'dog' // canine trot
  | 'bunny' // hop
  | 'bird' // flies while moving / over water
  | 'worm' // undulate
  | 'snake' // slither, spits poison (E)
  | 'dragon' // walks on land, flies over water, breathes fire (E)
  | 'godzilla' // bipedal kaiju, bites (E)
  | 'yoda' // tiny shuffle

export const ANIMAL_KIND_LABELS: Record<AnimalKind, string> = {
  cat: 'แมว',
  dog: 'หมา',
  bunny: 'กระต่าย',
  bird: 'นก',
  worm: 'หนอน',
  snake: 'งู',
  dragon: 'มังกร',
  godzilla: 'ก้อตซิลล่า',
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

export type Facing = 'down' | 'up' | 'left' | 'right'

/** Shared runtime body — everything a character can be/do on the map. */
export interface ActorPresenceBase {
  id: string
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
  /** Timestamp of last snake poison spit — remotes replay the VFX when this changes. */
  spitAt?: number
  /** Timestamp of last Godzilla bite — remotes replay the VFX when this changes. */
  biteAt?: number
  /** Timestamp of last human tray slap — remotes replay the VFX when this changes. */
  slapAt?: number
  /** Timestamp of last cat/dog cry (E) — remotes replay bark/meow when this changes. */
  cryAt?: number
  /** Holding crouch (Ctrl) — remotes mirror the squat pose. */
  crouching?: boolean
  /** Pond bobber target while fishing; omit when not casting. */
  fishX?: number
  fishY?: number
  updatedAt: number
}

export interface UserPresence extends ActorPresenceBase {
  kind: 'user'
  email: string
}

export interface NpcPresence extends ActorPresenceBase {
  kind: 'npc'
  /** Stable NPC identity for later phases (role, script, interact). */
  npcKey: string
  /** Whether clients may offer warp-to-NPC for this actor. */
  warpEnabled: boolean
  /** Current script motion mode, exposed for the NPC directory UI. */
  behavior: 'idle' | 'patrol'
}

export type ActorPresence = UserPresence | NpcPresence

/**
 * Compact NPC movement delta. Identity and `look` arrive once via `welcome`,
 * so recurring server ticks only carry pose — this keeps bandwidth flat as the
 * NPC population grows.
 */
export interface NpcPoseUpdate {
  id: string
  x: number
  y: number
  facing: Facing
  roomId: string | null
  updatedAt: number
}

/** @deprecated Prefer ActorPresence — alias kept for gradual migration. */
export type PeerPresence = ActorPresence

/** Loose wire shape (older clients may omit `kind`). */
export type WireActorPresence = ActorPresenceBase & {
  kind?: 'user' | 'npc'
  email?: string
  npcKey?: string
  warpEnabled?: boolean
  behavior?: 'idle' | 'patrol'
}

export function isUserPresence(p: ActorPresence): p is UserPresence {
  return p.kind === 'user'
}

export function isNpcPresence(p: ActorPresence): p is NpcPresence {
  return p.kind === 'npc'
}

/** Display label — never assumes email exists (NPCs have none). */
export function actorLabel(p: ActorPresenceBase & { email?: string }): string {
  const name = p.look?.displayName?.trim()
  if (name) return name
  if (p.email?.trim()) return p.email.trim()
  return p.id
}

/** Normalize inbound presence: missing `kind` → user (same-deploy safety). */
export function normalizeActorPresence(raw: WireActorPresence): ActorPresence {
  const base: ActorPresenceBase = {
    id: raw.id,
    look: raw.look,
    x: raw.x,
    y: raw.y,
    facing: raw.facing,
    roomId: raw.roomId,
    voiceOn: !!raw.voiceOn,
    sharing: !!raw.sharing,
    jumpAt: raw.jumpAt,
    fireAt: raw.fireAt,
    spitAt: raw.spitAt,
    biteAt: raw.biteAt,
    slapAt: raw.slapAt,
    cryAt: raw.cryAt,
    crouching: raw.crouching,
    fishX: raw.fishX,
    fishY: raw.fishY,
    updatedAt: raw.updatedAt,
  }
  if (raw.kind === 'npc') {
    return {
      ...base,
      kind: 'npc',
      npcKey: (raw.npcKey || raw.id || 'npc').trim() || 'npc',
      warpEnabled: raw.warpEnabled === true,
      behavior: raw.behavior === 'patrol' ? 'patrol' : 'idle',
    }
  }
  return {
    ...base,
    kind: 'user',
    email: (raw.email || '').trim().toLowerCase(),
  }
}

export type AppScreen = 'login' | 'creator' | 'world'
