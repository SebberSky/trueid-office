import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/terrain'
import { normalizeActorPresence, type WireActorPresence } from '../../src/types'
import { NpcRuntime } from './runtime'
import { defineNpc, type NpcScript } from './registry'

const map = generateWorld(20260717)

describe('NpcRuntime', () => {
  it('creates the janitor muted on plaza-main with warp enabled', () => {
    const runtime = new NpcRuntime(map, undefined, undefined, 1_000)
    const janitor = runtime.snapshot().find((peer) => peer.npcKey === 'janitor-gossip')

    expect(janitor).toMatchObject({
      kind: 'npc',
      id: 'npc:janitor-gossip',
      roomId: 'plaza-main',
      voiceOn: false,
      sharing: false,
      warpEnabled: true,
      behavior: 'idle',
    })
    expect(janitor?.look.displayName).toBe('แม่บ้าน')
  })

  it('keeps idle NPCs fixed and advances patrol NPCs', () => {
    const runtime = new NpcRuntime(map, undefined, undefined, 1_000)
    const guardBefore = runtime.snapshot().find((peer) => peer.npcKey === 'campus-guard')!

    runtime.tick(2_000)
    const updates = runtime.tick(3_000)
    const after = runtime.snapshot()
    const janitorAfter = after.find((peer) => peer.npcKey === 'janitor-gossip')!
    const guardAfter = after.find((peer) => peer.npcKey === 'campus-guard')!

    expect(guardAfter.x).toBeGreaterThan(guardBefore.x)
    expect(updates.map((pose) => pose.id)).toContain('npc:campus-guard')
    // Idle NPCs must never enter the delta stream.
    expect(updates.map((pose) => pose.id)).not.toContain('npc:janitor-gossip')
    expect(janitorAfter.updatedAt).toBe(1_000)
  })

  it('emits nothing when every NPC is idle, regardless of population', () => {
    const scripts: NpcScript[] = Array.from({ length: 250 }, (_, index) =>
      defineNpc({
        npcKey: `idle-${index}`,
        look: { displayName: `Idle ${index}` },
        spawn: { x: 42, y: 26 },
      }),
    )
    const runtime = new NpcRuntime(map, scripts, undefined, 1_000)

    expect(runtime.size).toBe(250)
    expect(runtime.tick(1_500)).toEqual([])
    expect(runtime.tick(2_000)).toEqual([])
  })

  it('only reports NPCs that actually moved', () => {
    const scripts: NpcScript[] = [
      defineNpc({
        npcKey: 'walker',
        look: { displayName: 'Walker' },
        spawn: { x: 25, y: 34 },
        behavior: {
          type: 'patrol',
          waypoints: [
            { x: 25, y: 34 },
            { x: 31, y: 34 },
          ],
          speedTilesPerSecond: 1.4,
        },
      }),
      defineNpc({
        npcKey: 'stander',
        look: { displayName: 'Stander' },
        spawn: { x: 42, y: 26 },
      }),
    ]
    const runtime = new NpcRuntime(map, scripts, undefined, 1_000)
    const updates = runtime.tick(1_500)

    expect(updates).toHaveLength(1)
    expect(updates[0]!.id).toBe('npc:walker')
    // Pose deltas must stay compact — no look retransmission.
    expect(Object.keys(updates[0]!).sort()).toEqual([
      'facing',
      'id',
      'roomId',
      'updatedAt',
      'x',
      'y',
    ])
  })

  it('drops unwalkable spawns and duplicate keys', () => {
    const scripts: NpcScript[] = [
      defineNpc({ npcKey: 'dup', look: { displayName: 'A' }, spawn: { x: 42, y: 26 } }),
      defineNpc({ npcKey: 'dup', look: { displayName: 'B' }, spawn: { x: 42, y: 26 } }),
      defineNpc({ npcKey: 'in-a-wall', look: { displayName: 'C' }, spawn: { x: 0, y: 0 } }),
    ]
    const runtime = new NpcRuntime(map, scripts, undefined, 1_000)

    expect(runtime.size).toBe(1)
    expect(runtime.snapshot()[0]!.look.displayName).toBe('A')
  })
})

describe('normalizeActorPresence', () => {
  it('defaults omitted NPC warp permission to disabled', () => {
    const raw: WireActorPresence = {
      kind: 'npc',
      id: 'npc:legacy',
      npcKey: 'legacy',
      look: {
        species: 'female',
        animalKind: 'cat',
        displayName: 'Legacy',
        hairStyle: 'short',
        hairColor: '#000',
        skinColor: '#aaa',
        furColor: '#aaa',
        topStyle: 'tee',
        topColor: '#000',
        bottomStyle: 'pants',
        bottomColor: '#000',
      },
      x: 1,
      y: 1,
      facing: 'down',
      roomId: null,
      voiceOn: false,
      sharing: false,
      updatedAt: 1,
    }

    expect(normalizeActorPresence(raw)).toMatchObject({
      kind: 'npc',
      warpEnabled: false,
      behavior: 'idle',
    })
  })
})
