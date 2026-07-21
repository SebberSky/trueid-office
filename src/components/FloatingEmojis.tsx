import { useEffect, useRef, useState } from 'react'
import './FloatingEmojis.css'

export interface FloatEmojiItem {
  id: string
  emoji: string
  fromId: string
  fromName: string
}

interface Props {
  items: FloatEmojiItem[]
  /** Canvas UV (0–1, top-left origin) for the sender's head. */
  getAnchor: (fromId: string) => { x: number; y: number } | null
  onDone: (id: string) => void
}

export function FloatingEmojis({ items, getAnchor, onDone }: Props) {
  return (
    <div className="float-emojis" aria-hidden>
      {items.map((item) => (
        <FloatOne key={item.id} item={item} getAnchor={getAnchor} onDone={onDone} />
      ))}
    </div>
  )
}

function FloatOne({
  item,
  getAnchor,
  onDone,
}: {
  item: FloatEmojiItem
  getAnchor: (fromId: string) => { x: number; y: number } | null
  onDone: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(false)
  const getAnchorRef = useRef(getAnchor)
  getAnchorRef.current = getAnchor

  useEffect(() => {
    const t = window.setTimeout(() => {
      setGone(true)
      onDone(item.id)
    }, 2400)
    return () => clearTimeout(t)
  }, [item.id, onDone])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = ref.current
      const pos = getAnchorRef.current(item.fromId)
      if (el && pos) {
        el.style.left = `${pos.x * 100}%`
        el.style.top = `${pos.y * 100}%`
        el.style.visibility = 'visible'
      } else if (el) {
        el.style.visibility = 'hidden'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [item.fromId])

  if (gone) return null

  return (
    <div ref={ref} className="float-emojis__item">
      <span className="float-emojis__emoji">{item.emoji}</span>
    </div>
  )
}
