import { nanoid } from 'nanoid'
import type { PresenceBus, SignalData } from '../presence/bus'
import type { ChatMessage } from '../chat/types'
import { CHAT_MAX } from '../chat/types'

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

type RoomChatWire = { type: 'room-chat'; message: ChatMessage }

/**
 * Mesh WebRTC for peers in the same room (BroadcastChannel signaling).
 * Voice, screen share, and room chat via RTCDataChannel.
 */
export class RoomMedia {
  private bus: PresenceBus
  private selfId: string
  private roomId: string | null = null
  private localStream: MediaStream | null = null
  private screenStream: MediaStream | null = null
  private pcs = new Map<string, RTCPeerConnection>()
  private channels = new Map<string, RTCDataChannel>()
  private remoteStreams = new Map<string, MediaStream>()
  private roomMessages: ChatMessage[] = []
  private onRemotes: (streams: Map<string, MediaStream>) => void
  private onScreen: (stream: MediaStream | null, fromId: string | null) => void
  private onRoomChat: (msgs: ChatMessage[]) => void
  private unsubSignal: (() => void) | null = null
  private makingOffer = new Set<string>()

  constructor(
    bus: PresenceBus,
    selfId: string,
    onRemotes: (streams: Map<string, MediaStream>) => void,
    onScreen: (stream: MediaStream | null, fromId: string | null) => void,
    onRoomChat: (msgs: ChatMessage[]) => void,
  ) {
    this.bus = bus
    this.selfId = selfId
    this.onRemotes = onRemotes
    this.onScreen = onScreen
    this.onRoomChat = onRoomChat
    this.unsubSignal = bus.onSignal((from, data) => void this.handleSignal(from, data))
  }

  getRoomMessages() {
    return this.roomMessages
  }

  clearRoomChat() {
    this.roomMessages = []
    this.onRoomChat(this.roomMessages)
  }

  getLocalStream() {
    return this.localStream
  }

  getScreenStream() {
    return this.screenStream
  }

  /** All live audio tracks: local mic, screen tab audio, remote peers. */
  collectAudioStreams(): MediaStream[] {
    const out: MediaStream[] = []
    if (this.localStream?.getAudioTracks().some((t) => t.readyState === 'live')) {
      out.push(this.localStream)
    }
    if (this.screenStream) {
      const tabAudio = this.screenStream.getAudioTracks().filter((t) => t.readyState === 'live')
      if (tabAudio.length) out.push(new MediaStream(tabAudio))
    }
    for (const pc of this.pcs.values()) {
      const tracks = pc
        .getReceivers()
        .map((r) => r.track)
        .filter((t): t is MediaStreamTrack => !!t && t.kind === 'audio' && t.readyState === 'live')
      if (tracks.length) out.push(new MediaStream(tracks))
    }
    return out
  }

  sendRoomChat(fromName: string, text: string, roomId: string) {
    const trimmed = text.trim().slice(0, 280)
    if (!trimmed || !this.roomId) return
    const message: ChatMessage = {
      id: nanoid(8),
      channel: 'room',
      fromId: this.selfId,
      fromName,
      text: trimmed,
      at: Date.now(),
      roomId,
    }
    this.pushRoomChat(message)
    const payload: RoomChatWire = { type: 'room-chat', message }
    const raw = JSON.stringify(payload)
    for (const ch of this.channels.values()) {
      if (ch.readyState === 'open') ch.send(raw)
    }
  }

  async setVoice(on: boolean) {
    if (on) {
      if (!this.localStream) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        })
      }
      for (const pc of this.pcs.values()) {
        for (const track of this.localStream.getTracks()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === track.kind)
          if (sender) await sender.replaceTrack(track)
          else pc.addTrack(track, this.localStream)
        }
      }
    } else if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
      for (const pc of this.pcs.values()) {
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'audio') await sender.replaceTrack(null)
        }
      }
    }
  }

  async startScreenShare() {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })
    this.screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      void this.stopScreenShare()
    })
    this.onScreen(this.screenStream, this.selfId)

    for (const [, pc] of this.pcs) {
      for (const track of this.screenStream.getTracks()) {
        pc.addTrack(track, this.screenStream)
      }
    }
  }

  async stopScreenShare() {
    this.screenStream?.getTracks().forEach((t) => t.stop())
    this.screenStream = null
    this.onScreen(null, null)
    for (const pc of this.pcs.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind === 'video') {
          await sender.replaceTrack(null)
        }
      }
    }
  }

  async syncRoom(roomId: string | null, peerIdsInRoom: string[]) {
    const prev = this.roomId
    this.roomId = roomId

    if (!roomId) {
      await this.teardownAll()
      this.clearRoomChat()
      return
    }

    if (prev && prev !== roomId) {
      await this.teardownAll()
      this.clearRoomChat()
    }

    for (const peerId of peerIdsInRoom) {
      if (peerId === this.selfId) continue
      if (!this.pcs.has(peerId) && this.selfId < peerId) {
        await this.createOffer(peerId)
      }
    }

    for (const id of [...this.pcs.keys()]) {
      if (!peerIdsInRoom.includes(id)) {
        this.closePeer(id)
      }
    }
  }

  private async createOffer(peerId: string) {
    const pc = this.ensurePc(peerId, true)
    this.makingOffer.add(peerId)
    try {
      this.attachTracks(pc)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const ld = pc.localDescription!
      this.bus.sendSignal(peerId, {
        kind: 'offer',
        sdp: { type: ld.type, sdp: ld.sdp },
        roomId: this.roomId!,
      })
    } finally {
      this.makingOffer.delete(peerId)
    }
  }

  private attachTracks(pc: RTCPeerConnection) {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        if (!pc.getSenders().some((s) => s.track === track)) {
          pc.addTrack(track, this.localStream)
        }
      }
    }
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        if (!pc.getSenders().some((s) => s.track === track)) {
          pc.addTrack(track, this.screenStream)
        }
      }
    }
  }

  private ensurePc(peerId: string, createChannel = false) {
    let pc = this.pcs.get(peerId)
    if (pc) {
      if (createChannel && !this.channels.has(peerId)) {
        this.bindChannel(peerId, pc.createDataChannel('room-chat', { ordered: true }))
      }
      return pc
    }
    pc = new RTCPeerConnection(ICE)
    this.pcs.set(peerId, pc)

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.bus.sendSignal(peerId, { kind: 'ice', candidate: ev.candidate.toJSON() })
      }
    }

    pc.ontrack = (ev) => {
      let stream = this.remoteStreams.get(peerId)
      if (!stream) {
        stream = new MediaStream()
        this.remoteStreams.set(peerId, stream)
      }
      if (!stream.getTracks().some((t) => t.id === ev.track.id)) {
        stream.addTrack(ev.track)
      }
      this.onRemotes(new Map(this.remoteStreams))
      if (ev.track.kind === 'video') {
        this.onScreen(new MediaStream([ev.track]), peerId)
      }
    }

    pc.ondatachannel = (ev) => {
      this.bindChannel(peerId, ev.channel)
    }

    if (createChannel) {
      this.bindChannel(peerId, pc.createDataChannel('room-chat', { ordered: true }))
    }

    pc.onconnectionstatechange = () => {
      if (pc!.connectionState === 'failed' || pc!.connectionState === 'closed') {
        this.closePeer(peerId)
      }
    }

    return pc
  }

  private bindChannel(peerId: string, channel: RTCDataChannel) {
    this.channels.set(peerId, channel)
    channel.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as RoomChatWire
        if (data.type === 'room-chat' && data.message?.channel === 'room') {
          this.pushRoomChat(data.message)
        }
      } catch {
        /* ignore */
      }
    }
  }

  private pushRoomChat(msg: ChatMessage) {
    if (this.roomMessages.some((m) => m.id === msg.id)) return
    this.roomMessages = [...this.roomMessages, msg].slice(-CHAT_MAX)
    this.onRoomChat(this.roomMessages)
  }

  private async handleSignal(from: string, data: SignalData) {
    if (data.kind === 'offer') {
      if (this.roomId && data.roomId !== this.roomId) return
      const pc = this.ensurePc(from, false)
      if (this.makingOffer.has(from)) return
      await pc.setRemoteDescription(data.sdp)
      this.attachTracks(pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      const ld = pc.localDescription!
      this.bus.sendSignal(from, { kind: 'answer', sdp: { type: ld.type, sdp: ld.sdp } })
    } else if (data.kind === 'answer') {
      const pc = this.pcs.get(from)
      if (!pc) return
      await pc.setRemoteDescription(data.sdp)
    } else if (data.kind === 'ice') {
      const pc = this.pcs.get(from)
      if (!pc) return
      try {
        await pc.addIceCandidate(data.candidate)
      } catch {
        /* ignore */
      }
    }
  }

  private closePeer(id: string) {
    this.channels.get(id)?.close()
    this.channels.delete(id)
    this.pcs.get(id)?.close()
    this.pcs.delete(id)
    this.remoteStreams.delete(id)
    this.onRemotes(new Map(this.remoteStreams))
  }

  private async teardownAll() {
    for (const id of [...this.pcs.keys()]) this.closePeer(id)
  }

  async destroy() {
    await this.setVoice(false)
    await this.stopScreenShare()
    await this.teardownAll()
    this.unsubSignal?.()
  }
}
