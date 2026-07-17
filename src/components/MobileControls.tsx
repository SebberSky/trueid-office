import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import './MobileControls.css'

interface Props {
  /** x right+, y down+ (screen space). WorldView maps into map movement. */
  stickRef: MutableRefObject<{ x: number; y: number }>
  onZoom: (delta: number) => void
}

export function MobileControls({ stickRef, onZoom }: Props) {
  const [visible, setVisible] = useState(false)
  const baseRef = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const activePtr = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse), (max-width: 820px)')
    const sync = () => setVisible(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    return () => {
      stickRef.current = { x: 0, y: 0 }
    }
  }, [stickRef])

  if (!visible) return null

  function setStick(nx: number, ny: number) {
    stickRef.current = { x: nx, y: ny }
    setKnob({ x: nx, y: ny })
  }

  function onPointerDown(e: ReactPointerEvent) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    activePtr.current = e.pointerId
    moveTo(e.clientX, e.clientY)
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (activePtr.current !== e.pointerId) return
    moveTo(e.clientX, e.clientY)
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (activePtr.current !== e.pointerId) return
    activePtr.current = null
    setStick(0, 0)
  }

  function moveTo(clientX: number, clientY: number) {
    const el = baseRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const max = r.width * 0.38
    let dx = clientX - cx
    let dy = clientY - cy
    const len = Math.hypot(dx, dy) || 1
    if (len > max) {
      dx = (dx / len) * max
      dy = (dy / len) * max
    }
    setStick(dx / max, dy / max)
  }

  return (
    <div className="mobile-controls" aria-hidden={false}>
      <div
        className="mobile-controls__stick"
        ref={baseRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="mobile-controls__knob"
          style={{
            transform: `translate(calc(-50% + ${knob.x * 38}px), calc(-50% + ${knob.y * 38}px))`,
          }}
        />
      </div>
      <div className="mobile-controls__zoom">
        <button type="button" aria-label="ซูมเข้า" onClick={() => onZoom(0.1)}>
          +
        </button>
        <button type="button" aria-label="ซูมออก" onClick={() => onZoom(-0.1)}>
          −
        </button>
      </div>
    </div>
  )
}
