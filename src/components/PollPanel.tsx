import { useMemo, useState, type FormEvent } from 'react'
import type { Poll } from '../chat/RoomActivity'
import './PollPanel.css'

interface Props {
  open: boolean
  poll: Poll | null
  selfId: string
  onClose: () => void
  onCreate: (question: string, options: string[]) => void
  onVote: (optionIndex: number) => void
}

export function PollPanel({ open, poll, selfId, onClose, onCreate, onVote }: Props) {
  const [question, setQuestion] = useState('')
  const [optA, setOptA] = useState('')
  const [optB, setOptB] = useState('')
  const [optC, setOptC] = useState('')

  const tallies = useMemo(() => {
    if (!poll) return []
    const counts = poll.options.map(() => 0)
    for (const idx of Object.values(poll.votes)) {
      if (idx >= 0 && idx < counts.length) counts[idx]++
    }
    const total = counts.reduce((a, b) => a + b, 0) || 1
    return counts.map((c) => ({ count: c, pct: Math.round((c / total) * 100) }))
  }, [poll])

  if (!open) return null

  function submitCreate(e: FormEvent) {
    e.preventDefault()
    const opts = [optA, optB, optC].map((s) => s.trim()).filter(Boolean)
    if (!question.trim() || opts.length < 2) return
    onCreate(question, opts)
    setQuestion('')
    setOptA('')
    setOptB('')
    setOptC('')
  }

  return (
    <div className="poll">
      <div className="poll__head">
        <strong>Poll</strong>
        <button type="button" className="poll__close" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>

      {poll ? (
        <div className="poll__body">
          <p className="poll__q">{poll.question}</p>
          <p className="poll__by">โดย {poll.createdByName}</p>
          <ul className="poll__opts">
            {poll.options.map((opt, i) => {
              const voted = poll.votes[selfId] === i
              const { count, pct } = tallies[i] ?? { count: 0, pct: 0 }
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={voted ? 'poll__opt on' : 'poll__opt'}
                    onClick={() => onVote(i)}
                  >
                    <span className="poll__opt-label">{opt}</span>
                    <span className="poll__opt-meta">
                      {count} · {pct}%
                    </span>
                    <span className="poll__bar" style={{ width: `${pct}%` }} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <form className="poll__create" onSubmit={submitCreate}>
          <label>
            คำถาม
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="อยากโหวตเรื่องอะไร?"
              maxLength={120}
              required
            />
          </label>
          <label>
            ตัวเลือก 1
            <input value={optA} onChange={(e) => setOptA(e.target.value)} maxLength={60} required />
          </label>
          <label>
            ตัวเลือก 2
            <input value={optB} onChange={(e) => setOptB(e.target.value)} maxLength={60} required />
          </label>
          <label>
            ตัวเลือก 3 (ไม่บังคับ)
            <input value={optC} onChange={(e) => setOptC(e.target.value)} maxLength={60} />
          </label>
          <button type="submit">สร้าง Poll</button>
        </form>
      )}
    </div>
  )
}
