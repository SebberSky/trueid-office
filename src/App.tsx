import { lazy, Suspense } from 'react'
import { useAppStore } from './store'
import { Login } from './components/Login'
import { CharacterCreator } from './components/CharacterCreator'

const WorldView = lazy(() =>
  import('./components/WorldView').then((m) => ({ default: m.WorldView })),
)

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const session = useAppStore((s) => s.session)

  if (!session || screen === 'login') return <Login />
  if (screen === 'creator') return <CharacterCreator />
  return (
    <Suspense fallback={<div className="app-loading">กำลังโหลดออฟฟิศ…</div>}>
      <WorldView />
    </Suspense>
  )
}
