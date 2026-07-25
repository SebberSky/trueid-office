import { describe, expect, it } from 'vitest'
import { applyTemplate, nextNodeIdForChoice, resolveContentNode } from './dialogue'
import { resolveNodeReply } from './sources'
import { InteractSessionStore } from './sessions'
import { InteractEngine } from './engine'
import type { InteractConfig, InteractContext } from './types'
import { inInteractRange, INTERACT_RANGE_PX } from '../../../shared/npcInteract'
import { TILE, generateWorld, pixelCenter } from '../../../src/world/terrain'
import { NpcRuntime } from '../runtime'
import { defineNpc } from '../define'
import type { ServerMsg } from '../../../shared/protocol'
import type { UserPresence } from '../../../src/types'

const context: InteractContext = {
  actor: { userId: 'u1', displayName: 'เจษ' },
  location: { roomId: 'plaza-main', x: 0, y: 0 },
}

const sample: InteractConfig = {
  startNode: 'hub',
  nodes: {
    hub: {
      id: 'hub',
      say: 'สวัสดี {displayName}',
      choices: [
        { id: 'a', label: 'สุ่ม', next: 'pool' },
        { id: 'bye', label: 'บาย' },
      ],
    },
    pool: {
      id: 'pool',
      randomFrom: ['g1', 'g2'],
    },
    g1: { id: 'g1', say: 'หนึ่ง', choices: [{ id: 'back', label: 'กลับ', next: 'hub' }] },
    g2: { id: 'g2', say: 'สอง', choices: [{ id: 'back', label: 'กลับ', next: 'hub' }] },
  },
}

describe('dialogue helpers', () => {
  it('templates displayName', () => {
    expect(applyTemplate('สวัสดี {displayName}', { displayName: 'เจษ' })).toBe('สวัสดี เจษ')
  })

  it('resolves randomFrom to a content node', () => {
    const node = resolveContentNode(sample, 'pool', () => 0)
    expect(node?.id).toBe('g1')
    const node2 = resolveContentNode(sample, 'pool', () => 0.9)
    expect(node2?.id).toBe('g2')
  })

  it('maps choices and end-without-next', () => {
    expect(nextNodeIdForChoice(sample.nodes.hub!, 'a')).toBe('pool')
    expect(nextNodeIdForChoice(sample.nodes.hub!, 'bye')).toBeNull()
    expect(nextNodeIdForChoice(sample.nodes.hub!, 'missing')).toBeUndefined()
  })

  it('resolves scripted reply with choices', async () => {
    const reply = await resolveNodeReply(sample.nodes.hub!, context)
    expect(reply.text).toBe('สวัสดี เจษ')
    expect(reply.choices).toHaveLength(2)
    expect(reply.nodeId).toBe('hub')
  })
})

describe('InteractSessionStore', () => {
  it('keeps one session per user and sweeps idle', () => {
    const store = new InteractSessionStore()
    store.set({
      sessionId: 's1',
      userId: 'u1',
      npcId: 'npc:a',
      npcKey: 'a',
      nodeId: 'hub',
      context,
      lastActivityAt: 1_000,
      busy: false,
    })
    const prev = store.set({
      sessionId: 's2',
      userId: 'u1',
      npcId: 'npc:a',
      npcKey: 'a',
      nodeId: 'hub',
      context,
      lastActivityAt: 2_000,
      busy: false,
    })
    expect(prev?.sessionId).toBe('s1')
    expect(store.getByUser('u1')?.sessionId).toBe('s2')
    expect(store.getBySession('s1')).toBeUndefined()

    const expired = store.sweepIdle(2_000 + 150_000)
    expect(expired).toHaveLength(1)
    expect(expired[0]!.sessionId).toBe('s2')
    expect(store.getByUser('u1')).toBeUndefined()
  })
})

describe('interact range', () => {
  it('matches 1.5 tiles', () => {
    expect(INTERACT_RANGE_PX).toBe(1.5 * TILE)
    expect(inInteractRange(0, 0, TILE, 0)).toBe(true)
    expect(inInteractRange(0, 0, TILE * 2, 0)).toBe(false)
  })
})

describe('InteractEngine edges', () => {
  const map = generateWorld(20260717)
  const spawn = pixelCenter(42, 26)

  function userAt(x: number, y: number): UserPresence {
    return {
      kind: 'user',
      id: 'user-1',
      email: 'a@b.c',
      look: {
        species: 'female',
        animalKind: 'cat',
        displayName: 'เจษ',
        hairStyle: 'short',
        hairColor: '#000',
        skinColor: '#aaa',
        furColor: '#aaa',
        topStyle: 'tee',
        topColor: '#000',
        bottomStyle: 'pants',
        bottomColor: '#000',
      },
      x,
      y,
      facing: 'down',
      roomId: 'plaza-main',
      voiceOn: false,
      sharing: false,
      updatedAt: 1,
    }
  }

  it('rejects out-of-range start without sending interact-ended', async () => {
    const runtime = new NpcRuntime(map, [
      defineNpc({
        npcKey: 'talker',
        look: { displayName: 'Talker' },
        spawn: { x: 42, y: 26 },
        roomId: 'plaza-main',
        interact: {
          startNode: 'hi',
          nodes: {
            hi: {
              id: 'hi',
              say: 'hello',
              choices: [{ id: 'bye', label: 'bye' }],
            },
          },
        },
      }),
    ])
    const engine = new InteractEngine(runtime)
    const msgs: ServerMsg[] = []
    const send = (msg: ServerMsg) => msgs.push(msg)

    await engine.start({
      user: userAt(spawn.x + TILE * 3, spawn.y),
      npcId: 'npc:talker',
      send,
    })

    expect(msgs.some((m) => m.type === 'interact-error')).toBe(true)
    expect(msgs.some((m) => m.type === 'interact-ended')).toBe(false)
    expect(engine.sessions.getByUser('user-1')).toBeUndefined()
  })

  it('stops cyclic next chains without hanging', async () => {
    const runtime = new NpcRuntime(map, [
      defineNpc({
        npcKey: 'looper',
        look: { displayName: 'Looper' },
        spawn: { x: 42, y: 26 },
        roomId: 'plaza-main',
        interact: {
          startNode: 'a',
          nodes: {
            a: { id: 'a', say: 'A', next: 'b' },
            b: { id: 'b', say: 'B', next: 'a' },
          },
        },
      }),
    ])
    const engine = new InteractEngine(runtime)
    const msgs: ServerMsg[] = []
    await engine.start({
      user: userAt(spawn.x, spawn.y),
      npcId: 'npc:looper',
      send: (msg) => msgs.push(msg),
    })

    const dialogues = msgs.filter((m) => m.type === 'npc-dialogue')
    expect(dialogues.length).toBeLessThanOrEqual(17)
    expect(msgs.some((m) => m.type === 'interact-ended' && m.reason === 'error')).toBe(true)
  })
})
