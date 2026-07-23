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
  /** Watch-only — no controls / no progress sync. */
  spectating?: boolean
  onProgress: (progress: number, finished: boolean) => void
  onRestart: () => void
  onQuit: () => void
}

const TRACK_LEN = 4800
const FINISH_X = TRACK_LEN - 80

type Hammer = { kind: 'hammer'; x: number; ang: number; spd: number; len: number }
type Spinner = { kind: 'spinner'; x: number; ang: number; spd: number; len: number }
type Pusher = { kind: 'pusher'; x: number; baseX: number; amp: number; t: number; spd: number }
type Popper = { kind: 'popper'; x: number; t: number; spd: number; phase: number }
type Bumper = { kind: 'bumper'; x: number; yOff: number; t: number; spd: number; amp: number }
type Gap = { kind: 'gap'; x: number; w: number }
type Conveyor = { kind: 'conveyor'; x: number; w: number; dir: -1 | 1 }
type Gate = { kind: 'gate'; x: number; ang: number; spd: number }
type Obstacle = Hammer | Spinner | Pusher | Popper | Bumper | Gap | Conveyor | Gate

function buildCourse(seed: number): Obstacle[] {
  const rng = mulberry32(seed)
  const out: Obstacle[] = []
  let x = 380
  const end = TRACK_LEN - 280

  while (x < end) {
    const roll = rng()
    const gap = 90 + rng() * 70

    if (roll < 0.16) {
      out.push({
        kind: 'hammer',
        x,
        ang: rng() * Math.PI * 2,
        spd: (1.4 + rng() * 1.4) * (rng() < 0.5 ? 1 : -1),
        len: 58 + rng() * 28,
      })
      x += 200 + gap
    } else if (roll < 0.3) {
      out.push({
        kind: 'spinner',
        x,
        ang: rng() * Math.PI * 2,
        spd: (2.2 + rng() * 1.8) * (rng() < 0.5 ? 1 : -1),
        len: 48 + rng() * 22,
      })
      x += 180 + gap
    } else if (roll < 0.44) {
      out.push({
        kind: 'pusher',
        x,
        baseX: x,
        amp: 55 + rng() * 50,
        t: rng() * Math.PI * 2,
        spd: 1.5 + rng() * 1.6,
      })
      x += 220 + gap
    } else if (roll < 0.56) {
      out.push({
        kind: 'popper',
        x,
        t: 0,
        spd: 2.2 + rng() * 1.8,
        phase: rng() * Math.PI * 2,
      })
      x += 160 + gap
    } else if (roll < 0.68) {
      out.push({
        kind: 'bumper',
        x,
        yOff: -70 - rng() * 40,
        t: rng() * Math.PI * 2,
        spd: 1.8 + rng() * 2,
        amp: 40 + rng() * 35,
      })
      x += 200 + gap
    } else if (roll < 0.8) {
      const gw = 70 + rng() * 55
      out.push({ kind: 'gap', x, w: gw })
      x += gw + 140 + gap
    } else if (roll < 0.9) {
      const cw = 140 + rng() * 120
      out.push({ kind: 'conveyor', x, w: cw, dir: rng() < 0.65 ? -1 : 1 })
      x += cw + 80 + gap * 0.5
    } else {
      out.push({
        kind: 'gate',
        x,
        ang: rng() * Math.PI * 0.5,
        spd: (1.3 + rng() * 1.2) * (rng() < 0.5 ? 1 : -1),
      })
      x += 200 + gap
    }

    // Occasional dense cluster for variety
    if (rng() < 0.18 && x < end - 400) {
      out.push({
        kind: 'hammer',
        x: x + 40,
        ang: rng() * Math.PI * 2,
        spd: 2 + rng(),
        len: 62,
      })
      out.push({
        kind: 'popper',
        x: x + 150,
        t: 0,
        spd: 2.8,
        phase: rng() * Math.PI,
      })
      x += 260
    }
  }
  return out
}

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const START_X = 80

function resetToStart(state: { px: number; py: number; vy: number; onGround: boolean }) {
  state.px = START_X
  state.py = 0
  state.vy = 0
  state.onGround = true
}

/** Simple Fall Guys-style side-scroller race for arena participants / spectators. */
export function FallGuysGame({
  selfId,
  selfName,
  raceId,
  players,
  scores,
  raceOver,
  spectating = false,
  onProgress,
  onRestart,
  onQuit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>(spectating || raceOver ? 'racing' : 'countdown')
  const [count, setCount] = useState(3)
  const [localFinished, setLocalFinished] = useState(false)
  const phaseRef = useRef<Phase>(spectating || raceOver ? 'racing' : 'countdown')
  const scoresRef = useRef(scores)
  const onProgressRef = useRef(onProgress)
  const spectatingRef = useRef(spectating)
  scoresRef.current = scores
  onProgressRef.current = onProgress
  spectatingRef.current = spectating

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (raceOver) setPhase('results')
  }, [raceOver])

  useEffect(() => {
    if (spectating) {
      setPhase(raceOver ? 'results' : 'racing')
      phaseRef.current = raceOver ? 'results' : 'racing'
      setLocalFinished(false)
      return
    }
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
  }, [raceId, spectating, raceOver])

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
      if (spectatingRef.current) return
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space'].includes(e.code)) {
        e.preventDefault()
        keys.add(e.code)
      }
    }
    const onUp = (e: KeyboardEvent) => keys.delete(e.code)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)

    const obstacles = buildCourse(raceId * 9973 + 42)

    const player = { px: START_X, py: 0, vy: 0, onGround: true }
    let finished = false
    let lastSend = 0
    /** Brief grace after respawn so the same hit doesn't loop. */
    let invulnUntil = 0
    let camX = 0
    let last = performance.now()
    let raf = 0
    const groundY = () => h * 0.72

    const failAndRestart = (at: number) => {
      resetToStart(player)
      invulnUntil = at + 700
      lastSend = 0
      onProgressRef.current(0, false)
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const gy = groundY()
      const watching = spectatingRef.current

      for (const o of obstacles) {
        if (o.kind === 'hammer' || o.kind === 'spinner' || o.kind === 'gate') o.ang += o.spd * dt
        if (o.kind === 'pusher') {
          o.t += o.spd * dt
          o.x = o.baseX + Math.sin(o.t) * o.amp
        }
        if (o.kind === 'popper') o.t += o.spd * dt
        if (o.kind === 'bumper') o.t += o.spd * dt
      }

      if (!watching && phaseRef.current === 'racing' && !finished) {
        let move = 0
        if (keys.has('ArrowLeft') || keys.has('KeyA')) move -= 1
        if (keys.has('ArrowRight') || keys.has('KeyD')) move += 1
        player.px += move * 320 * dt
        player.px += 90 * dt
        if ((keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW')) && player.onGround) {
          player.vy = -520
          player.onGround = false
        }
        player.vy += 1600 * dt
        player.py += player.vy * dt
        if (player.py >= 0) {
          player.py = 0
          player.vy = 0
          player.onGround = true
        }

        const beanX = player.px
        const beanY = gy - 28 + player.py
        const canHit = now >= invulnUntil
        let failed = false

        if (canHit) {
          for (const o of obstacles) {
            if (o.kind === 'hammer') {
              const tipX = o.x + Math.cos(o.ang) * o.len
              const tipY = gy - 40 + Math.sin(o.ang) * o.len
              if (Math.hypot(tipX - beanX, tipY - beanY) < 34) failed = true
            } else if (o.kind === 'spinner') {
              const tipX = o.x + Math.cos(o.ang) * o.len
              const tipY = gy - 90 + Math.sin(o.ang) * o.len
              if (Math.hypot(tipX - beanX, tipY - beanY) < 30) failed = true
            } else if (o.kind === 'pusher') {
              if (Math.abs(beanX - o.x) < 28 && beanY > gy - 100 && player.py > -95) {
                failed = true
              }
            } else if (o.kind === 'popper') {
              const up = Math.max(0, Math.sin(o.t + o.phase))
              const height = 20 + up * 78
              if (Math.abs(beanX - o.x) < 22 && beanY > gy - height - 10 && player.py > -height) {
                failed = true
              }
            } else if (o.kind === 'bumper') {
              const bx = o.x + Math.sin(o.t) * o.amp
              const by = gy + o.yOff + Math.cos(o.t * 0.7) * 18
              if (Math.hypot(bx - beanX, by - beanY) < 38) failed = true
            } else if (o.kind === 'gap') {
              if (
                player.onGround &&
                beanX > o.x + 8 &&
                beanX < o.x + o.w - 8 &&
                player.py >= -2
              ) {
                failed = true
              }
            } else if (o.kind === 'gate') {
              const tipX = o.x + Math.sin(o.ang) * 95
              const tipY = gy - 130 + Math.cos(o.ang) * 95
              if (Math.hypot(tipX - beanX, tipY - beanY) < 32) failed = true
            }
            if (failed) break
          }
        }

        if (failed) {
          failAndRestart(now)
        } else {
          for (const o of obstacles) {
            if (o.kind !== 'conveyor') continue
            if (
              player.onGround &&
              beanX > o.x &&
              beanX < o.x + o.w &&
              player.py >= -2
            ) {
              player.px += o.dir * 160 * dt
            }
          }

          player.px = Math.max(40, Math.min(FINISH_X, player.px))
          if (player.px >= FINISH_X - 2) {
            finished = true
            setLocalFinished(true)
            onProgressRef.current(1, true)
          } else if (now - lastSend > 100) {
            lastSend = now
            onProgressRef.current(player.px / FINISH_X, false)
          }
        }
      }

      if (watching) {
        const lead = [...scoresRef.current].sort((a, b) => b.progress - a.progress)[0]
        const follow = lead ? 40 + lead.progress * (FINISH_X - 40) : FINISH_X * 0.35
        camX += (follow - w * 0.35 - camX) * Math.min(1, dt * 4)
      } else {
        camX += (player.px - w * 0.35 - camX) * Math.min(1, dt * 6)
      }

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

      // Track with gap cutouts
      const gaps = obstacles.filter((o): o is Gap => o.kind === 'gap')
      ctx.fillStyle = '#f472b6'
      const drawSeg = (fromWorld: number, toWorld: number) => {
        if (toWorld <= fromWorld) return
        ctx.fillRect(fromWorld - camX, gy, toWorld - fromWorld, h - gy)
      }
      let cursor = 0
      for (const g of gaps) {
        drawSeg(cursor, g.x)
        cursor = g.x + g.w
      }
      drawSeg(cursor, TRACK_LEN + 400)

      ctx.fillStyle = '#fb7185'
      for (let x = 0; x < TRACK_LEN; x += 64) {
        if (gaps.some((g) => x >= g.x && x < g.x + g.w)) continue
        ctx.fillRect(x - camX, gy, 32, 14)
      }

      // Pit water under gaps
      for (const g of gaps) {
        ctx.fillStyle = '#38bdf8'
        ctx.fillRect(g.x - camX, gy + 8, g.w, h - gy)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(g.x - camX + 8, gy + 18, g.w - 16, 6)
      }

      for (const o of obstacles) {
        if (o.kind === 'conveyor') {
          ctx.fillStyle = o.dir < 0 ? '#f59e0b' : '#34d399'
          ctx.fillRect(o.x - camX, gy - 6, o.w, 18)
          ctx.fillStyle = '#0f172a'
          ctx.font = 'bold 14px Karla, sans-serif'
          ctx.textAlign = 'center'
          const arrows = o.dir < 0 ? '◀◀◀' : '▶▶▶'
          ctx.fillText(arrows, o.x - camX + o.w / 2, gy + 8)
        }
      }

      ctx.fillStyle = '#22c55e'
      ctx.fillRect(FINISH_X - camX, gy - 120, 18, 120)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 18px Karla, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('FINISH', FINISH_X - camX - 10, gy - 130)

      for (const o of obstacles) {
        if (o.kind === 'hammer') {
          const bx = o.x - camX
          const by = gy - 40
          ctx.strokeStyle = '#334155'
          ctx.lineWidth = 8
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(bx + Math.cos(o.ang) * o.len, by + Math.sin(o.ang) * o.len)
          ctx.stroke()
          ctx.fillStyle = '#f97316'
          ctx.beginPath()
          ctx.arc(bx + Math.cos(o.ang) * o.len, by + Math.sin(o.ang) * o.len, 18, 0, Math.PI * 2)
          ctx.fill()
        } else if (o.kind === 'spinner') {
          const bx = o.x - camX
          const by = gy - 90
          ctx.strokeStyle = '#7c3aed'
          ctx.lineWidth = 10
          ctx.beginPath()
          ctx.moveTo(bx - Math.cos(o.ang) * o.len, by - Math.sin(o.ang) * o.len)
          ctx.lineTo(bx + Math.cos(o.ang) * o.len, by + Math.sin(o.ang) * o.len)
          ctx.stroke()
          ctx.fillStyle = '#c084fc'
          ctx.beginPath()
          ctx.arc(bx, by, 12, 0, Math.PI * 2)
          ctx.fill()
        } else if (o.kind === 'pusher') {
          ctx.fillStyle = '#ef4444'
          roundRect(ctx, o.x - camX - 18, gy - 95, 36, 95, 8)
          ctx.fill()
          ctx.fillStyle = '#fecaca'
          ctx.fillRect(o.x - camX - 10, gy - 80, 20, 12)
        } else if (o.kind === 'popper') {
          const up = Math.max(0, Math.sin(o.t + o.phase))
          const height = 20 + up * 78
          ctx.fillStyle = '#eab308'
          roundRect(ctx, o.x - camX - 14, gy - height, 28, height, 6)
          ctx.fill()
          ctx.fillStyle = '#a16207'
          ctx.beginPath()
          ctx.moveTo(o.x - camX, gy - height - 10)
          ctx.lineTo(o.x - camX - 12, gy - height + 8)
          ctx.lineTo(o.x - camX + 12, gy - height + 8)
          ctx.closePath()
          ctx.fill()
        } else if (o.kind === 'bumper') {
          const bx = o.x + Math.sin(o.t) * o.amp - camX
          const by = gy + o.yOff + Math.cos(o.t * 0.7) * 18
          ctx.fillStyle = '#ec4899'
          ctx.beginPath()
          ctx.arc(bx, by, 26, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fce7f3'
          ctx.beginPath()
          ctx.arc(bx - 6, by - 6, 8, 0, Math.PI * 2)
          ctx.fill()
        } else if (o.kind === 'gate') {
          const bx = o.x - camX
          const by = gy - 130
          ctx.strokeStyle = '#0ea5e9'
          ctx.lineWidth = 9
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(bx + Math.sin(o.ang) * 95, by + Math.cos(o.ang) * 95)
          ctx.stroke()
          ctx.fillStyle = '#38bdf8'
          ctx.beginPath()
          ctx.arc(bx + Math.sin(o.ang) * 95, by + Math.cos(o.ang) * 95, 16, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#0369a1'
          ctx.fillRect(bx - 10, by - 8, 20, 16)
        }
      }

      for (const s of scoresRef.current) {
        const gx = Math.min(FINISH_X, 40 + s.progress * (FINISH_X - 40))
        const isSelf = s.id === selfId
        if (watching) {
          drawBean(ctx, gx - camX, gy - 28, s.name.slice(0, 8), isSelf ? '#38bdf8' : '#a78bfa', isSelf ? 1 : 0.85)
        } else if (!isSelf) {
          drawBean(ctx, gx - camX, gy - 28, s.name.slice(0, 8), '#a78bfa', 0.55)
        }
      }
      if (!watching) {
        const blink =
          now < invulnUntil && Math.floor(now / 80) % 2 === 0 ? 0.35 : 1
        drawBean(ctx, player.px - camX, gy - 28 + player.py, selfName.slice(0, 8), '#38bdf8', blink)
      }

      const barProg = watching
        ? Math.max(0, ...scoresRef.current.map((s) => s.progress))
        : Math.min(1, player.px / FINISH_X)
      ctx.fillStyle = 'rgba(15,23,42,0.55)'
      ctx.fillRect(16, 16, w - 32, 14)
      ctx.fillStyle = watching ? '#c084fc' : '#f472b6'
      ctx.fillRect(16, 16, (w - 32) * barProg, 14)

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
    <div className={`fg ${spectating ? 'is-spectating' : ''}`}>
      {spectating && (
        <div className="fg__spectate-banner">ผู้ชม · ชมการแข่งอย่างเดียว</div>
      )}
      <div className="fg__stage">
        <canvas ref={canvasRef} />
        {!spectating && phase === 'countdown' && (
          <div className="fg__countdown">
            <span>{count}</span>
            <p>ไปเลย {players.length} คน!</p>
          </div>
        )}
        {spectating && !showBoard && (
          <div className="fg__finish-toast">กำลังชม · {players.length} คนแข่ง</div>
        )}
        {localFinished && !showBoard && (
          <div className="fg__finish-toast">เข้าเส้นชัยแล้ว — รอคนอื่น…</div>
        )}
      </div>

      {showBoard && (
        <div className="fg__board">
          <h2>{spectating ? 'ผลการแข่งขัน (ผู้ชม)' : 'ผลการแข่งขัน'}</h2>
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
            {!spectating && (
              <button type="button" className="fg__btn primary" onClick={onRestart}>
                เริ่มใหม่
              </button>
            )}
            <button type="button" className="fg__btn" onClick={onQuit}>
              {spectating ? 'ออกจากการชม' : 'เลิกเล่น'}
            </button>
          </div>
          {spectating && <p className="fg__hint">เดินออกจากโซนชมพูก็ออกจากการชมได้</p>}
        </div>
      )}

      {spectating && !showBoard && (
        <div className="fg__spectate-actions">
          <button type="button" className="fg__btn" onClick={onQuit}>
            ออกจากการชม
          </button>
        </div>
      )}
    </div>
  )
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
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
