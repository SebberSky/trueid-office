import type { CharacterLook, Facing } from '../../src/types'
import type { InteractConfig } from './interact/types'

export type NpcWaypoint = { x: number; y: number }

export type NpcBehavior =
  | { type: 'idle' }
  | { type: 'patrol'; waypoints: NpcWaypoint[]; speedTilesPerSecond?: number }

export type NpcScript = {
  npcKey: string
  look: CharacterLook
  spawn: NpcWaypoint
  facing: Facing
  roomId?: string | null
  warpEnabled: boolean
  /** Soft tags for routing / filtering (e.g. 'gossip'). */
  tags?: string[]
  behavior: NpcBehavior
  /** When set, players may start a talk session with this NPC. */
  interact?: InteractConfig
}

type NpcLookInput = Partial<CharacterLook> & { displayName: string }

type NpcScriptInput = Omit<NpcScript, 'look' | 'facing' | 'warpEnabled' | 'behavior'> & {
  look: NpcLookInput
  facing?: Facing
  warpEnabled?: boolean
  behavior?: NpcBehavior
}

const BASE_LOOK: CharacterLook = {
  species: 'female',
  animalKind: 'cat',
  displayName: 'NPC',
  hairStyle: 'short',
  hairColor: '#2f2620',
  skinColor: '#c98f65',
  furColor: '#9ca3af',
  topStyle: 'tee',
  topColor: '#475569',
  bottomStyle: 'pants',
  bottomColor: '#374151',
}

/** Keeps each script short — only spell out what differs from the base look. */
export function npcLook(overrides: NpcLookInput): CharacterLook {
  return { ...BASE_LOOK, ...overrides }
}

/** Defaults: stands still, faces the camera, warp allowed. */
export function defineNpc(input: NpcScriptInput): NpcScript {
  return {
    ...input,
    look: npcLook(input.look),
    facing: input.facing ?? 'down',
    warpEnabled: input.warpEnabled ?? true,
    behavior: input.behavior ?? { type: 'idle' },
  }
}
