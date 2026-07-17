export type ChatChannel = 'global' | 'room'

export interface ChatMessage {
  id: string
  channel: ChatChannel
  fromId: string
  fromName: string
  text: string
  at: number
  roomId?: string
}

export const CHAT_MAX = 80
