import { useEffect, useMemo, useRef, useState } from 'react'
import './NameWheel.css'

export type WheelMember = { id: string; name: string }

const PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
]

interface Props {
  members: WheelMember[]
  onClose: () => void
}

/** Colorful name wheel for picking someone in the current room. */
export function NameWheel({ members, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [removeAfter, setRemoveAfter] = useState(false)
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set())
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<WheelMember | null>(null)

  const pool = useMemo(
    () => members.filter((m) => !removedIds.has(m.id)),
    [members, removedIds],
  )

  // Drop removed ids that left the room
  useEffect(() => {
    const live = new Set(members.map((m) => m.id))
    setRemovedIds((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (live.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [members])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = devicePixelRatio || 1
    const size = 260
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 6
    const n = Math.max(1, pool.length)
    const slice = (Math.PI * 2) / n

    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((rotation * Math.PI) / 180)

    for (let i = 0; i < n; i++) {
      const start = i * slice - Math.PI / 2
      const end = start + slice
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, r, start, end)
      ctx.closePath()
      ctx.fillStyle = PALETTE[i % PALETTE.length]!
      ctx.fill()
      ctx.strokeStyle = 'rgba(15,23,42,0.45)'
      ctx.lineWidth = 2
      ctx.stroke()

      const label = (pool[i]?.name || '?').slice(0, 10)
      ctx.save()
      ctx.rotate(start + slice / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 12px Karla, sans-serif'
      ctx.fillText(label, r - 14, 4)
      ctx.restore()
    }

    ctx.beginPath()
    ctx.arc(0, 0, 28, 0, Math.PI * 2)
    ctx.fillStyle = '#0f172a'
    ctx.fill()
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()
  }, [pool, rotation])

  function pickIndex(finalDeg: number) {
    const n = pool.length
    if (n <= 0) return -1
    const slice = 360 / n
    // Pointer fixed at top; positive rotation turns the wheel clockwise
    const at = ((-finalDeg % 360) + 360) % 360
    return Math.floor(at / slice) % n
  }

  function spin() {
    if (spinning || pool.length < 1) return
    setWinner(null)
    setSpinning(true)
    const n = pool.length
    const targetIndex = Math.floor(Math.random() * n)
    const slice = 360 / n
    const middle = targetIndex * slice + slice / 2
    const endMod = (360 - middle) % 360
    const start = rotation
    const curMod = ((start % 360) + 360) % 360
    let delta = (endMod - curMod + 360) % 360
    if (delta < 20) delta += 360
    const extraTurns = 4 + Math.floor(Math.random() * 3)
    const end = start + extraTurns * 360 + delta
    const duration = 4200
    const t0 = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const ease = 1 - Math.pow(1 - t, 3)
      const deg = start + (end - start) * ease
      setRotation(deg)
      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        setRotation(end)
        const idx = pickIndex(end)
        const picked = pool[idx] ?? null
        setWinner(picked)
        setSpinning(false)
        if (removeAfter && picked) {
          setRemovedIds((prev) => new Set(prev).add(picked.id))
        }
      }
    }
    requestAnimationFrame(tick)
  }

  function resetPool() {
    setRemovedIds(new Set())
    setWinner(null)
  }

  return (
    <div className="nwheel">
      <div className="nwheel__head">
        <strong>วงล้อสุ่มชื่อ</strong>
        <button type="button" className="nwheel__close" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>

      <div className="nwheel__stage">
        <div className="nwheel__pointer" aria-hidden />
        <canvas ref={canvasRef} className="nwheel__canvas" />
      </div>

      <label className="nwheel__opt">
        <input
          type="checkbox"
          checked={removeAfter}
          disabled={spinning}
          onChange={(e) => setRemoveAfter(e.target.checked)}
        />
        <span>สุ่มแล้วเอาชื่อออกจากวงล้อ</span>
      </label>

      <div className="nwheel__meta">
        ในวงล้อ {pool.length}/{members.length} คน
        {removedIds.size > 0 && (
          <button type="button" className="nwheel__reset" onClick={resetPool} disabled={spinning}>
            รีเซ็ตชื่อ
          </button>
        )}
      </div>

      {winner && (
        <p className="nwheel__winner">
          ได้ <strong>{winner.name}</strong>
          {removeAfter ? ' · เอาออกจากวงแล้ว' : ''}
        </p>
      )}

      <button
        type="button"
        className="nwheel__spin"
        onClick={spin}
        disabled={spinning || pool.length < 1}
      >
        {spinning ? 'กำลังหมุน…' : pool.length < 1 ? 'ไม่มีชื่อเหลือ' : 'สุ่ม!'}
      </button>
    </div>
  )
}
