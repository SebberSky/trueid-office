import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTemplate,
  choiceMeta,
  choiceResponseMode,
  nextNodeIdForChoice,
  resolveContentNode,
} from './dialogue'
import { resolveNodeReply } from './sources'
import { resetSheetCache } from './googleSheet'
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

  it('marks only API destinations as async, with the node loading label', () => {
    const config: InteractConfig = {
      startNode: 'hub',
      nodes: {
        hub: {
          id: 'hub',
          choices: [
            { id: 'static', label: 'Static', next: 'static' },
            { id: 'api', label: 'API', next: 'api-pool' },
            { id: 'end', label: 'End' },
          ],
        },
        static: { id: 'static', say: 'Ready' },
        'api-pool': { id: 'api-pool', randomFrom: ['static', 'remote'] },
        remote: {
          id: 'remote',
          loadingLabel: 'กำลังแอบเปิดแฟ้ม…',
          source: { type: 'api', provider: 'google-sheet', config: { sheetId: 's' } },
        },
      },
    }

    expect(choiceResponseMode(config, config.nodes.hub!, 'static')).toBe('immediate')
    expect(choiceResponseMode(config, config.nodes.hub!, 'end')).toBe('immediate')
    expect(choiceMeta(config, config.nodes.hub!, 'api')).toEqual({
      responseMode: 'async',
      loadingLabel: 'กำลังแอบเปิดแฟ้ม…',
    })
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

describe('InteractEngine api nodes', () => {
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

  function reporterNpc(onError?: { text?: string; next?: string }) {
    return defineNpc({
      npcKey: 'reporter',
      look: { displayName: 'Reporter' },
      spawn: { x: 42, y: 26 },
      roomId: 'plaza-main',
      interact: {
        startNode: 'hub',
        nodes: {
          hub: {
            id: 'hub',
            say: 'ว่าไง',
            choices: [{ id: 'report', label: 'ขอรายงาน', next: 'report' }],
          },
          report: {
            id: 'report',
            say: 'เดือน {month} มีสมาชิก {active} คน',
            loadingLabel: 'กำลังเปิดแฟ้ม…',
            source: {
              type: 'api',
              provider: 'google-sheet',
              config: {
                sheetId: 'test-sheet',
                fields: { month: 'Month', active: 'Active' },
              },
            },
            onError,
            choices: [{ id: 'hub', label: 'กลับ', next: 'hub' }],
          },
          apology: {
            id: 'apology',
            say: 'ขอโทษที แฟ้มหาย',
            choices: [{ id: 'hub', label: 'กลับ', next: 'hub' }],
          },
        },
      },
    })
  }

  async function startAndChoose(
    engine: InteractEngine,
    msgs: ServerMsg[],
  ): Promise<void> {
    const send = (msg: ServerMsg) => msgs.push(msg)
    await engine.start({ user: userAt(spawn.x, spawn.y), npcId: 'npc:reporter', send })
    const started = msgs.find((m) => m.type === 'interact-started')
    if (started?.type !== 'interact-started') throw new Error('no session')
    await engine.choose({
      userId: 'user-1',
      sessionId: started.sessionId,
      optionId: 'report',
      send,
    })
  }

  beforeEach(() => {
    resetSheetCache()
    vi.unstubAllGlobals()
  })

  it('renders live sheet data into the say template with loading metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => 'Month,Active\nJan,100\nFeb,250',
      })),
    )

    const engine = new InteractEngine(new NpcRuntime(map, [reporterNpc()]))
    const msgs: ServerMsg[] = []
    await startAndChoose(engine, msgs)

    const hub = msgs.find((m) => m.type === 'npc-dialogue')
    if (hub?.type !== 'npc-dialogue') throw new Error('no hub dialogue')
    expect(hub.choices?.[0]).toMatchObject({
      responseMode: 'async',
      loadingLabel: 'กำลังเปิดแฟ้ม…',
    })

    const report = msgs.filter((m) => m.type === 'npc-dialogue').at(-1)
    if (report?.type !== 'npc-dialogue') throw new Error('no report dialogue')
    expect(report.text).toBe('เดือน Feb มีสมาชิก 250 คน')
    expect(report.nodeId).toBe('report')
    expect(msgs.some((m) => m.type === 'interact-ended')).toBe(false)
  })

  it('falls back to onError.text through applyTemplate and keeps the session alive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )

    const engine = new InteractEngine(
      new NpcRuntime(map, [
        reporterNpc({ text: 'แฟ้มหายไปแล้ว คุณ{displayName}' }),
      ]),
    )
    const msgs: ServerMsg[] = []
    await startAndChoose(engine, msgs)

    const last = msgs.filter((m) => m.type === 'npc-dialogue').at(-1)
    if (last?.type !== 'npc-dialogue') throw new Error('no dialogue')
    expect(last.text).toBe('แฟ้มหายไปแล้ว คุณเจษ')
    expect(last.choices).toHaveLength(1)
    expect(msgs.some((m) => m.type === 'interact-ended')).toBe(false)
    expect(engine.sessions.getByUser('user-1')).toBeDefined()
  })

  it('routes to onError.next when configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )

    const engine = new InteractEngine(
      new NpcRuntime(map, [reporterNpc({ next: 'apology' })]),
    )
    const msgs: ServerMsg[] = []
    await startAndChoose(engine, msgs)

    const last = msgs.filter((m) => m.type === 'npc-dialogue').at(-1)
    if (last?.type !== 'npc-dialogue') throw new Error('no dialogue')
    expect(last.nodeId).toBe('apology')
    expect(last.text).toBe('ขอโทษที แฟ้มหาย')
    expect(msgs.some((m) => m.type === 'interact-ended')).toBe(false)
  })

  it('uses the default fallback line when onError is omitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )

    const engine = new InteractEngine(new NpcRuntime(map, [reporterNpc()]))
    const msgs: ServerMsg[] = []
    await startAndChoose(engine, msgs)

    const last = msgs.filter((m) => m.type === 'npc-dialogue').at(-1)
    if (last?.type !== 'npc-dialogue') throw new Error('no dialogue')
    expect(last.text).toBe('ตอนนี้ดึงข้อมูลไม่ได้ ลองใหม่อีกทีนะ')
    expect(msgs.some((m) => m.type === 'interact-ended')).toBe(false)
  })
})
