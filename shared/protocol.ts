import type { CharacterLook, Facing, PeerPresence } from '../src/types'
import type { ChatMessage, PinnedMessage } from '../src/chat/types'
import type { ActivityEvent } from '../src/chat/RoomActivity'
import type { SignalData } from '../src/presence/bus'
import type {
  FallGuysLobbyState,
  FallGuysRaceOver,
  FallGuysRaceStart,
  FallGuysRaceUpdate,
  FallGuysActiveRace,
} from '../src/fallguys/types'
import type {
  XoActiveGame,
  XoGameOver,
  XoGameStart,
  XoGameUpdate,
  XoLobbyState,
} from '../src/xo/types'

export type SavedPoseMsg = { x: number; y: number; facing: Facing }

/** Client → Server */
export type ClientMsg =
  | { type: 'hello'; id: string; email: string; look: CharacterLook }
  | { type: 'presence'; peer: PeerPresence }
  | { type: 'leave'; id: string }
  | { type: 'signal'; to: string; data: SignalData }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'activity'; event: ActivityEvent }
  | { type: 'room-lock'; roomId: string; locked: boolean }
  | {
      type: 'room-pin'
      roomId: string
      /** Pin this message, or null to unpin. */
      message: ChatMessage | null
    }
  | { type: 'fallguys-start' }
  | { type: 'fallguys-restart' }
  | { type: 'fallguys-quit' }
  | { type: 'fallguys-progress'; raceId: number; progress: number; finished: boolean }
  | { type: 'xo-start' }
  | { type: 'xo-restart' }
  | { type: 'xo-quit' }
  | { type: 'xo-move'; gameId: number; cell: number }

/** Server → Client */
export type ServerMsg =
  | {
      type: 'welcome'
      peers: PeerPresence[]
      lockedRooms: string[]
      pinnedMessages: PinnedMessage[]
      fallguys?: FallGuysLobbyState
      fallguysRace?: FallGuysActiveRace | null
      xo?: XoLobbyState
      xoGame?: XoActiveGame | null
      /** Last known map pose for this email (restored across devices). */
      lastPose?: SavedPoseMsg | null
    }
  | { type: 'presence'; peer: PeerPresence }
  | { type: 'leave'; id: string }
  | { type: 'signal'; from: string; data: SignalData }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'activity'; event: ActivityEvent }
  | { type: 'room-lock'; roomId: string; locked: boolean; byId: string; byName: string }
  | {
      type: 'room-pin'
      roomId: string
      pinned: PinnedMessage | null
      byId: string
      byName: string
    }
  | { type: 'fallguys-lobby'; lobby: FallGuysLobbyState }
  | { type: 'fallguys-race-start'; race: FallGuysRaceStart }
  | { type: 'fallguys-race-update'; update: FallGuysRaceUpdate }
  | { type: 'fallguys-race-over'; result: FallGuysRaceOver }
  | { type: 'fallguys-race-state'; state: FallGuysActiveRace }
  | { type: 'xo-lobby'; lobby: XoLobbyState }
  | { type: 'xo-game-start'; game: XoGameStart }
  | { type: 'xo-game-update'; update: XoGameUpdate }
  | { type: 'xo-game-over'; result: XoGameOver }
  | { type: 'xo-game-state'; state: XoActiveGame }
  /** Another device logged in with the same email — this socket must stop. */
  | { type: 'session-replaced'; reason?: string }
  | { type: 'error'; message: string }

export type { SignalData, CharacterLook, PeerPresence, ChatMessage, PinnedMessage, ActivityEvent }
