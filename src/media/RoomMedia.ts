import { nanoid } from 'nanoid'
import type { PresenceBus, SignalData } from '../presence/bus'
import type { ChatMessage } from '../chat/types'
import { CHAT_MAX } from '../chat/types'
import { playChatPublicIncoming } from './sfx'

const ICE: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

/** Mic / screen share need a secure context (HTTPS or localhost). */
export function assertMediaAvailable() {
  if (!window.isSecureContext) {
    throw new Error(
      'INSECURE_CONTEXT: เปิดไมค์/แชร์จอได้เฉพาะ HTTPS หรือ localhost — ใช้ลิงก์ https:// จาก `npm run dev` แล้วกด Advanced → Proceed',
    )
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('MEDIA_UNAVAILABLE: เบราว์เซอร์นี้ไม่รองรับไมโครโฟน')
  }
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
  /** Outbound display-media share (this client only). */
  private screenStream: MediaStream | null = null
  /** Inbound screen-share video keyed by peer id — independent of local share. */
  private remoteScreens = new Map<string, MediaStream>()
  /** Prefer showing the most recently updated remote when not self-sharing. */
  private primaryRemoteId: string | null = null
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
        assertMediaAvailable()
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        })
      }
      // Always renegotiate after attaching mic. Listen-only joins negotiate the
      // audio m-line as recvonly/inactive; replaceTrack alone does not upgrade
      // direction, so remotes would never receive our voice.
      for (const [peerId, pc] of this.pcs) {
        this.ensureAudioTransceiver(pc)
        this.setMicDirection(pc, 'sendrecv')
        for (const track of this.localStream.getAudioTracks()) {
          const sender = this.audioSender(pc)
          if (sender) {
            if (sender.track !== track) await sender.replaceTrack(track)
          } else {
            pc.addTrack(track, this.localStream)
          }
        }
        await this.renegotiate(peerId)
      }
    } else if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
      for (const pc of this.pcs.values()) {
        const sender = this.audioSender(pc)
        if (sender) await sender.replaceTrack(null)
        else {
          for (const s of pc.getSenders()) {
            if (s.track?.kind === 'audio' && !this.isScreenAudio(s.track)) {
              await s.replaceTrack(null)
            }
          }
        }
        // Keep m-line so we can still receive peers while muted.
        this.setMicDirection(pc, 'sendrecv')
      }
    }
  }

  async startScreenShare() {
    assertMediaAvailable()
    // Replace prior local share without wiping remote viewers' streams.
    if (this.screenStream) await this.stopScreenShare()
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    })
    this.screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      void this.stopScreenShare()
    })
    this.emitScreen()

    // Mid-call addTrack must be followed by renegotiation or remotes never see the video.
    for (const peerId of this.pcs.keys()) {
      const pc = this.pcs.get(peerId)!
      for (const track of this.screenStream.getTracks()) {
        if (!pc.getSenders().some((s) => s.track === track)) {
          pc.addTrack(track, this.screenStream)
        }
      }
      await this.renegotiate(peerId)
    }
  }

  /**
   * Stop only *this* client's outbound share.
   * Does not clear inbound remote shares — UI falls back via emitScreen().
   */
  async stopScreenShare() {
    const local = this.screenStream
    this.screenStream = null
    const localTracks = local ? new Set(local.getTracks()) : null
    local?.getTracks().forEach((t) => t.stop())
    for (const pc of this.pcs.values()) {
      for (const sender of pc.getSenders()) {
        if (!sender.track || sender.track.kind !== 'video') continue
        // Only detach our screen tracks — never touch remote receivers.
        if (localTracks?.has(sender.track) || sender.track.readyState === 'ended') {
          await sender.replaceTrack(null)
        }
      }
    }
    this.emitScreen()
  }

  /** Prefer local preview while we are the active sharer; otherwise latest remote. */
  private emitScreen() {
    if (this.screenStream) {
      this.onScreen(this.screenStream, this.selfId)
      return
    }
    if (this.primaryRemoteId) {
      const stream = this.remoteScreens.get(this.primaryRemoteId)
      if (stream?.getVideoTracks().some((t) => t.readyState === 'live')) {
        this.onScreen(stream, this.primaryRemoteId)
        return
      }
      this.primaryRemoteId = null
    }
    for (const [id, stream] of this.remoteScreens) {
      if (stream.getVideoTracks().some((t) => t.readyState === 'live')) {
        this.primaryRemoteId = id
        this.onScreen(stream, id)
        return
      }
    }
    this.onScreen(null, null)
  }

  private clearRemoteScreen(peerId: string) {
    const stream = this.remoteScreens.get(peerId)
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          stream.removeTrack(t)
        } catch {
          /* ignore */
        }
      })
      this.remoteScreens.delete(peerId)
    }
    if (this.primaryRemoteId === peerId) this.primaryRemoteId = null
    this.emitScreen()
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
      const existing = this.pcs.get(peerId)
      if (existing && this.isPcDead(existing)) {
        this.closePeer(peerId)
      }
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

  /** Re-check room peers and revive dead links (e.g. after UI suspend / look edit). */
  async refreshConnections(peerIdsInRoom: string[], forceRenegotiate = false) {
    if (!this.roomId) return
    await this.syncRoom(this.roomId, peerIdsInRoom)
    for (const peerId of this.pcs.keys()) {
      const pc = this.pcs.get(peerId)
      if (!pc || this.isPcDead(pc)) continue
      this.attachTracks(pc)
      if (forceRenegotiate && pc.signalingState === 'stable' && this.selfId < peerId) {
        await this.renegotiate(peerId)
      }
    }
  }

  private isPcDead(pc: RTCPeerConnection) {
    const s = pc.connectionState
    return s === 'failed' || s === 'closed' || s === 'disconnected'
  }

  private async createOffer(peerId: string) {
    this.ensurePc(peerId, true)
    await this.renegotiate(peerId)
  }

  /** Create/send SDP offer so remotes pick up newly added tracks (screen share, mic). */
  private async renegotiate(peerId: string, attempt = 0) {
    const pc = this.pcs.get(peerId)
    if (!pc || !this.roomId) return
    if (this.makingOffer.has(peerId) || pc.signalingState !== 'stable') {
      // Voice/screen enable often races an in-flight offer/answer — retry shortly.
      if (attempt < 8) {
        window.setTimeout(() => void this.renegotiate(peerId, attempt + 1), 120 + attempt * 40)
      }
      return
    }

    this.makingOffer.add(peerId)
    try {
      // Always include an audio m-line so we can *receive* voice without enabling our mic.
      this.ensureAudioTransceiver(pc)
      if (this.localStream) this.setMicDirection(pc, 'sendrecv')
      this.attachTracks(pc)
      const offer = await pc.createOffer()
      // Glare/rollback may have moved us off stable while awaiting createOffer.
      if (pc.signalingState !== 'stable' || !this.pcs.has(peerId)) return
      await pc.setLocalDescription(offer)
      const ld = pc.localDescription!
      this.bus.sendSignal(peerId, {
        kind: 'offer',
        sdp: { type: ld.type, sdp: ld.sdp },
        roomId: this.roomId,
      })
    } catch {
      if (attempt < 8) {
        window.setTimeout(() => void this.renegotiate(peerId, attempt + 1), 150 + attempt * 40)
      }
    } finally {
      this.makingOffer.delete(peerId)
    }
  }

  private hasAudioTransceiver(pc: RTCPeerConnection) {
    return !!this.micTransceiver(pc)
  }

  /**
   * Guarantee a sendrecv audio transceiver so offers negotiate listen-only
   * even when the local mic is off.
   */
  private ensureAudioTransceiver(pc: RTCPeerConnection) {
    if (this.hasAudioTransceiver(pc)) return
    pc.addTransceiver('audio', { direction: 'sendrecv' })
  }

  private isScreenAudio(track: MediaStreamTrack) {
    return !!this.screenStream?.getAudioTracks().some((t) => t.id === track.id)
  }

  /** Mic transceiver — never the screen-share audio sender. */
  private micTransceiver(pc: RTCPeerConnection): RTCRtpTransceiver | null {
    const screenIds = new Set(this.screenStream?.getAudioTracks().map((t) => t.id) ?? [])
    const audioTrs = pc.getTransceivers().filter((t) => {
      const kind = t.sender.track?.kind ?? t.receiver.track?.kind
      return kind === 'audio'
    })
    return (
      audioTrs.find((t) => t.sender.track && this.localStream?.getAudioTracks().some((m) => m.id === t.sender.track!.id)) ??
      audioTrs.find((t) => !t.sender.track || !screenIds.has(t.sender.track.id)) ??
      audioTrs[0] ??
      null
    )
  }

  private setMicDirection(pc: RTCPeerConnection, direction: RTCRtpTransceiverDirection) {
    const tr = this.micTransceiver(pc)
    if (tr && tr.direction !== direction) tr.direction = direction
  }

  private audioSender(pc: RTCPeerConnection): RTCRtpSender | null {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        const hit = pc.getSenders().find((s) => s.track === track)
        if (hit) return hit
      }
    }
    return this.micTransceiver(pc)?.sender ?? null
  }

  private attachTracks(pc: RTCPeerConnection) {
    this.ensureAudioTransceiver(pc)
    if (this.localStream) {
      this.setMicDirection(pc, 'sendrecv')
      for (const track of this.localStream.getAudioTracks()) {
        const sender = this.audioSender(pc)
        if (sender) {
          if (sender.track !== track) void sender.replaceTrack(track)
        } else if (!pc.getSenders().some((s) => s.track === track)) {
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
      // Browsers sometimes deliver remote tracks muted until explicitly enabled.
      ev.track.enabled = true
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
        let remote = this.remoteScreens.get(peerId)
        if (!remote) {
          remote = new MediaStream()
          this.remoteScreens.set(peerId, remote)
        }
        if (!remote.getTracks().some((t) => t.id === ev.track.id)) {
          remote.addTrack(ev.track)
        }
        this.primaryRemoteId = peerId
        // Someone else took the screen — drop our outbound share so UI shows
        // "แชร์จอ" again and we can overwrite them.
        if (this.screenStream) {
          void this.stopScreenShare()
        } else {
          this.emitScreen()
        }
        const onEnded = () => {
          const current = this.remoteScreens.get(peerId)
          if (current?.getTracks().some((t) => t.id === ev.track.id)) {
            current.removeTrack(ev.track)
          }
          if (!current || current.getVideoTracks().length === 0) {
            this.clearRemoteScreen(peerId)
          } else {
            this.emitScreen()
          }
        }
        ev.track.addEventListener('ended', onEnded)
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
    if (msg.fromId !== this.selfId) playChatPublicIncoming()
    this.roomMessages = [...this.roomMessages, msg].slice(-CHAT_MAX)
    this.onRoomChat(this.roomMessages)
  }

  private async handleSignal(from: string, data: SignalData) {
    if (data.kind === 'offer') {
      if (this.roomId && data.roomId !== this.roomId) return
      const pc = this.ensurePc(from, false)
      // Perfect negotiation: polite peer (higher id) rolls back on glare.
      const polite = this.selfId > from
      if (this.makingOffer.has(from)) {
        if (!polite) return
        try {
          await pc.setLocalDescription({ type: 'rollback' })
        } catch {
          return
        } finally {
          this.makingOffer.delete(from)
        }
      }
      try {
        await pc.setRemoteDescription(data.sdp)
        this.attachTracks(pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        const ld = pc.localDescription!
        this.bus.sendSignal(from, { kind: 'answer', sdp: { type: ld.type, sdp: ld.sdp } })
      } catch {
        /* renegotiation race — next offer/answer will recover */
      }
    } else if (data.kind === 'answer') {
      const pc = this.pcs.get(from)
      if (!pc) return
      try {
        await pc.setRemoteDescription(data.sdp)
      } catch {
        /* ignore stale answers */
      }
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
    this.clearRemoteScreen(id)
  }

  private async teardownAll() {
    for (const id of [...this.pcs.keys()]) this.closePeer(id)
    this.remoteScreens.clear()
    this.primaryRemoteId = null
    this.emitScreen()
  }

  async destroy() {
    await this.setVoice(false)
    await this.stopScreenShare()
    await this.teardownAll()
    this.unsubSignal?.()
  }
}
