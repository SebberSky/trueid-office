import { useEffect, useRef, useState } from 'react'
import type { FallGuysRacer } from '../fallguys/types'
import './FallGuysGame.css'

type Phase = 'countdown' | 'racing' | 'results'

interface Props {
  selfId: string
  selfName: string
  raceId: number
  players: { id: string; name: string }[]
  scores: FallGuysRacer[]
  raceOver: boolean
  isHost: boolean
  onProgress: (progress: number, finished: boolean) => void
  onRestart: () => void
  onQuit: () => void
}

const TRACK_LEN = 2400
const FINISH_X = TRACK_LEN - 80

/** Simple Fall Guys-style side-scroller race for arena participants. */
export function FallGuysGame({
  selfId,
  selfName,
  raceId,
  players,
  scores,
  raceOver,
  isHost,
  onProgress,
  onRestart,
  onQuit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('countdown')
  const [count, setCount] = useState(3)
  const [localFinished, setLocalFinished] = useState(false)
  const phaseRef = useRef<Phase>('countdown')
  const scoresRef = useRef(scores)
  const onProgressRef = useRef(onProgress)
  scoresRef.current = scores
  onProgressRef.current = onProgress

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (raceOver) setPhase('results')
  }, [raceOver])

  useEffect(() => {
    setPhase('countdown')
    setCount(3)
    setLocalFinished(false)
    phaseRef.current = 'countdown'
    let n = 3
    const id = window.setInterval(() => {
      n -= 1
      if (n <= 0) {
        window.clearInterval(id)
        setPhase('racing')
        phaseRef.current = 'racing'
      } else {
        setCount(n)
      }
    }, 800)
    return () => window.clearInterval(id)
  }, [raceId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    const resize = () => {
      const parent = canvas.parentElement
      w = parent?.clientWidth ?? 800
      h = Math.max(320, parent?.clientHeight ?? 480)
      canvas.width = w * devicePixelRatio
      canvas.height = h * devicePixelRatio
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const keys = new Set<string>()
    const onDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space'].includes(e.code)) {
        e.preventDefault()
        keys.add(e.code)
      }
    }
    const onUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)

    type Hammer = { x: number; ang: number; spd: number }
    const hammers: Hammer[] = []
    for (let x = 420; x < TRACK_LEN - 200; x += 280 + (x % 70)) {
      hammers.push({ x, ang: Math.random() * Math.PI, spd: 1.6 + (x % 5) * 0.15 })
    }

    let px = 80
    let py = 0
    let vy = 0
    let onGround = true
    let finished = false
    let lastSend = 0
    let camX = 0
    let last = performance.now()
    let raf = 0
    const groundY = () => h * 0.72

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const gy = groundY()

      if (phaseRef.current === 'racing' && !finished) {
        let move = 0
        if (keys.has('ArrowLeft') || keys.has('KeyA')) move -= 1
        if (keys.has('ArrowRight') || keys.has('KeyD')) move += 1
        px += move * 320 * dt
        px += 90 * dt
        if ((keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW')) && onGround) {
          vy = -520
          onGround = false
        }
        vy += 1600 * dt
        py += vy * dt
        if (py >= 0) {
          py = 0
          vy = 0
          onGround = true
        }

        for (const hm of hammers) {
          hm.ang += hm.spd * dt
          const tipX = hm.x + Math.cos(hm.ang) * 70
          const tipY = gy - 40 + Math.sin(hm.ang) * 70
          const beanX = px
          const beanY = gy - 28 + py
          if (Math.hypot(tipX - beanX, tipY - beanY) < 36) {
            px -= 90
            vy = -200
            onGround = false
          }
        }

        px = Math.max(40, Math.min(FINISH_X, px))
        if (px >= FINISH_X - 2) {
          finished = true
          setLocalFinished(true)
          onProgressRef.current(1, true)
        } else if (now - lastSend > 100) {
          lastSend = now
          onProgressRef.current(px / FINISH_X, false)
        }
      }

      camX += (px - w * 0.35 - camX) * Math.min(1, dt * 6)

      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#7dd3fc')
      grad.addColorStop(0.55, '#fbcfe8')
      grad.addColorStop(1, '#fef3c7')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      ctx.fillStyle = '#86efac'
      for (let i = -1; i < 8; i++) {
        const hx = i * 280 - ((camX * 0.3) % 280)
        ctx.beginPath()
        ctx.ellipse(hx + 140, gy + 40, 160, 90, 0, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#f472b6'
      ctx.fillRect(-camX, gy, TRACK_LEN + 400, h - gy)
      ctx.fillStyle = '#fb7185'
      for (let x = 0; x < TRACK_LEN; x += 64) ctx.fillRect(x - camX, gy, 32, 14)

      ctx.fillStyle = '#22c55e'
      ctx.fillRect(FINISH_X - camX, gy - 120, 18, 120)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 18px Karla, sans-serif'
      ctx.fillText('FINISH', FINISH_X - camX - 10, gy - 130)

      for (const hm of hammers) {
        hm.ang += phaseRef.current === 'racing' ? 0 : 0 // already advanced above when racing
        const bx = hm.x - camX
        const by = gy - 40
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 8
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.lineTo(bx + Math.cos(hm.ang) * 70, by + Math.sin(hm.ang) * 70)
        ctx.stroke()
        ctx.fillStyle = '#f97316'
        ctx.beginPath()
        ctx.arc(bx + Math.cos(hm.ang) * 70, by + Math.sin(hm.ang) * 70, 18, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const s of scoresRef.current) {
        if (s.id === selfId) continue
        const gx = Math.min(FINISH_X, 40 + s.progress * (FINISH_X - 40))
        drawBean(ctx, gx - camX, gy - 28, s.name.slice(0, 8), '#a78bfa', 0.55)
      }
      drawBean(ctx, px - camX, gy - 28 + py, selfName.slice(0, 8), '#38bdf8', 1)

      ctx.fillStyle = 'rgba(15,23,42,0.55)'
      ctx.fillRect(16, 16, w - 32, 14)
      ctx.fillStyle = '#f472b6'
      ctx.fillRect(16, 16, (w - 32) * Math.min(1, px / FINISH_X), 14)

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [raceId, selfId, selfName])

  const ranking = [...scores].sort((a, b) => {
    if (a.finishedAt != null && b.finishedAt != null) return a.finishedAt - b.finishedAt
    if (a.finishedAt != null) return -1
    if (b.finishedAt != null) return 1
    return b.progress - a.progress
  })

  const showBoard = phase === 'results' || raceOver

  return (
    <div className="fg">
      <div className="fg__stage">
        <canvas ref={canvasRef} />
        {phase === 'countdown' && (
          <div className="fg__countdown">
            <span>{count}</span>
            <p>ไปเลย {players.length} คน!</p>
          </div>
        )}
        {localFinished && !showBoard && (
          <div className="fg__finish-toast">เข้าเส้นชัยแล้ว — รอคนอื่น…</div>
        )}
      </div>

      {showBoard && (
        <div className="fg__board">
          <h2>ผลการแข่งขัน</h2>
          <ol>
            {ranking.map((r, i) => (
              <li key={r.id} className={r.id === selfId ? 'is-self' : undefined}>
                <span className="fg__rank">#{i + 1}</span>
                <span className="fg__name">{r.name}</span>
                <span className="fg__stat">
                  {r.finishedAt != null ? 'จบ' : `${Math.round(r.progress * 100)}%`}
                </span>
              </li>
            ))}
          </ol>
          <div className="fg__actions">
            {isHost && (
              <button type="button" className="fg__btn primary" onClick={onRestart}>
                เริ่มใหม่
              </button>
            )}
            <button type="button" className="fg__btn" onClick={onQuit}>
              เลิกเล่น
            </button>
          </div>
          {!isHost && <p className="fg__hint">รอโฮสต์กดเริ่มใหม่ หรือออกได้เลย</p>}
        </div>
      )}
    </div>
  )
}

function drawBean(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  color: string,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, 22, 26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(x - 7, y - 4, 3.5, 0, Math.PI * 2)
  ctx.arc(x + 7, y - 4, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 11px Karla, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(name, x, y - 36)
  ctx.restore()
}
