import { nanoid } from 'nanoid'
import type { ChatMessage } from './types'
import { CHAT_MAX } from './types'
import type { OfficeSocket } from '../net/OfficeSocket'
import type { ServerMsg } from '../../shared/protocol'
import { playChatIncoming } from '../media/sfx'

/** Campus-wide chat via multiplayer WebSocket. */
export class GlobalChatBus {
  private messages: ChatMessage[] = []
  private listeners = new Set<(msgs: ChatMessage[]) => void>()
  private selfId: string
  private net: OfficeSocket
  private unsub: () => void

  constructor(net: OfficeSocket, selfId: string) {
    this.net = net
    this.selfId = selfId
    this.unsub = net.subscribe((msg) => this.onServer(msg))
  }

  private onServer(msg: ServerMsg) {
    if (msg.type !== 'chat') return
    if (msg.message.fromId === this.selfId) return
    playChatIncoming()
    this.push(msg.message)
  }

  send(fromName: string, text: string) {
    const trimmed = text.trim().slice(0, 280)
    if (!trimmed) return
    const message: ChatMessage = {
      id: nanoid(8),
      channel: 'global',
      fromId: this.selfId,
      fromName,
      text: trimmed,
      at: Date.now(),
    }
    this.push(message)
    this.net.send({ type: 'chat', message })
  }

  getMessages() {
    return this.messages
  }

  subscribe(fn: (msgs: ChatMessage[]) => void) {
    this.listeners.add(fn)
    fn(this.messages)
    return () => this.listeners.delete(fn)
  }

  private push(msg: ChatMessage) {
    if (this.messages.some((m) => m.id === msg.id)) return
    this.messages = [...this.messages, msg].slice(-CHAT_MAX)
    this.listeners.forEach((fn) => fn(this.messages))
  }

  destroy() {
    this.unsub()
    this.listeners.clear()
  }
}
