import { nanoid } from 'nanoid'
import type { DmMessage } from './types'
import { loadDmThread, saveDmThread } from './dmCookie'
import type { OfficeSocket } from '../net/OfficeSocket'
import type { ServerMsg } from '../../shared/protocol'

type ThreadState = {
  peerId: string
  peerName: string
  messages: DmMessage[]
}

type Listener = (thread: ThreadState | null) => void

/** 1:1 DM via WebSocket relay; history persisted in per-peer cookies (24h). */
export class DmChatBus {
  private selfId: string
  private net: OfficeSocket
  private unsub: () => void
  private active: ThreadState | null = null
  private listeners = new Set<Listener>()
  /** Unread count while a thread is closed / another peer is open. */
  private unread = new Map<string, number>()
  private unreadListeners = new Set<() => void>()

  constructor(net: OfficeSocket, selfId: string) {
    this.net = net
    this.selfId = selfId
    this.unsub = net.subscribe((msg) => this.onServer(msg))
  }

  open(peerId: string, peerName: string) {
    if (peerId === this.selfId) return
    const stored = loadDmThread(peerId)
    this.active = {
      peerId,
      peerName: peerName || stored.peerName || 'ผู้เล่น',
      messages: stored.messages,
    }
    this.unread.set(peerId, 0)
    this.emit()
    this.emitUnread()
  }

  close() {
    this.active = null
    this.emit()
  }

  getActive() {
    return this.active
  }

  getUnread(peerId: string) {
    return this.unread.get(peerId) ?? 0
  }

  send(fromName: string, text: string) {
    const thread = this.active
    if (!thread) return
    const trimmed = text.trim().slice(0, 280)
    if (!trimmed) return
    const message: DmMessage = {
      id: nanoid(8),
      fromId: this.selfId,
      fromName,
      toId: thread.peerId,
      text: trimmed,
      at: Date.now(),
    }
    this.pushLocal(message, thread.peerName)
    this.net.send({ type: 'dm', message })
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn(this.active)
    return () => this.listeners.delete(fn)
  }

  subscribeUnread(fn: () => void) {
    this.unreadListeners.add(fn)
    fn()
    return () => this.unreadListeners.delete(fn)
  }

  private onServer(msg: ServerMsg) {
    if (msg.type !== 'dm') return
    const m = msg.message
    if (m.fromId === this.selfId) return
    // Incoming: we are the recipient
    if (m.toId !== this.selfId) return
    const peerId = m.fromId
    const peerName = m.fromName || 'ผู้เล่น'

    if (this.active?.peerId === peerId) {
      this.pushLocal(m, peerName)
    } else {
      const stored = loadDmThread(peerId)
      const messages = [...stored.messages, m].filter(
        (x, i, arr) => arr.findIndex((y) => y.id === x.id) === i,
      )
      saveDmThread(peerId, peerName || stored.peerName, messages)
      this.unread.set(peerId, (this.unread.get(peerId) ?? 0) + 1)
      this.emitUnread()
    }
  }

  private pushLocal(message: DmMessage, peerName: string) {
    const thread = this.active
    if (!thread) return
    if (thread.messages.some((m) => m.id === message.id)) return
    thread.peerName = peerName || thread.peerName
    thread.messages = [...thread.messages, message]
    saveDmThread(thread.peerId, thread.peerName, thread.messages)
    this.emit()
  }

  private emit() {
    const snap = this.active
      ? {
          peerId: this.active.peerId,
          peerName: this.active.peerName,
          messages: this.active.messages,
        }
      : null
    this.listeners.forEach((fn) => fn(snap))
  }

  private emitUnread() {
    this.unreadListeners.forEach((fn) => fn())
  }

  destroy() {
    this.unsub()
    this.listeners.clear()
    this.unreadListeners.clear()
  }
}
