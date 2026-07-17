import { lazy, Suspense, useEffect, useState } from 'react'
import { useAppStore } from './store'
import { Login } from './components/Login'
import { CharacterCreator } from './components/CharacterCreator'

const WorldView = lazy(() =>
  import('./components/WorldView').then((m) => ({ default: m.WorldView })),
)

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const session = useAppStore((s) => s.session)
  /** Keep the office (and WebRTC) alive while editing character. */
  const [officeMounted, setOfficeMounted] = useState(false)

  useEffect(() => {
    if (screen === 'world') setOfficeMounted(true)
    if (!session) setOfficeMounted(false)
  }, [screen, session])

  if (!session || screen === 'login') return <Login />

  const showOffice = screen === 'world' || (officeMounted && screen === 'creator')

  return (
    <>
      {showOffice && (
        <div
          className={screen === 'world' ? 'app-world' : 'app-world is-suspended'}
          aria-hidden={screen !== 'world'}
        >
          <Suspense fallback={<div className="app-loading">กำลังโหลดออฟฟิศ…</div>}>
            <WorldView />
          </Suspense>
        </div>
      )}
      {screen === 'creator' && <CharacterCreator />}
    </>
  )
}
