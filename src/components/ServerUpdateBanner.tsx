import { useEffect, useRef, useState } from 'react'
import './ServerUpdateBanner.css'

interface Props {
  /** Seconds to wait before auto-refresh. */
  inSec: number
  /** Server timestamp (unused for local countdown — avoid clock skew). */
  at?: number
}

/**
 * Invites the user to wait through a countdown, then hard-reloads.
 */
export function ServerUpdateBanner({ inSec }: Props) {
  const endsAtRef = useRef(Date.now() + Math.max(1, inSec) * 1000)
  const totalSec = Math.max(1, Math.ceil(inSec))
  const [left, setLeft] = useState(totalSec)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const endsAt = endsAtRef.current
    const id = window.setInterval(() => {
      const sec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setLeft(sec)
      if (sec <= 0) {
        window.clearInterval(id)
        setRefreshing(true)
        window.location.reload()
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const progress = 1 - left / totalSec
  const r = 54
  const c = 2 * Math.PI * r
  const dash = c * Math.min(1, Math.max(0, progress))

  return (
    <div className="server-update" role="alertdialog" aria-live="assertive" aria-modal="true">
      <div className="server-update__card">
        <p className="server-update__eyebrow">อัปเดตเซิร์ฟเวอร์</p>
        <h2>{refreshing ? 'กำลังรีเฟรช…' : 'เตรียมรีเฟรชหน้าเว็บ'}</h2>
        <p className="server-update__invite">
          {refreshing
            ? 'ดึงเวอร์ชันใหม่ให้อัตโนมัติ'
            : 'นับถอยหลังจบแล้วระบบจะรีเฟรชให้เอง — ไม่ต้องปิดแท็บ'}
        </p>

        <div className="server-update__ring" aria-hidden={refreshing}>
          <svg viewBox="0 0 120 120" width="140" height="140">
            <circle className="server-update__ring-bg" cx="60" cy="60" r={r} />
            <circle
              className="server-update__ring-fg"
              cx="60"
              cy="60"
              r={r}
              strokeDasharray={`${dash} ${c}`}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="server-update__ring-label">
            {refreshing ? (
              <span className="server-update__spin">↻</span>
            ) : (
              <>
                <strong>{left}</strong>
                <span>วินาที</span>
              </>
            )}
          </div>
        </div>

        {!refreshing && (
          <button
            type="button"
            className="server-update__now"
            onClick={() => {
              setRefreshing(true)
              window.location.reload()
            }}
          >
            รีเฟรชเลย
          </button>
        )}
      </div>
    </div>
  )
}
