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

/** One pinned message per room (server-authoritative until unpinned). */
export interface PinnedMessage {
  roomId: string
  messageId: string
  text: string
  fromId: string
  fromName: string
  at: number
  pinnedById: string
  pinnedByName: string
  pinnedAt: number
}

export const CHAT_MAX = 80

export function normalizeChatUrl(raw: string): string | null {
  const trimmed = raw.replace(/[),.!?;:'"]+$/g, '')
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}
