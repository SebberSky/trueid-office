import { useAppStore } from './store'
import { Login } from './components/Login'
import { CharacterCreator } from './components/CharacterCreator'
import { WorldView } from './components/WorldView'

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const session = useAppStore((s) => s.session)

  if (!session || screen === 'login') return <Login />
  if (screen === 'creator') return <CharacterCreator />
  return <WorldView />
}
