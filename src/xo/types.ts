export const XO_ROOM_ID = 'xo-booth'
export const XO_ROOM_NAME = 'XO Arena'

export type XoMark = 'X' | 'O'

export type XoCell = XoMark | null

export type XoLobbyState = {
  hostId: string | null
  inZone: { id: string; name: string }[]
}

export type XoPlayer = {
  id: string
  name: string
  mark: XoMark
}

export type XoGameStart = {
  gameId: number
  startedAt: number
  players: XoPlayer[]
  turnId: string
  board: XoCell[]
}

export type XoGameUpdate = {
  gameId: number
  board: XoCell[]
  turnId: string
}

export type XoGameOver = {
  gameId: number
  board: XoCell[]
  winnerId: string | null
  reason: 'win' | 'draw' | 'forfeit'
}

/** Snapshot for late welcome / reconnect while a match is live. */
export type XoActiveGame = {
  phase: 'playing' | 'results'
  game: XoGameStart
  winnerId: string | null
  reason: 'win' | 'draw' | 'forfeit' | null
}

export function emptyBoard(): XoCell[] {
  return Array.from({ length: 9 }, () => null)
}

export function checkWinner(board: XoCell[]): XoMark | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]
  for (const [a, b, c] of lines) {
    const v = board[a]
    if (v && v === board[b] && v === board[c]) return v
  }
  return null
}

export function boardFull(board: XoCell[]): boolean {
  return board.every((c) => c != null)
}
