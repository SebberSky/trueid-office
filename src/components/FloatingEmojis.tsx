import { useEffect, useState } from 'react'
import './FloatingEmojis.css'

export interface FloatEmojiItem {
  id: string
  emoji: string
  x: number
  fromName: string
}

interface Props {
  items: FloatEmojiItem[]
  onDone: (id: string) => void
}

export function FloatingEmojis({ items, onDone }: Props) {
  return (
    <div className="float-emojis" aria-hidden>
      {items.map((item) => (
        <FloatOne key={item.id} item={item} onDone={onDone} />
      ))}
    </div>
  )
}

function FloatOne({ item, onDone }: { item: FloatEmojiItem; onDone: (id: string) => void }) {
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setGone(true)
      onDone(item.id)
    }, 2400)
    return () => clearTimeout(t)
  }, [item.id, onDone])

  if (gone) return null

  return (
    <div className="float-emojis__item" style={{ left: `${item.x * 100}%` }}>
      <span className="float-emojis__emoji">{item.emoji}</span>
      <span className="float-emojis__name">{item.fromName}</span>
    </div>
  )
}
