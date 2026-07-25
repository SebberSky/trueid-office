import type {
  ActorPresence,
  CharacterLook,
  Facing,
  NpcPoseUpdate,
  PeerPresence,
} from '../src/types'
import type { ChatMessage, DmMessage, PinnedMessage } from '../src/chat/types'
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
  | { type: 'presence'; peer: ActorPresence }
  | { type: 'leave'; id: string }
  | { type: 'signal'; to: string; data: SignalData }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'dm'; message: DmMessage }
  | { type: 'activity'; event: ActivityEvent }
  | { type: 'room-lock'; roomId: string; locked: boolean }
  | {
      type: 'room-pin'
      roomId: string
      /** Pin this message, or null to unpin. */
      message: ChatMessage | null
    }
  | { type: 'fallguys-start'; zoneIds?: string[] }
  | { type: 'fallguys-restart'; zoneIds?: string[] }
  | { type: 'fallguys-quit' }
  | { type: 'fallguys-progress'; raceId: number; progress: number; finished: boolean }
  | { type: 'xo-start'; zoneIds?: string[] }
  | { type: 'xo-restart'; zoneIds?: string[] }
  | { type: 'xo-quit' }
  | { type: 'xo-move'; gameId: number; cell: number }
  /** Start a 1:1 NPC dialogue session (server attaches actor context). */
  | { type: 'interact-start'; npcId: string }
  | { type: 'interact-choose'; sessionId: string; optionId: string }
  | { type: 'interact-end'; sessionId: string }

/** Server → Client */
export type ServerMsg =
  | {
      type: 'welcome'
      peers: ActorPresence[]
      lockedRooms: string[]
      pinnedMessages: PinnedMessage[]
      fallguys?: FallGuysLobbyState
      fallguysRace?: FallGuysActiveRace | null
      xo?: XoLobbyState
      xoGame?: XoActiveGame | null
      /** Last known map pose for this email (restored across devices). */
      lastPose?: SavedPoseMsg | null
    }
  | { type: 'presence'; peer: ActorPresence }
  /** Batched NPC movement — only NPCs that actually moved this tick. */
  | { type: 'npc-sync'; poses: NpcPoseUpdate[] }
  | { type: 'leave'; id: string }
  | { type: 'signal'; from: string; data: SignalData }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'dm'; message: DmMessage }
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
  /** Immediate reply to xo-start / xo-restart so clients can detect a silent server. */
  | { type: 'xo-ack'; ok: boolean; phase: string; zone: number; detail?: string }
  /** Another device logged in with the same email — this socket must stop. */
  | { type: 'session-replaced'; reason?: string }
  /** Host is about to restart (pm2) — clients should prepare to refresh. */
  | { type: 'server-updating'; inSec: number; at: number }
  | {
      type: 'interact-started'
      sessionId: string
      npcId: string
      npcKey: string
      displayName: string
    }
  | {
      type: 'interact-ended'
      sessionId: string
      reason: 'client' | 'disconnect' | 'idle' | 'replaced' | 'error' | 'rejected'
    }
  /**
   * Dialogue turn stream. Scripted replies may arrive as a single `done`;
   * LLM/API providers (Phase 3+) can emit multiple `delta` chunks then `done`.
   */
  | {
      type: 'npc-dialogue'
      sessionId: string
      phase: 'delta' | 'done'
      text?: string
      /** Present on `done` when the player may pick a response. */
      choices?: {
        id: string
        label: string
        /** How the destination node resolves after this choice is selected. */
        responseMode?: 'immediate' | 'async'
      }[]
      nodeId?: string
    }
  | { type: 'interact-error'; message: string }
  | { type: 'error'; message: string }

export type {
  SignalData,
  CharacterLook,
  ActorPresence,
  NpcPoseUpdate,
  PeerPresence,
  ChatMessage,
  PinnedMessage,
  ActivityEvent,
}
export type { DmMessage } from '../src/chat/types'
