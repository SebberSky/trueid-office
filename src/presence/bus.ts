import type { Facing, PeerPresence, CharacterLook } from '../types'
import type { OfficeSocket } from '../net/OfficeSocket'
import type { ServerMsg } from '../../shared/protocol'

/** Idle keep-alive so peers do not expire while standing still. */
const HEARTBEAT_MS = 1000
/** While walking, push position often enough that remote lerp stays smooth. */
const MOVE_SEND_MS = 50
const STALE_MS = 2500

export type SignalData =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit; roomId: string }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

/** Multiplayer presence + WebRTC signaling over the shared OfficeSocket. */
export class PresenceBus {
  private peers = new Map<string, PeerPresence>()
  private listeners = new Set<() => void>()
  private signalListeners = new Set<(from: string, data: SignalData) => void>()
  private selfId: string
  private net: OfficeSocket
  private unsub: () => void
  private unsubOpen: (() => void) | null = null
  private hello: { email: string; look: CharacterLook } | null = null

  constructor(net: OfficeSocket, selfId: string, hello?: { email: string; look: CharacterLook }) {
    this.net = net
    this.selfId = selfId
    this.hello = hello ?? null
    this.unsub = net.subscribe((msg) => this.onServer(msg))
    // Re-send hello on every socket open so server always has client.id after reconnect.
    this.unsubOpen = net.onOpen(() => this.sendHello())
  }

  private sendHello() {
    if (!this.hello) return
    this.net.send({
      type: 'hello',
      id: this.selfId,
      email: this.hello.email,
      look: this.hello.look,
    })
  }

  private onServer(msg: ServerMsg) {
    if (msg.type === 'welcome') {
      for (const p of msg.peers) {
        if (p.id !== this.selfId) this.peers.set(p.id, p)
      }
      this.emit()
      return
    }
    if (msg.type === 'presence' && msg.peer.id !== this.selfId) {
      this.peers.set(msg.peer.id, msg.peer)
      this.emit()
      return
    }
    if (msg.type === 'leave' && msg.id !== this.selfId) {
      this.peers.delete(msg.id)
      this.emit()
      return
    }
    if (msg.type === 'signal') {
      this.signalListeners.forEach((fn) => fn(msg.from, msg.data))
    }
  }

  publish(peer: PeerPresence) {
    this.net.send({ type: 'presence', peer })
  }

  leave(id: string) {
    this.net.send({ type: 'leave', id })
  }

  sendSignal(to: string, data: SignalData) {
    this.net.send({ type: 'signal', to, data })
  }

  getPeers(): PeerPresence[] {
    const now = Date.now()
    for (const [id, p] of this.peers) {
      if (now - p.updatedAt > STALE_MS) this.peers.delete(id)
    }
    return [...this.peers.values()]
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onSignal(fn: (from: string, data: SignalData) => void) {
    this.signalListeners.add(fn)
    return () => this.signalListeners.delete(fn)
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  destroy() {
    this.unsub()
    this.unsubOpen?.()
    this.listeners.clear()
    this.signalListeners.clear()
  }
}

export function makePresence(
  id: string,
  email: string,
  look: CharacterLook,
  x: number,
  y: number,
  facing: Facing,
  roomId: string | null,
  voiceOn: boolean,
  sharing: boolean,
  jumpAt?: number,
  fireAt?: number,
  crouching?: boolean,
  biteAt?: number,
  fishCast?: { x: number; y: number } | null,
  spitAt?: number,
  slapAt?: number,
): PeerPresence {
  return {
    id,
    email,
    look,
    x,
    y,
    facing,
    roomId,
    voiceOn,
    sharing,
    jumpAt,
    fireAt,
    spitAt,
    biteAt,
    slapAt,
    crouching,
    fishX: fishCast?.x,
    fishY: fishCast?.y,
    updatedAt: Date.now(),
  }
}

export { HEARTBEAT_MS, MOVE_SEND_MS }
