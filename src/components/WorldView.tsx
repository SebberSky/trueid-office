import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../store'
import { TILE, canTraverse, generateWorld, isUnlimited, pixelCenter, roomAt } from '../world/terrain'
import { CampusScene } from '../world/CampusScene'
import { HEARTBEAT_MS, MOVE_SEND_MS, PresenceBus, makePresence } from '../presence/bus'
import { OfficeSocket } from '../net/OfficeSocket'
import { RoomMedia } from '../media/RoomMedia'
import { downloadRecording, ScreenRecorder } from '../media/ScreenRecorder'
import { GlobalChatBus } from '../chat/GlobalChat'
import { FLOAT_EMOJIS, RoomActivityBus, type Poll } from '../chat/RoomActivity'
import type { ChatMessage } from '../chat/types'
import type { Facing } from '../types'
import { normalizeAnimalKind } from '../types'
import { ChatPanel } from './ChatPanel'
import { PollPanel } from './PollPanel'
import { FloatingEmojis, type FloatEmojiItem } from './FloatingEmojis'
import { MobileControls } from './MobileControls'
import './World.css'

const SPEED = 280

function mediaErrMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg.startsWith('INSECURE_CONTEXT:')) return msg.slice('INSECURE_CONTEXT:'.length).trim()
  if (msg.startsWith('MEDIA_UNAVAILABLE:')) return msg.slice('MEDIA_UNAVAILABLE:'.length).trim()
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'ปฏิเสธสิทธิ์ไมค์/แชร์จอ — เปิดใหม่ที่ไอคอนกุญแจข้าง URL'
  }
  return fallback
}

export function WorldView() {
  const session = useAppStore((s) => s.session)!
  const goCreator = useAppStore((s) => s.goCreator)
  const logout = useAppStore((s) => s.logout)

  const map = useMemo(() => generateWorld(20260717), [])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const pos = useRef(pixelCenter(map.spawn.x, map.spawn.y))
  const facing = useRef<Facing>('down')
  const keys = useRef(new Set<string>())
  const stickRef = useRef({ x: 0, y: 0 })
  const peersRef = useRef<ReturnType<PresenceBus['getPeers']>>([])
  const busRef = useRef<PresenceBus | null>(null)
  const mediaRef = useRef<RoomMedia | null>(null)
  const recorderRef = useRef<ScreenRecorder | null>(null)
  const globalChatRef = useRef<GlobalChatBus | null>(null)
  const activityRef = useRef<RoomActivityBus | null>(null)
  const sceneRef = useRef<CampusScene | null>(null)
  const roomIdRef = useRef<string | null>(null)

  const [roomName, setRoomName] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [capacity, setCapacity] = useState({ in: 0, max: 0 })
  const [voiceOn, setVoiceOn] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [screenFrom, setScreenFrom] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [globalMsgs, setGlobalMsgs] = useState<ChatMessage[]>([])
  const [roomMsgs, setRoomMsgs] = useState<ChatMessage[]>([])
  const [handRaised, setHandRaised] = useState(false)
  const [raisedHands, setRaisedHands] = useState<{ id: string; name: string }[]>([])
  const [pollOpen, setPollOpen] = useState(false)
  const [activePoll, setActivePoll] = useState<Poll | null>(null)
  const [floatEmojis, setFloatEmojis] = useState<FloatEmojiItem[]>([])
  const [screenFs, setScreenFs] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    roomIdRef.current = roomId
  }, [roomId])

  const pushRoomSys = useCallback((fromName: string, text: string, room: string) => {
    setRoomMsgs((prev) => [
      ...prev,
      {
        id: nanoid(8),
        channel: 'room',
        fromId: 'system',
        fromName,
        text,
        at: Date.now(),
        roomId: room,
      },
    ])
  }, [])

  const publish = useCallback(() => {
    const bus = busRef.current
    if (!bus) return
    const room = roomAt(map, pos.current.x, pos.current.y)
    bus.publish(
      makePresence(
        session.id,
        session.email,
        session.look,
        pos.current.x,
        pos.current.y,
        facing.current,
        room?.id ?? null,
        voiceOn,
        sharing,
      ),
    )
  }, [map, session, voiceOn, sharing])

  const publishRef = useRef(publish)
  publishRef.current = publish

  useEffect(() => {
    const net = new OfficeSocket(session.id)
    const bus = new PresenceBus(net, session.id, {
      email: session.email,
      look: session.look,
    })
    busRef.current = bus
    const unsub = bus.subscribe(() => {
      peersRef.current = bus.getPeers()
      setPeerCount(peersRef.current.length)
    })

    const globalChat = new GlobalChatBus(net, session.id)
    globalChatRef.current = globalChat
    const unsubChat = globalChat.subscribe(setGlobalMsgs)

    const activity = new RoomActivityBus(net, session.id)
    activityRef.current = activity
    const unsubAct = activity.subscribe((ev) => {
      const currentRoom = roomIdRef.current
      if (!currentRoom || ev.roomId !== currentRoom) return

      if (ev.type === 'hand') {
        setRaisedHands((prev) => {
          const without = prev.filter((h) => h.id !== ev.fromId)
          return ev.raised ? [...without, { id: ev.fromId, name: ev.fromName }] : without
        })
        if (ev.fromId !== session.id) {
          pushRoomSys(ev.fromName, ev.raised ? '✋ ยกมือ' : '✋ ลงมือ', currentRoom)
        }
      } else if (ev.type === 'poll-create') {
        setActivePoll(ev.poll)
        setPollOpen(true)
        pushRoomSys(ev.poll.createdByName, `📊 Poll: ${ev.poll.question}`, currentRoom)
      } else if (ev.type === 'poll-vote') {
        setActivePoll((prev) => {
          if (!prev || prev.id !== ev.pollId) return prev
          return { ...prev, votes: { ...prev.votes, [ev.fromId]: ev.optionIndex } }
        })
      } else if (ev.type === 'emoji') {
        setFloatEmojis((prev) => [
          ...prev,
          { id: nanoid(6), emoji: ev.emoji, x: ev.x, fromName: ev.fromName },
        ])
      }
    })

    const media = new RoomMedia(
      bus,
      session.id,
      (streams) => {
        const host = audioHostRef.current
        if (!host) return
        host.innerHTML = ''
        for (const [id, stream] of streams) {
          if (stream.getAudioTracks().length === 0) continue
          const audio = document.createElement('audio')
          audio.autoplay = true
          audio.srcObject = stream
          audio.dataset.peer = id
          host.appendChild(audio)
        }
        if (recorderRef.current?.recording) {
          recorderRef.current.setAudioSources(mediaRef.current?.collectAudioStreams() ?? [])
        }
      },
      (stream, fromId) => {
        screenStreamRef.current = stream
        setScreenFrom(fromId)
      },
      setRoomMsgs,
    )
    mediaRef.current = media

    const onLeave = () => bus.leave(session.id)
    window.addEventListener('beforeunload', onLeave)

    return () => {
      window.removeEventListener('beforeunload', onLeave)
      onLeave()
      unsub()
      unsubChat()
      unsubAct()
      void media.destroy()
      globalChat.destroy()
      activity.destroy()
      bus.destroy()
      net.destroy()
    }
  }, [session.id, pushRoomSys])

  useEffect(() => {
    // Use e.code so WASD still works under Thai IME (ไ/ฟ/ห/ก on those keys)
    const moveCodes = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
    ])
    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (moveCodes.has(e.code)) {
        e.preventDefault()
        keys.current.add(e.code)
      }
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '=' || e.key === '+') {
        e.preventDefault()
        sceneRef.current?.adjustZoom(0.08)
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_') {
        e.preventDefault()
        sceneRef.current?.adjustZoom(-0.08)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(publish, HEARTBEAT_MS)
    publish()
    return () => clearInterval(id)
  }, [publish])

  // 3D scene + movement loop
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const scene = new CampusScene(canvas, map, session.look)
    sceneRef.current = scene

    let raf = 0
    let last = performance.now()
    let lastUi = { roomName: null as string | null, roomId: null as string | null, in: 0, max: 0 }
    let lastPeerKey = ''
    let lastNetSend = 0
    let lastNetX = pos.current.x
    let lastNetY = pos.current.y
    let lastNetFacing = facing.current

    const resize = () => {
      scene.setSize(wrap.clientWidth, wrap.clientHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // scroll up = zoom in, scroll down = zoom out
      const delta = -e.deltaY * 0.0012
      scene.adjustZoom(delta)
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })

    const canFly =
      session.look.species === 'animal' && normalizeAnimalKind(session.look.animalKind) === 'bird'

    const tryMove = (nx: number, ny: number) => {
      const radius = 8
      const samples = [
        [nx, ny],
        [nx - radius, ny],
        [nx + radius, ny],
        [nx, ny - radius],
        [nx, ny + radius],
      ]
      for (const [sx, sy] of samples) {
        const tx = Math.floor(sx / TILE)
        const ty = Math.floor(sy / TILE)
        if (!canTraverse(map, tx, ty, canFly)) return
      }
      const prevRoom = roomAt(map, pos.current.x, pos.current.y)
      const nextRoom = roomAt(map, nx, ny)
      if (nextRoom && (!prevRoom || prevRoom.id !== nextRoom.id)) {
        if (!isUnlimited(nextRoom)) {
          const others = peersRef.current.filter((p) => p.roomId === nextRoom.id).length
          if (others + 1 > nextRoom.capacity) return
        }
      }
      pos.current.x = nx
      pos.current.y = ny
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      let dx = 0
      let dy = 0
      const k = keys.current
      if (k.has('ArrowLeft') || k.has('KeyA')) dx -= 1
      if (k.has('ArrowRight') || k.has('KeyD')) dx += 1
      if (k.has('ArrowUp') || k.has('KeyW')) dy -= 1
      if (k.has('ArrowDown') || k.has('KeyS')) dy += 1

      const stick = stickRef.current
      const stickMag = Math.hypot(stick.x, stick.y)
      if (stickMag > 0.12) {
        dx += stick.x
        dy += stick.y
      }

      let moving = false
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1
        dx /= len
        dy /= len
        if (Math.abs(dx) > Math.abs(dy)) facing.current = dx < 0 ? 'left' : 'right'
        else facing.current = dy < 0 ? 'up' : 'down'
        const step = SPEED * dt
        tryMove(pos.current.x + dx * step, pos.current.y)
        tryMove(pos.current.x, pos.current.y + dy * step)
        moving = true
      }

      const movedNet =
        Math.hypot(pos.current.x - lastNetX, pos.current.y - lastNetY) > 0.5 ||
        facing.current !== lastNetFacing
      if (movedNet && now - lastNetSend >= MOVE_SEND_MS) {
        publishRef.current()
        lastNetSend = now
        lastNetX = pos.current.x
        lastNetY = pos.current.y
        lastNetFacing = facing.current
      }

      const room = roomAt(map, pos.current.x, pos.current.y)
      const peers = peersRef.current
      const inRoomPeers = peers.filter((p) => p.roomId && room && p.roomId === room.id)
      const occupants = inRoomPeers.length + (room ? 1 : 0)
      const nextRoomName = room?.name ?? null
      const nextRoomId = room?.id ?? null
      const nextCap = room?.capacity ?? 0

      if (
        nextRoomName !== lastUi.roomName ||
        nextRoomId !== lastUi.roomId ||
        occupants !== lastUi.in ||
        nextCap !== lastUi.max
      ) {
        lastUi = { roomName: nextRoomName, roomId: nextRoomId, in: occupants, max: nextCap }
        setRoomName(nextRoomName)
        setRoomId(nextRoomId)
        setCapacity({ in: occupants, max: nextCap })
      }

      const peerKey = `${nextRoomId ?? ''}|${inRoomPeers
        .map((p) => p.id)
        .sort()
        .join(',')}`
      if (mediaRef.current && peerKey !== lastPeerKey) {
        lastPeerKey = peerKey
        void mediaRef.current.syncRoom(
          nextRoomId,
          inRoomPeers.map((p) => p.id),
        )
      }

      scene.syncPeers(peers, map, dt)
      scene.render(map, pos.current.x, pos.current.y, facing.current, moving, dt)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      wrap.removeEventListener('wheel', onWheel)
      scene.dispose()
      sceneRef.current = null
    }
  }, [map, session.look])

  // Outside rooms: no mic / screen share — shut them down when leaving
  useEffect(() => {
    if (roomId) return
    setMediaError(null)
    setScreenFrom(null)
    void mediaRef.current?.setVoice(false)
    void mediaRef.current?.stopScreenShare()
    setVoiceOn(false)
    setSharing(false)
    setHandRaised(false)
    setRaisedHands([])
    setActivePoll(null)
    setPollOpen(false)
    setFloatEmojis([])
    setScreenFs(false)
    screenStreamRef.current = null
    void stopRecordingIfNeeded()
  }, [roomId])

  useEffect(() => {
    if (screenFrom || sharing) return
    void stopRecordingIfNeeded()
  }, [screenFrom, sharing])

  useEffect(() => {
    const active = !!(screenFrom || sharing)
    setScreenFs(active)
  }, [screenFrom, sharing])

  // Bind stream after <video> mounts — onScreen often fires before the element exists
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const stream = screenStreamRef.current
    if (!stream || !(screenFrom || sharing)) {
      video.srcObject = null
      return
    }
    if (video.srcObject !== stream) {
      video.srcObject = stream
    }
    void video.play().catch(() => undefined)
  }, [screenFrom, sharing])

  async function stopRecordingIfNeeded() {
    const rec = recorderRef.current
    if (!rec?.recording) {
      setRecording(false)
      return
    }
    try {
      const blob = await rec.stop()
      downloadRecording(blob)
    } catch {
      /* ignore */
    }
    recorderRef.current = null
    setRecording(false)
  }

  async function toggleRecording() {
    if (!roomId || !(screenFrom || sharing)) return
    setMediaError(null)
    try {
      if (recording && recorderRef.current?.recording) {
        const blob = await recorderRef.current.stop()
        downloadRecording(blob)
        recorderRef.current = null
        setRecording(false)
        return
      }
      const video = screenStreamRef.current
      if (!video?.getVideoTracks().length) {
        setMediaError('ยังไม่มีภาพแชร์จอให้อัด')
        return
      }
      const recorder = new ScreenRecorder()
      await recorder.start(video, mediaRef.current?.collectAudioStreams() ?? [])
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setMediaError('ไม่สามารถอัดบันทึกได้ (เบราว์เซอร์อาจไม่รองรับ)')
      setRecording(false)
      recorderRef.current = null
    }
  }

  async function toggleVoice() {
    if (!roomId) return
    setMediaError(null)
    try {
      const next = !voiceOn
      await mediaRef.current?.setVoice(next)
      setVoiceOn(next)
      if (recorderRef.current?.recording) {
        recorderRef.current.setAudioSources(mediaRef.current?.collectAudioStreams() ?? [])
      }
    } catch (err) {
      setMediaError(mediaErrMessage(err, 'ไม่สามารถเปิดไมโครโฟนได้'))
    }
  }

  async function toggleShare() {
    if (!roomId) return
    setMediaError(null)
    try {
      if (sharing) {
        await stopRecordingIfNeeded()
        await mediaRef.current?.stopScreenShare()
        setSharing(false)
      } else {
        await mediaRef.current?.startScreenShare()
        setSharing(true)
      }
    } catch (err) {
      setMediaError(mediaErrMessage(err, 'ยกเลิกหรือไม่สามารถแชร์จอได้'))
    }
  }

  return (
    <div className="world">
      <header className="world__bar">
        <div className="world__brand">
          <strong>TrueID Office</strong>
          <span>{session.look.displayName}</span>
        </div>
        <div className="world__meta">
          <span>ออนไลน์ {peerCount + 1}</span>
          {roomName ? (
            <span className="world__room">
              {roomName}
              {capacity.max > 0 ? ` · ${capacity.in}/${capacity.max}` : ` · ${capacity.in} คน · ไม่จำกัด`}
            </span>
          ) : (
            <span className="world__outside">นอกห้อง — เดินเข้าห้องหรือลานกิจกรรมเพื่อคุย / แชร์จอ</span>
          )}
        </div>
        <div className="world__actions">
          <button type="button" onClick={goCreator}>
            แก้ไขตัวละคร
          </button>
          <button type="button" className="danger" onClick={logout}>
            ออก
          </button>
        </div>
      </header>

      <div className="world__stage" ref={wrapRef}>
        <canvas ref={canvasRef} tabIndex={0} />
        <FloatingEmojis
          items={floatEmojis}
          onDone={(id) => setFloatEmojis((prev) => prev.filter((e) => e.id !== id))}
        />
        {(screenFrom || sharing) && (
          <div className={`world__screen ${screenFs ? 'is-fill' : 'is-pip'}`}>
            <div className="world__screen-bar">
              <p>
                {sharing ? 'คุณกำลังแชร์จอ' : 'กำลังรับแชร์จอ'}
                {recording ? ' · กำลังอัด' : ''}
              </p>
              <div className="world__screen-actions">
                <button
                  type="button"
                  className={recording ? 'world__screen-fs world__screen-rec on' : 'world__screen-fs world__screen-rec'}
                  onClick={() => void toggleRecording()}
                  title={recording ? 'หยุดอัดและดาวน์โหลด' : 'อัดภาพ+เสียงคุย'}
                >
                  {recording ? '⏹ หยุดอัด' : '⏺ อัดบันทึก'}
                </button>
                <button
                  type="button"
                  className="world__screen-fs"
                  onClick={() => setScreenFs((v) => !v)}
                  title={screenFs ? 'ย่อแชร์จอ' : 'เต็มพื้นที่แมพ'}
                >
                  {screenFs ? '⤓ ย่อ' : '⛶ เต็มพื้นที่แมพ'}
                </button>
              </div>
            </div>
            <video ref={videoRef} autoPlay playsInline muted={sharing} />
          </div>
        )}
        <div className="world__hint world__hint--desktop">
          WASD / ลูกศร เดิน (ใช้ได้แม้คีย์บอร์ดไทย) · ลูกกลมเมาส์ / +− ซูม
        </div>
        <MobileControls
          stickRef={stickRef}
          onZoom={(delta) => sceneRef.current?.adjustZoom(delta)}
        />
      </div>

      <aside className={`world__dock ${roomId ? 'in-room' : ''}`}>
        <div className="world__dock-title">
          {roomId
            ? capacity.max > 0
              ? 'ในห้อง'
              : 'ในลานกิจกรรม'
            : 'พื้นที่สาธารณะ'}
        </div>

        {roomId ? (
          <>
            <div className="world__controls">
              <button type="button" className={voiceOn ? 'on' : ''} onClick={() => void toggleVoice()}>
                {voiceOn ? 'ปิดไมค์' : 'เปิดไมค์'}
              </button>
              <button
                type="button"
                className={sharing ? 'on share' : ''}
                onClick={() => void toggleShare()}
              >
                {sharing ? 'หยุดแชร์จอ' : 'แชร์จอ'}
              </button>
              {(screenFrom || sharing) && (
                <>
                  <button
                    type="button"
                    className={screenFs ? 'on' : ''}
                    onClick={() => setScreenFs((v) => !v)}
                  >
                    {screenFs ? 'ย่อแชร์จอ' : 'เต็มพื้นที่แมพ'}
                  </button>
                  <button
                    type="button"
                    className={recording ? 'on rec' : ''}
                    onClick={() => void toggleRecording()}
                  >
                    {recording ? 'หยุดอัด · ดาวน์โหลด' : 'อัดภาพ+เสียง'}
                  </button>
                </>
              )}
            </div>
            {mediaError && <p className="world__media-err">{mediaError}</p>}
          </>
        ) : (
          <p className="world__outside-note">
            ไมค์ / แชร์จอ / แชทห้อง ใช้ได้ในห้องมีทและลานกิจกรรมเท่านั้น
          </p>
        )}

        <div className="world__chats">
          <ChatPanel
            channel="global"
            messages={globalMsgs}
            enabled
            placeholder="Global chat…"
            onSend={(text) => globalChatRef.current?.send(session.look.displayName, text)}
          />
          {roomId && (
            <>
              <ChatPanel
                channel="room"
                messages={roomMsgs}
                enabled
                placeholder="Room chat…"
                onSend={(text) => {
                  mediaRef.current?.sendRoomChat(session.look.displayName, text, roomId)
                }}
                tools={{
                  handRaised,
                  raisedHands,
                  emojis: FLOAT_EMOJIS,
                  onToggleHand: () => {
                    const next = !handRaised
                    setHandRaised(next)
                    activityRef.current?.raiseHand(roomId, session.look.displayName, next)
                    pushRoomSys(
                      session.look.displayName,
                      next ? '✋ ยกมือ' : '✋ ลงมือ',
                      roomId,
                    )
                    setRaisedHands((prev) => {
                      const without = prev.filter((h) => h.id !== session.id)
                      return next
                        ? [...without, { id: session.id, name: session.look.displayName }]
                        : without
                    })
                  },
                  onOpenPoll: () => setPollOpen(true),
                  onEmoji: (emoji) => {
                    activityRef.current?.sendEmoji(roomId, session.look.displayName, emoji)
                  },
                }}
              />
              <PollPanel
                open={pollOpen}
                poll={activePoll}
                selfId={session.id}
                onClose={() => setPollOpen(false)}
                onCreate={(question, options) => {
                  activityRef.current?.createPoll(
                    roomId,
                    session.look.displayName,
                    question,
                    options,
                  )
                }}
                onVote={(optionIndex) => {
                  if (!activePoll) return
                  activityRef.current?.votePoll(roomId, activePoll.id, optionIndex)
                }}
              />
            </>
          )}
        </div>

        <div ref={audioHostRef} className="world__audio-host" hidden />
      </aside>
    </div>
  )
}
