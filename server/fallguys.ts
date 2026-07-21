import type { WebSocket } from 'ws'
import type { PeerPresence } from '../src/types'
import type { ServerMsg } from '../shared/protocol'
import {
  FALLGUYS_ROOM_ID,
  type FallGuysLobbyState,
  type FallGuysRacer,
} from '../src/fallguys/types'

type Client = {
  ws: WebSocket
  id: string | null
  email: string | null
  peer: PeerPresence | null
}

type Deps = {
  clients: Set<Client>
  send: (ws: WebSocket, msg: ServerMsg) => void
  broadcast: (msg: ServerMsg, except?: WebSocket) => void
}

const RACE_TIMEOUT_MS = 90_000

type Phase = 'lobby' | 'racing' | 'results'

let phase: Phase = 'lobby'
let hostId: string | null = null
let raceId = 0
let startedAt = 0
let racers = new Map<string, FallGuysRacer>()
/** When each player first entered the arena (for host = earliest). */
const arenaJoinedAt = new Map<string, number>()
let raceTimer: ReturnType<typeof setTimeout> | null = null

function nameOf(c: Client) {
  return c.peer?.look?.displayName || c.email || c.id || '?'
}

function inArena(deps: Deps): Client[] {
  return [...deps.clients].filter(
    (c) => c.id && c.peer?.roomId === FALLGUYS_ROOM_ID && c.ws.readyState === c.ws.OPEN,
  )
}

function recomputeHost(deps: Deps) {
  const zone = inArena(deps)
  if (zone.length === 0) {
    hostId = null
    return
  }
  let best: Client | null = null
  let bestT = Infinity
  for (const c of zone) {
    const t = arenaJoinedAt.get(c.id!) ?? Date.now()
    if (t < bestT) {
      bestT = t
      best = c
    }
  }
  hostId = best?.id ?? null
}

function lobbySnapshot(deps: Deps): FallGuysLobbyState {
  recomputeHost(deps)
  return {
    hostId,
    inZone: inArena(deps).map((c) => ({ id: c.id!, name: nameOf(c) })),
  }
}

function publishLobby(deps: Deps) {
  deps.broadcast({ type: 'fallguys-lobby', lobby: lobbySnapshot(deps) })
}

function clearRaceTimer() {
  if (raceTimer) {
    clearTimeout(raceTimer)
    raceTimer = null
  }
}

function rankingList(): FallGuysRacer[] {
  return [...racers.values()].sort((a, b) => {
    if (a.finishedAt != null && b.finishedAt != null) return a.finishedAt - b.finishedAt
    if (a.finishedAt != null) return -1
    if (b.finishedAt != null) return 1
    return b.progress - a.progress
  })
}

function endRace(deps: Deps) {
  if (phase !== 'racing') return
  clearRaceTimer()
  phase = 'results'
  deps.broadcast({
    type: 'fallguys-race-over',
    result: { raceId, ranking: rankingList() },
  })
}

function maybeFinishRace(deps: Deps) {
  if (phase !== 'racing') return
  if ([...racers.values()].every((r) => r.finishedAt != null)) endRace(deps)
}

function startRace(deps: Deps, requesterId: string) {
  if (phase === 'racing') return
  recomputeHost(deps)
  if (hostId !== requesterId) {
    const c = [...deps.clients].find((x) => x.id === requesterId)
    if (c) deps.send(c.ws, { type: 'error', message: 'only host can start Fall Guys' })
    return
  }
  const zone = inArena(deps)
  if (zone.length === 0) return
  raceId += 1
  startedAt = Date.now()
  phase = 'racing'
  racers = new Map(
    zone.map((c) => [
      c.id!,
      { id: c.id!, name: nameOf(c), progress: 0, finishedAt: null },
    ]),
  )
  clearRaceTimer()
  raceTimer = setTimeout(() => endRace(deps), RACE_TIMEOUT_MS)
  deps.broadcast({
    type: 'fallguys-race-start',
    race: {
      raceId,
      startedAt,
      players: [...racers.values()].map((r) => ({ id: r.id, name: r.name })),
    },
  })
}

export function onFallGuysPresence(deps: Deps, client: Client) {
  const id = client.id
  if (!id) return
  if (client.peer?.roomId === FALLGUYS_ROOM_ID) {
    if (!arenaJoinedAt.has(id)) arenaJoinedAt.set(id, Date.now())
  } else {
    arenaJoinedAt.delete(id)
    if (phase === 'racing' && racers.has(id)) {
      // Keep racer in race even if they walk out — progress can still update.
    }
  }
  if (phase === 'lobby' || phase === 'results') publishLobby(deps)
}

export function onFallGuysLeave(deps: Deps, id: string | null) {
  if (!id) return
  arenaJoinedAt.delete(id)
  if (hostId === id) recomputeHost(deps)
  if (phase === 'lobby' || phase === 'results') publishLobby(deps)
}

export function handleFallGuysMsg(
  deps: Deps,
  client: Client,
  msg:
    | { type: 'fallguys-start' }
    | { type: 'fallguys-restart' }
    | { type: 'fallguys-quit' }
    | { type: 'fallguys-progress'; raceId: number; progress: number; finished: boolean },
) {
  if (!client.id) return

  if (msg.type === 'fallguys-start' || msg.type === 'fallguys-restart') {
    if (msg.type === 'fallguys-restart' && phase !== 'results' && phase !== 'lobby') return
    startRace(deps, client.id)
    return
  }

  if (msg.type === 'fallguys-quit') {
    // Client closes local UI only — race/results state stays for others.
    return
  }

  if (msg.type === 'fallguys-progress') {
    if (phase !== 'racing' || msg.raceId !== raceId) return
    const r = racers.get(client.id)
    if (!r) return
    r.progress = Math.min(1, Math.max(r.progress, msg.progress))
    if (msg.finished && r.finishedAt == null) {
      r.finishedAt = Date.now()
      r.progress = 1
    }
    deps.broadcast({
      type: 'fallguys-race-update',
      update: { raceId, scores: rankingList() },
    })
    maybeFinishRace(deps)
  }
}

export function fallGuysWelcomeLobby(deps: Deps): FallGuysLobbyState {
  return lobbySnapshot(deps)
}
