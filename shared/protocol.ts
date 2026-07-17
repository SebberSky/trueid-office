import type { CharacterLook, PeerPresence } from '../src/types'
import type { ChatMessage } from '../src/chat/types'
import type { ActivityEvent } from '../src/chat/RoomActivity'
import type { SignalData } from '../src/presence/bus'

/** Client → Server */
export type ClientMsg =
  | { type: 'hello'; id: string; email: string; look: CharacterLook }
  | { type: 'presence'; peer: PeerPresence }
  | { type: 'leave'; id: string }
  | { type: 'signal'; to: string; data: SignalData }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'activity'; event: ActivityEvent }

/** Server → Client */
export type ServerMsg =
  | { type: 'welcome'; peers: PeerPresence[] }
  | { type: 'presence'; peer: PeerPresence }
  | { type: 'leave'; id: string }
  | { type: 'signal'; from: string; data: SignalData }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'activity'; event: ActivityEvent }
  | { type: 'error'; message: string }

export type { SignalData, CharacterLook, PeerPresence, ChatMessage, ActivityEvent }
