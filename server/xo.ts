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

function startGame(deps: Deps, requesterId: string) {
  if (phase === 'playing') return
  const zone = inBooth(deps)
  if (zone.length !== 2) {
    const c = [...deps.clients].find((x) => x.id === requesterId)
    if (c) deps.send(c.ws, { type: 'error', message: 'XO needs exactly 2 players' })
    return
  }
  if (!zone.some((c) => c.id === requesterId)) {
    const c = [...deps.clients].find((x) => x.id === requesterId)
    if (c) deps.send(c.ws, { type: 'error', message: 'must be in XO zone to start' })
    return
  }
  // Either player in the full zone may start; earliest joiner still gets X.
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
  deps.broadcast({ type: 'xo-game-start', game: gameStartPayload() })
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
    | { type: 'xo-start' }
    | { type: 'xo-restart' }
    | { type: 'xo-quit' }
    | { type: 'xo-move'; gameId: number; cell: number },
) {
  if (!client.id) return

  if (msg.type === 'xo-start' || msg.type === 'xo-restart') {
    if (msg.type === 'xo-restart' && phase !== 'results' && phase !== 'lobby') return
    startGame(deps, client.id)
    return
  }

  if (msg.type === 'xo-quit') {
    // Client closes local UI only.
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
