import type { InteractContext } from './types'

export type InteractSession = {
  sessionId: string
  userId: string
  npcId: string
  npcKey: string
  nodeId: string
  context: InteractContext
  lastActivityAt: number
  /** True while a reply source is resolving (reserved for Phase 3 async). */
  busy: boolean
}

const IDLE_MS = 150_000

export class InteractSessionStore {
  private byUser = new Map<string, InteractSession>()
  private bySession = new Map<string, InteractSession>()

  getByUser(userId: string): InteractSession | undefined {
    return this.byUser.get(userId)
  }

  getBySession(sessionId: string): InteractSession | undefined {
    return this.bySession.get(sessionId)
  }

  set(session: InteractSession): InteractSession | undefined {
    const previous = this.byUser.get(session.userId)
    if (previous) {
      this.bySession.delete(previous.sessionId)
    }
    this.byUser.set(session.userId, session)
    this.bySession.set(session.sessionId, session)
    return previous
  }

  delete(sessionId: string): InteractSession | undefined {
    const session = this.bySession.get(sessionId)
    if (!session) return undefined
    this.bySession.delete(sessionId)
    const current = this.byUser.get(session.userId)
    if (current?.sessionId === sessionId) this.byUser.delete(session.userId)
    return session
  }

  deleteByUser(userId: string): InteractSession | undefined {
    const session = this.byUser.get(userId)
    if (!session) return undefined
    return this.delete(session.sessionId)
  }

  touch(sessionId: string, now = Date.now()): void {
    const session = this.bySession.get(sessionId)
    if (session) session.lastActivityAt = now
  }

  /** Drop idle sessions; returns the ones that expired. */
  sweepIdle(now = Date.now(), idleMs = IDLE_MS): InteractSession[] {
    const expired: InteractSession[] = []
    for (const session of this.bySession.values()) {
      if (now - session.lastActivityAt >= idleMs) expired.push(session)
    }
    for (const session of expired) this.delete(session.sessionId)
    return expired
  }
}

export function newSessionId(random = Math.random): string {
  return `ix_${Date.now().toString(36)}_${Math.floor(random() * 1e9).toString(36)}`
}
