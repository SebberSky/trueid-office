import { useMemo, useState, type FormEvent } from 'react'
import { useAppStore } from '../store'
import { readPendingRoomIdFromUrl } from '../world/roomLink'
import { generateWorld } from '../world/terrain'
import './Login.css'

export function Login() {
  const login = useAppStore((s) => s.login)
  const loginError = useAppStore((s) => s.loginError)
  const loginBusy = useAppStore((s) => s.loginBusy)
  const [email, setEmail] = useState('')
  const inviteRoomName = useMemo(() => {
    const id = readPendingRoomIdFromUrl()
    if (!id) return null
    return generateWorld(20260717).rooms.find((r) => r.id === id)?.name ?? null
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await login(email)
  }

  return (
    <div className="login">
      <div className="login__sky" aria-hidden />
      <div className="login__voxel-grid" aria-hidden />

      <main className="login__hero">
        <img className="login__logo" src="/favicon.svg" alt="" width={72} height={72} />
        <h1 className="login__brand">
          TrueID
          <span>Office</span>
        </h1>
        <p className="login__tagline">
          เข้าออฟฟิศเสมือนจริง — สร้างตัวละครบล็อกๆ เดินบนแมพ และคุยในห้อง
        </p>
        {inviteRoomName && (
          <p className="login__invite" role="status">
            คุณถูกเชิญเข้าห้อง <strong>{inviteRoomName}</strong> — ล็อกอินแล้วจะพาไปห้องนั้นอัตโนมัติ
          </p>
        )}

        <form className="login__form" onSubmit={onSubmit}>
          <label htmlFor="email">อีเมลองค์กร</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@truedigital.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {loginError && <p className="login__error" role="alert">{loginError}</p>}
          <button type="submit" disabled={loginBusy}>
            {loginBusy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ Office'}
          </button>
          <p className="login__hint">อนุญาตเฉพาะ @truedigital.com และ @muze.co.th</p>
        </form>
      </main>

      <aside className="login__visual" aria-hidden>
        <div className="login__campus">
          <div className="login__campus-sky" />
          <div className="login__tiles">
            <span className="vt grass" />
            <span className="vt grass" />
            <span className="vt path" />
            <span className="vt grass" />
            <span className="vt water" />
            <span className="vt water" />
            <span className="vt path" />
            <span className="vt floor" />
            <span className="vt floor" />
            <span className="vt rock" />
            <span className="vt plant" />
            <span className="vt grass" />
            <span className="vt path" />
            <span className="vt floor" />
            <span className="vt plaza" />
            <span className="vt plant" />
          </div>
          <div className="login__block-avatar a1">
            <i className="head" />
            <i className="body" />
            <i className="leg l" />
            <i className="leg r" />
          </div>
          <div className="login__block-avatar a2">
            <i className="head" />
            <i className="body teal" />
            <i className="leg l" />
            <i className="leg r" />
          </div>
          <div className="login__building">
            <span className="roof" />
            <span className="wall" />
            <span className="win w1" />
            <span className="win w2" />
            <span className="door" />
          </div>
        </div>
      </aside>
    </div>
  )
}
