import { useState, type FormEvent } from 'react'
import { useAppStore } from '../store'
import './Login.css'

export function Login() {
  const login = useAppStore((s) => s.login)
  const loginError = useAppStore((s) => s.loginError)
  const loginBusy = useAppStore((s) => s.loginBusy)
  const [email, setEmail] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    await login(email)
  }

  return (
    <div className="login">
      <div className="login__atmosphere" aria-hidden />
      <div className="login__grid" aria-hidden />

      <main className="login__hero">
        <p className="login__eyebrow">True Digital · Muze</p>
        <h1 className="login__brand">
          TrueID
          <span>Office</span>
        </h1>
        <p className="login__tagline">
          Virtual workspace สำหรับทีม — สร้างตัวละคร เดินบนแมพ และคุยในห้องจำกัดพื้นที่
        </p>

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
        <div className="login__map-preview">
          <div className="tile grass" />
          <div className="tile path" />
          <div className="tile water" />
          <div className="tile floor" />
          <div className="tile rock" />
          <div className="tile plant" />
          <div className="avatar a1" />
          <div className="avatar a2" />
          <div className="room-glow" />
        </div>
      </aside>
    </div>
  )
}
