import type { NpcPresence, UserPresence } from '../../../src/types'
import type { ServerMsg } from '../../../shared/protocol'
import { inInteractRange } from '../../../shared/npcInteract'
import type { NpcRuntime } from '../runtime'
import type { NpcScript } from '../define'
import {
  choiceResponseMode,
  nextNodeIdForChoice,
  resolveContentNode,
} from './dialogue'
import { resolveNodeReply } from './sources'
import {
  InteractSessionStore,
  newSessionId,
  type InteractSession,
} from './sessions'
import type { InteractContext, ResolvedReply } from './types'

export type InteractSend = (msg: ServerMsg) => void

export type InteractEndReason =
  | 'client'
  | 'disconnect'
  | 'idle'
  | 'replaced'
  | 'error'
  | 'rejected'

export class InteractEngine {
  readonly sessions = new InteractSessionStore()

  constructor(private readonly npcRuntime: NpcRuntime) {}

  async start(opts: {
    user: UserPresence
    npcId: string
    send: InteractSend
    now?: number
  }): Promise<void> {
    const { user, npcId, send } = opts
    const now = opts.now ?? Date.now()
    const peer = this.npcRuntime.getPeer(npcId)
    const script = peer ? this.npcRuntime.getScript(peer.npcKey) : undefined

    if (!peer || !script?.interact) {
      send({ type: 'interact-error', message: 'NPC นี้ยังคุยไม่ได้' })
      return
    }
    if (!inInteractRange(user.x, user.y, peer.x, peer.y)) {
      send({ type: 'interact-error', message: 'อยู่ไกลเกินไป เข้าใกล้ NPC ก่อน' })
      return
    }

    const previous = this.sessions.deleteByUser(user.id)
    if (previous) {
      send({ type: 'interact-ended', sessionId: previous.sessionId, reason: 'replaced' })
    }

    const context: InteractContext = {
      actor: {
        userId: user.id,
        displayName: user.look.displayName?.trim() || user.email || user.id,
      },
      location: {
        roomId: user.roomId,
        x: user.x,
        y: user.y,
      },
    }

    const startNode = resolveContentNode(script.interact, script.interact.startNode)
    if (!startNode) {
      send({ type: 'interact-error', message: 'สคริปต์บทสนทนาเสีย' })
      return
    }

    const session: InteractSession = {
      sessionId: newSessionId(),
      userId: user.id,
      npcId: peer.id,
      npcKey: peer.npcKey,
      nodeId: startNode.id,
      context,
      lastActivityAt: now,
      busy: false,
    }
    this.sessions.set(session)

    send({
      type: 'interact-started',
      sessionId: session.sessionId,
      npcId: peer.id,
      npcKey: peer.npcKey,
      displayName: peer.look.displayName,
    })

    await this.emitNode(session, script, startNode.id, send)
  }

  async choose(opts: {
    userId: string
    sessionId: string
    optionId: string
    send: InteractSend
    now?: number
  }): Promise<void> {
    const { userId, sessionId, optionId, send } = opts
    const now = opts.now ?? Date.now()
    const session = this.sessions.getBySession(sessionId)
    if (!session || session.userId !== userId) {
      send({ type: 'interact-error', message: 'ไม่พบเซสชันการคุย' })
      return
    }
    if (session.busy) {
      send({ type: 'interact-error', message: 'รอ NPC พูดจบก่อน' })
      return
    }

    const script = this.npcRuntime.getScript(session.npcKey)
    if (!script?.interact) {
      this.endSession(session.sessionId, 'error', send)
      return
    }

    const current = script.interact.nodes[session.nodeId]
    if (!current) {
      this.endSession(session.sessionId, 'error', send)
      return
    }

    const nextId = nextNodeIdForChoice(current, optionId)
    if (nextId === undefined) {
      send({ type: 'interact-error', message: 'ตัวเลือกไม่ถูกต้อง' })
      return
    }

    this.sessions.touch(session.sessionId, now)

    if (nextId === null) {
      this.endSession(session.sessionId, 'client', send)
      return
    }

    await this.emitNode(session, script, nextId, send)
  }

  end(opts: {
    userId: string
    sessionId: string
    send: InteractSend
    reason?: InteractEndReason
  }): void {
    const session = this.sessions.getBySession(opts.sessionId)
    if (!session || session.userId !== opts.userId) return
    this.endSession(session.sessionId, opts.reason ?? 'client', opts.send)
  }

  endByUser(
    userId: string,
    send: InteractSend,
    reason: 'disconnect' | 'idle' | 'client' = 'disconnect',
  ): void {
    const session = this.sessions.getByUser(userId)
    if (!session) return
    this.endSession(session.sessionId, reason, send)
  }

  sweepIdle(sendForUser: (userId: string, msg: ServerMsg) => void, now = Date.now()): void {
    const expired = this.sessions.sweepIdle(now)
    for (const session of expired) {
      sendForUser(session.userId, {
        type: 'interact-ended',
        sessionId: session.sessionId,
        reason: 'idle',
      })
    }
  }

  private endSession(sessionId: string, reason: InteractEndReason, send: InteractSend): void {
    const session = this.sessions.delete(sessionId)
    if (!session) return
    send({ type: 'interact-ended', sessionId, reason })
  }

  private async emitNode(
    session: InteractSession,
    script: NpcScript,
    nodeId: string,
    send: InteractSend,
    depth = 0,
  ): Promise<void> {
    if (!script.interact) return
    if (depth > 16) {
      console.error('[interact] dialogue next-chain too deep', session.npcKey, nodeId)
      this.endSession(session.sessionId, 'error', send)
      return
    }
    // Session may have been Esc/disconnect-ended while a prior await was in flight.
    if (this.sessions.getBySession(session.sessionId) !== session) return

    const node = resolveContentNode(script.interact, nodeId)
    if (!node) {
      this.endSession(session.sessionId, 'error', send)
      return
    }

    session.busy = true
    session.nodeId = node.id
    let reply: ResolvedReply
    try {
      reply = await resolveNodeReply(node, session.context)
    } catch (err) {
      session.busy = false
      console.error('[interact] reply failed', err)
      if (this.sessions.getBySession(session.sessionId) === session) {
        this.endSession(session.sessionId, 'error', send)
      }
      return
    }

    if (this.sessions.getBySession(session.sessionId) !== session) return

    session.busy = false
    session.nodeId = reply.nodeId
    this.sessions.touch(session.sessionId)

    send({
      type: 'npc-dialogue',
      sessionId: session.sessionId,
      phase: 'done',
      text: reply.text,
      choices: reply.choices.map((choice) => ({
        ...choice,
        responseMode: choiceResponseMode(script.interact!, node, choice.id),
      })),
      nodeId: reply.nodeId,
    })

    if (!reply.end && reply.choices.length === 0 && node.next) {
      await this.emitNode(session, script, node.next, send, depth + 1)
    }
  }
}

export type { InteractSession, NpcPresence }
