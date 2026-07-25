import { describe, expect, it } from 'vitest'
import type { NpcPresence } from '../types'
import { generateWorld, pixelCenter } from './terrain'
import { findAdjacentWarpDestination } from './warp'

function janitor(warpEnabled: boolean): NpcPresence {
  const point = pixelCenter(42, 26)
  return {
    kind: 'npc',
    id: 'npc:janitor-gossip',
    npcKey: 'janitor-gossip',
    warpEnabled,
    behavior: 'idle',
    look: {
      species: 'female',
      animalKind: 'cat',
      displayName: 'แม่บ้าน',
      hairStyle: 'bun',
      hairColor: '#321',
      skinColor: '#b98',
      furColor: '#aaa',
      topStyle: 'vest',
      topColor: '#465',
      bottomStyle: 'pants',
      bottomColor: '#333',
    },
    x: point.x,
    y: point.y,
    facing: 'down',
    roomId: 'plaza-main',
    voiceOn: false,
    sharing: false,
    updatedAt: 1,
  }
}

describe('findAdjacentWarpDestination', () => {
  const map = generateWorld(20260717)
  const current = pixelCenter(map.spawn.x, map.spawn.y)

  it('returns a walkable adjacent destination when warp is enabled', () => {
    const target = janitor(true)
    const result = findAdjacentWarpDestination({
      map,
      target,
      current,
      peers: [target],
      lockedRoomIds: new Set(),
      canFly: false,
    })

    expect(result).not.toBeNull()
    expect(Math.hypot(result!.x - target.x, result!.y - target.y)).toBeGreaterThan(0)
  })

  it('refuses warp when the NPC flag is disabled', () => {
    const target = janitor(false)
    expect(
      findAdjacentWarpDestination({
        map,
        target,
        current,
        peers: [target],
        lockedRoomIds: new Set(),
        canFly: false,
      }),
    ).toBeNull()
  })

  it('refuses to enter a locked destination room', () => {
    const target = janitor(true)
    expect(
      findAdjacentWarpDestination({
        map,
        target,
        current: pixelCenter(10, 34),
        peers: [target],
        lockedRoomIds: new Set(['plaza-main']),
        canFly: false,
      }),
    ).toBeNull()
  })
})
