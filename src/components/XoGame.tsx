import './XoGame.css'
import type { XoCell, XoPlayer } from '../xo/types'

type Props = {
  selfId: string
  gameId: number
  players: XoPlayer[]
  board: XoCell[]
  turnId: string
  phase: 'playing' | 'results'
  winnerId: string | null
  reason: 'win' | 'draw' | 'forfeit' | null
  isHost: boolean
  onMove: (cell: number) => void
  onRestart: () => void
  onQuit: () => void
}

export function XoGame({
  selfId,
  players,
  board,
  turnId,
  phase,
  winnerId,
  reason,
  isHost,
  onMove,
  onRestart,
  onQuit,
}: Props) {
  const me = players.find((p) => p.id === selfId)
  const myTurn = phase === 'playing' && turnId === selfId
  const winner = winnerId ? players.find((p) => p.id === winnerId) : null

  let status = ''
  if (phase === 'results') {
    if (reason === 'draw') status = 'เสมอ!'
    else if (reason === 'forfeit') status = winner ? `${winner.name} ชนะ (ฝ่ายตรงข้ามออก)` : 'จบเกม'
    else if (winner) status = winner.id === selfId ? 'คุณชนะ!' : `${winner.name} ชนะ`
    else status = 'จบเกม'
  } else if (myTurn) {
    status = `ตาคุณ · ${me?.mark ?? '?'}`
  } else {
    const other = players.find((p) => p.id === turnId)
    status = `รอ ${other?.name ?? 'คู่แข่ง'} · ${other?.mark ?? '?'}`
  }

  return (
    <div className="xo">
      <div className="xo__panel">
        <header className="xo__head">
          <strong>XO</strong>
          <p className="xo__status">{status}</p>
        </header>

        <div className="xo__players">
          {players.map((p) => (
            <span
              key={p.id}
              className={`xo__pill ${p.id === turnId && phase === 'playing' ? 'is-turn' : ''} ${
                p.id === selfId ? 'is-me' : ''
              }`}
            >
              <b>{p.mark}</b> {p.name}
            </span>
          ))}
        </div>

        <div className="xo__board" role="grid" aria-label="กระดาน XO">
          {board.map((cell, i) => {
            const canPlay = myTurn && cell == null
            return (
              <button
                key={i}
                type="button"
                className={`xo__cell ${cell === 'X' ? 'is-x' : cell === 'O' ? 'is-o' : ''} ${
                  canPlay ? 'is-open' : ''
                }`}
                disabled={!canPlay}
                onClick={() => onMove(i)}
                aria-label={cell ? cell : `ช่อง ${i + 1}`}
              >
                {cell ?? ''}
              </button>
            )
          })}
        </div>

        <div className="xo__actions">
          {phase === 'results' && isHost && (
            <button type="button" className="xo__btn primary" onClick={onRestart}>
              เล่นอีกครั้ง
            </button>
          )}
          <button type="button" className="xo__btn" onClick={onQuit}>
            ออกจากเกม
          </button>
        </div>
      </div>
    </div>
  )
}
