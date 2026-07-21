import type { WebSocket } from 'ws'
import type { PeerPresence } from '../src/types'
import type { ServerMsg } from '../shared/protocol'
import {
  XO_ROOM_ID,
  boardFull,
  checkWinner,
  emptyBoard,
  type XoActiveGame,
  type XoCell,
  type XoLobbyState,
  type XoPlayer,
} from '../src/xo/types'

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

type Phase = 'lobby' | 'playing' | 'results'

let phase: Phase = 'lobby'
let hostId: string | null = null
let gameId = 0
let startedAt = 0
let players: XoPlayer[] = []
let board: XoCell[] = emptyBoard()
let turnId: string | null = null
let winnerId: string | null = null
let endReason: 'win' | 'draw' | 'forfeit' | null = null
/** When each player first entered the booth (host = earliest). */
const boothJoinedAt = new Map<string, number>()

function nameOf(c: Client) {
  return c.peer?.look?.displayName || c.email || c.id || '?'
}

function inBooth(deps: Deps): Client[] {
  return [...deps.clients].filter(
    (c) => c.id && c.peer?.roomId === XO_ROOM_ID && c.ws.readyState === 1,
  )
}

/** Align server booth with who the starter's client currently sees in the pad. */
function ensureInBooth(deps: Deps, ids: string[]) {
  for (const id of ids) {
    const c = [...deps.clients].find((x) => x.id === id && x.ws.readyState === 1)
    if (!c?.peer) continue
    if (c.peer.roomId !== XO_ROOM_ID) {
      c.peer = { ...c.peer, roomId: XO_ROOM_ID, updatedAt: Date.now() }
    }
    if (!boothJoinedAt.has(id)) boothJoinedAt.set(id, Date.now())
  }
}

function recomputeHost(deps: Deps) {
  const zone = inBooth(deps)
  if (zone.length === 0) {
    hostId = null
    return
  }
  let best: Client | null = null
  let bestT = Infinity
  for (const c of zone) {
    if (!boothJoinedAt.has(c.id!)) boothJoinedAt.set(c.id!, Date.now())
    const t = boothJoinedAt.get(c.id!)!
    if (t < bestT) {
      bestT = t
      best = c
    }
  }
  hostId = best?.id ?? null
}

function lobbySnapshot(deps: Deps): XoLobbyState {
  recomputeHost(deps)
  const zone = [...inBooth(deps)].sort(
    (a, b) => (boothJoinedAt.get(a.id!) ?? 0) - (boothJoinedAt.get(b.id!) ?? 0),
  )
  return {
    hostId,
    inZone: zone.map((c) => ({ id: c.id!, name: nameOf(c) })),
  }
}

function publishLobby(deps: Deps) {
  deps.broadcast({ type: 'xo-lobby', lobby: lobbySnapshot(deps) })
}

function gameStartPayload() {
  return {
    gameId,
    startedAt,
    players: players.map((p) => ({ ...p })),
    turnId: turnId!,
    board: [...board],
  }
}

function activeSnapshot(): XoActiveGame | null {
  if (phase !== 'playing' && phase !== 'results') return null
  if (gameId <= 0 || players.length === 0 || !turnId) return null
  return {
    phase,
    game: gameStartPayload(),
    winnerId,
    reason: endReason,
  }
}

function endGame(deps: Deps, winner: string | null, reason: 'win' | 'draw' | 'forfeit') {
  if (phase !== 'playing') return
  phase = 'results'
  winnerId = winner
  endReason = reason
  deps.broadcast({
    type: 'xo-game-over',
    result: { gameId, board: [...board], winnerId, reason },
  })
  publishLobby(deps)
}

function sendXoError(deps: Deps, requesterId: string, message: string) {
  const c = [...deps.clients].find((x) => x.id === requesterId)
  if (c) deps.send(c.ws, { type: 'error', message })
}

function startGame(deps: Deps, requesterId: string) {
  const zone = inBooth(deps)
  if (zone.length !== 2) {
    sendXoError(deps, requesterId, `XO ต้องมีผู้เล่นในโซน 2 คน (ตอนนี้ ${zone.length})`)
    return
  }
  if (!zone.some((c) => c.id === requesterId)) {
    sendXoError(deps, requesterId, 'ต้องยืนในโซน XO ถึงจะเริ่มได้')
    return
  }
  // Either player in the full zone may start (also works as rematch while stuck in playing).
  recomputeHost(deps)

  // Host = X, other = O
  const ordered = [...zone].sort(
    (a, b) => (boothJoinedAt.get(a.id!) ?? 0) - (boothJoinedAt.get(b.id!) ?? 0),
  )
  const [a, b] = ordered
  players = [
    { id: a!.id!, name: nameOf(a!), mark: 'X' },
    { id: b!.id!, name: nameOf(b!), mark: 'O' },
  ]
  board = emptyBoard()
  turnId = players[0]!.id
  winnerId = null
  endReason = null
  gameId += 1
  startedAt = Date.now()
  phase = 'playing'
  const startMsg = { type: 'xo-game-start' as const, game: gameStartPayload() }
  deps.broadcast(startMsg)
  // Ensure the starter always gets the frame even if broadcast iteration skips them.
  const starter = [...deps.clients].find((x) => x.id === requesterId)
  if (starter) deps.send(starter.ws, startMsg)
}

function forfeitIfNeeded(deps: Deps, leftId: string) {
  if (phase !== 'playing') return
  if (!players.some((p) => p.id === leftId)) return
  const remaining = players.find((p) => p.id !== leftId)
  endGame(deps, remaining?.id ?? null, 'forfeit')
}

export function onXoPresence(deps: Deps, client: Client) {
  const id = client.id
  if (!id) return
  const nowIn = client.peer?.roomId === XO_ROOM_ID
  const wasIn = boothJoinedAt.has(id)
  if (nowIn) {
    if (!wasIn) boothJoinedAt.set(id, Date.now())
    if (!wasIn && (phase === 'playing' || phase === 'results')) {
      const state = activeSnapshot()
      if (state) deps.send(client.ws, { type: 'xo-game-state', state })
    }
  } else if (wasIn) {
    boothJoinedAt.delete(id)
    forfeitIfNeeded(deps, id)
  }
  if (nowIn !== wasIn || phase === 'lobby' || phase === 'results') {
    if (phase === 'lobby' || phase === 'results') publishLobby(deps)
  }
}

export function onXoLeave(deps: Deps, id: string | null) {
  if (!id) return
  boothJoinedAt.delete(id)
  forfeitIfNeeded(deps, id)
  if (hostId === id) recomputeHost(deps)
  if (phase === 'lobby' || phase === 'results') publishLobby(deps)
}

export function handleXoMsg(
  deps: Deps,
  client: Client,
  msg:
    | { type: 'xo-start'; zoneIds?: string[] }
    | { type: 'xo-restart'; zoneIds?: string[] }
    | { type: 'xo-quit' }
    | { type: 'xo-move'; gameId: number; cell: number },
) {
  if (!client.id) {
    deps.send(client.ws, { type: 'error', message: 'ยังไม่พร้อม — รอเชื่อมต่อแล้วกดเริ่มอีกครั้ง' })
    return
  }

  if (msg.type === 'xo-start' || msg.type === 'xo-restart') {
    const claimed = Array.isArray(msg.zoneIds) ? msg.zoneIds.map(String) : []
    const ids = [...new Set([client.id, ...claimed])].slice(0, 2)
    console.info('[xo] start request', {
      requesterId: client.id,
      claimed: ids,
      phase,
      boothBefore: inBooth(deps).map((c) => ({
        id: c.id,
        roomId: c.peer?.roomId ?? null,
      })),
    })
    ensureInBooth(deps, ids)
    // Re-run presence hooks so boothJoinedAt matches forced roomIds.
    for (const id of ids) {
      const c = [...deps.clients].find((x) => x.id === id)
      if (c) onXoPresence(deps, c)
    }
    startGame(deps, client.id)
    console.info('[xo] start done', {
      phase,
      zoneAfter: inBooth(deps).map((c) => c.id),
      gameId,
      players: players.map((p) => p.id),
    })
    return
  }

  if (msg.type === 'xo-quit') {
    // Closing the overlay mid-match counts as leaving the round.
    forfeitIfNeeded(deps, client.id)
    if (phase === 'results') {
      phase = 'lobby'
      publishLobby(deps)
    }
    return
  }

  if (msg.type === 'xo-move') {
    if (phase !== 'playing') return
    if (msg.gameId !== gameId) return
    if (client.id !== turnId) return
    const cell = msg.cell | 0
    if (cell < 0 || cell > 8) return
    if (board[cell] != null) return
    const me = players.find((p) => p.id === client.id)
    if (!me) return
    if (client.peer?.roomId !== XO_ROOM_ID) return

    board[cell] = me.mark
    const winMark = checkWinner(board)
    if (winMark) {
      const winner = players.find((p) => p.mark === winMark)
      endGame(deps, winner?.id ?? null, 'win')
      return
    }
    if (boardFull(board)) {
      endGame(deps, null, 'draw')
      return
    }
    const other = players.find((p) => p.id !== client.id)
    turnId = other?.id ?? turnId
    deps.broadcast({
      type: 'xo-game-update',
      update: { gameId, board: [...board], turnId: turnId! },
    })
  }
}

export function xoWelcomeLobby(deps: Deps): XoLobbyState {
  return lobbySnapshot(deps)
}

export function xoWelcomeGame(): XoActiveGame | null {
  return activeSnapshot()
}

/** Runtime snapshot for /api/health debugging. */
export function xoDebugState(deps: Deps) {
  return {
    phase,
    gameId,
    hostId,
    zone: inBooth(deps).map((c) => ({
      id: c.id,
      name: nameOf(c),
      roomId: c.peer?.roomId ?? null,
    })),
    boothJoinedAt: [...boothJoinedAt.entries()],
    players: players.map((p) => ({ id: p.id, mark: p.mark })),
  }
}
