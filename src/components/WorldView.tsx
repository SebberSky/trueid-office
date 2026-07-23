import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useAppStore } from '../store'
import { TILE, canTraverse, generateWorld, isAtWaterEdge, isUnlimited, nearestWaterCastTarget, pixelCenter, roomAt } from '../world/terrain'
import { CampusScene } from '../world/CampusScene'
import { HEARTBEAT_MS, MOVE_SEND_MS, PresenceBus, makePresence } from '../presence/bus'
import { OfficeSocket } from '../net/OfficeSocket'
import { RoomMedia } from '../media/RoomMedia'
import { downloadRecording, ScreenRecorder } from '../media/ScreenRecorder'
import { GlobalChatBus } from '../chat/GlobalChat'
import { FLOAT_EMOJIS, RoomActivityBus, type Poll } from '../chat/RoomActivity'
import type { ChatMessage, DmMessage, PinnedMessage } from '../chat/types'
import type { Facing } from '../types'
import { canFlyOverWater, normalizeAnimalKind } from '../types'
import { ChatPanel } from './ChatPanel'
import { DmPanel } from './DmPanel'
import { DmChatBus } from '../chat/DmChat'
import { NameWheel } from './NameWheel'
import { PollPanel } from './PollPanel'
import { FloatingEmojis, type FloatEmojiItem } from './FloatingEmojis'
import { OnlineRoster, type RosterPerson } from './OnlineRoster'
import { FishingCatchOverlay } from './FishingCatch'
import { FallGuysGame } from './FallGuysGame'
import { XoGame } from './XoGame'
import { MobileControls } from './MobileControls'
import { Minimap } from './Minimap'
import {
  FISH_CATCH_SHOW_MS,
  randomFishWaitMs,
  randomFishingCatch,
  type FishingCatch,
} from '../fishing/loot'
import {
  FALLGUYS_ROOM_ID,
  type FallGuysActiveRace,
  type FallGuysRacer,
} from '../fallguys/types'
import {
  XO_ROOM_ID,
  XO_ROOM_NAME,
  emptyBoard,
  type XoActiveGame,
  type XoCell,
  type XoPlayer,
} from '../xo/types'
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
  const lastPose = useAppStore((s) => s.lastPose)
  const setLastPose = useAppStore((s) => s.setLastPose)
  const worldActive = useAppStore((s) => s.screen === 'world')
  const worldActiveRef = useRef(worldActive)
  worldActiveRef.current = worldActive
  const resumeAudioRef = useRef<(() => void) | null>(null)
  const wasWorldActiveRef = useRef(worldActive)

  const map = useMemo(() => generateWorld(20260717), [])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const initialPose = useMemo(() => {
    if (lastPose) {
      const tx = Math.floor(lastPose.x / TILE)
      const ty = Math.floor(lastPose.y / TILE)
      if (canTraverse(map, tx, ty, canFlyOverWater(session.look))) {
        return { x: lastPose.x, y: lastPose.y, facing: lastPose.facing as Facing }
      }
    }
    const c = pixelCenter(map.spawn.x, map.spawn.y)
    return { x: c.x, y: c.y, facing: 'down' as Facing }
  }, [map, lastPose, session.look])

  const pos = useRef({ x: initialPose.x, y: initialPose.y })
  const facing = useRef<Facing>(initialPose.facing)
  const poseAppliedRef = useRef(false)
  const keys = useRef(new Set<string>())
  const stickRef = useRef({ x: 0, y: 0 })
  const peersRef = useRef<ReturnType<PresenceBus['getPeers']>>([])
  const busRef = useRef<PresenceBus | null>(null)
  const mediaRef = useRef<RoomMedia | null>(null)
  const recorderRef = useRef<ScreenRecorder | null>(null)
  const globalChatRef = useRef<GlobalChatBus | null>(null)
  const dmChatRef = useRef<DmChatBus | null>(null)
  const activityRef = useRef<RoomActivityBus | null>(null)
  const sceneRef = useRef<CampusScene | null>(null)
  const lookRef = useRef(session.look)
  lookRef.current = session.look
  const netRef = useRef<OfficeSocket | null>(null)
  const roomIdRef = useRef<string | null>(null)
  const lockedRoomsRef = useRef(new Set<string>())

  const [roomName, setRoomName] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [capacity, setCapacity] = useState({ in: 0, max: 0 })
  const [lockedRooms, setLockedRooms] = useState<Set<string>>(() => new Set())
  const [pinsByRoom, setPinsByRoom] = useState<Map<string, PinnedMessage>>(() => new Map())
  const [voiceOn, setVoiceOn] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [peersLive, setPeersLive] = useState<ReturnType<PresenceBus['getPeers']>>([])
  const [roster, setRoster] = useState<'server' | 'room' | null>(null)
  const onlineBtnRef = useRef<HTMLButtonElement>(null)
  const roomBtnRef = useRef<HTMLButtonElement>(null)
  const [fishCatch, setFishCatch] = useState<FishingCatch | null>(null)
  const [nearWater, setNearWater] = useState(false)
  const [fishingActive, setFishingActive] = useState(false)
  /** none | player (locked in zone) | spectator (overlay, no play) */
  const [fgRole, setFgRole] = useState<'none' | 'player' | 'spectator'>('none')
  const [fgRaceId, setFgRaceId] = useState(0)
  const [fgPlayers, setFgPlayers] = useState<{ id: string; name: string }[]>([])
  const [fgScores, setFgScores] = useState<FallGuysRacer[]>([])
  const [fgRaceOver, setFgRaceOver] = useState(false)
  /** Live race snapshot known to this client (even if not in overlay yet). */
  const [fgRacePhase, setFgRacePhase] = useState<'idle' | 'racing' | 'results'>('idle')
  const fgRaceIdRef = useRef(0)
  fgRaceIdRef.current = fgRaceId
  const fgRoleRef = useRef(fgRole)
  fgRoleRef.current = fgRole
  const fgPlayersRef = useRef(fgPlayers)
  fgPlayersRef.current = fgPlayers
  const fgRacePhaseRef = useRef(fgRacePhase)
  fgRacePhaseRef.current = fgRacePhase
  /** Race id the user closed overlay for — don't auto-reopen until a new race. */
  const fgDismissedRaceRef = useRef(0)

  const [xoRole, setXoRole] = useState<'none' | 'player'>('none')
  const [xoGameId, setXoGameId] = useState(0)
  const [xoPlayers, setXoPlayers] = useState<XoPlayer[]>([])
  const [xoBoard, setXoBoard] = useState<XoCell[]>(() => emptyBoard())
  const [xoTurnId, setXoTurnId] = useState('')
  const [xoPhase, setXoPhase] = useState<'idle' | 'playing' | 'results'>('idle')
  const [xoWinnerId, setXoWinnerId] = useState<string | null>(null)
  const [xoReason, setXoReason] = useState<'win' | 'draw' | 'forfeit' | null>(null)
  const [lobbyError, setLobbyError] = useState<string | null>(null)
  const xoRoleRef = useRef(xoRole)
  xoRoleRef.current = xoRole
  const xoDismissedGameRef = useRef(0)

  const fishTimerRef = useRef<number | null>(null)
  const fishPhaseRef = useRef<'idle' | 'waiting' | 'catch'>('idle')
  const fishingActiveRef = useRef(false)
  const tryStartFishingRef = useRef(() => {})
  const stopFishingRef = useRef(() => {})
  const toggleVoiceRef = useRef(() => {})
  const [screenFrom, setScreenFrom] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [globalMsgs, setGlobalMsgs] = useState<ChatMessage[]>([])
  const [roomMsgs, setRoomMsgs] = useState<ChatMessage[]>([])
  /** When in a room, global chat starts collapsed to one preview line. */
  const [globalChatExpanded, setGlobalChatExpanded] = useState(true)
  const [dmThread, setDmThread] = useState<{
    peerId: string
    peerName: string
    messages: DmMessage[]
  } | null>(null)
  const [dmUnreadTick, setDmUnreadTick] = useState(0)
  const [handRaised, setHandRaised] = useState(false)
  const [raisedHands, setRaisedHands] = useState<{ id: string; name: string }[]>([])
  const [pollOpen, setPollOpen] = useState(false)
  const [activePoll, setActivePoll] = useState<Poll | null>(null)
  const [wheelOpen, setWheelOpen] = useState(false)
  const [floatEmojis, setFloatEmojis] = useState<FloatEmojiItem[]>([])
  const [screenFs, setScreenFs] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    roomIdRef.current = roomId
  }, [roomId])

  // Entering a room collapses global chat; leaving expands it again.
  useEffect(() => {
    setGlobalChatExpanded(!roomId)
  }, [roomId])

  useEffect(() => {
    setLobbyError(null)
  }, [roomId])

  // Enter pink pad during a live race → spectator overlay (unless already a racer)
  useEffect(() => {
    if (roomId === FALLGUYS_ROOM_ID && fgRacePhase === 'racing' && fgRaceId > 0) {
      if (fgDismissedRaceRef.current === fgRaceId) return
      const isPlayer = fgPlayers.some((p) => p.id === session.id)
      setFgRole(isPlayer ? 'player' : 'spectator')
      return
    }
    if (roomId !== FALLGUYS_ROOM_ID) {
      setFgRole((prev) => (prev === 'spectator' ? 'none' : prev))
    }
  }, [roomId, fgRacePhase, fgRaceId, fgPlayers, session.id])

  useEffect(() => {
    lockedRoomsRef.current = lockedRooms
    sceneRef.current?.setRoomLocks(lockedRooms)
  }, [lockedRooms])

  const applyLocks = useCallback((ids: string[]) => {
    const next = new Set(ids)
    lockedRoomsRef.current = next
    setLockedRooms(next)
    sceneRef.current?.setRoomLocks(next)
  }, [])

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

  const jumpAtRef = useRef(0)
  const fireAtRef = useRef(0)
  const spitAtRef = useRef(0)
  const biteAtRef = useRef(0)
  const slapAtRef = useRef(0)
  const crouchingRef = useRef(false)
  const fishCastRef = useRef<{ x: number; y: number } | null>(null)

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
        jumpAtRef.current || undefined,
        fireAtRef.current || undefined,
        crouchingRef.current || undefined,
        biteAtRef.current || undefined,
        fishCastRef.current,
        spitAtRef.current || undefined,
        slapAtRef.current || undefined,
      ),
    )
  }, [map, session, voiceOn, sharing])

  const publishRef = useRef(publish)
  publishRef.current = publish

  const applyFgRaceStart = useCallback(
    (race: { raceId: number; startedAt: number; players: { id: string; name: string }[] }) => {
      setFgRaceId(race.raceId)
      setFgPlayers(race.players)
      setFgScores(
        race.players.map((p) => ({
          id: p.id,
          name: p.name,
          progress: 0,
          finishedAt: null,
        })),
      )
      setFgRaceOver(false)
      setFgRacePhase('racing')
      fgDismissedRaceRef.current = 0
      if (race.players.some((p) => p.id === session.id)) {
        setFgRole('player')
      } else if (roomIdRef.current === FALLGUYS_ROOM_ID) {
        setFgRole('spectator')
      } else {
        setFgRole('none')
      }
    },
    [session.id],
  )

  const applyFgRaceState = useCallback(
    (state: FallGuysActiveRace) => {
      setFgRaceId(state.race.raceId)
      setFgPlayers(state.race.players)
      setFgScores(state.scores)
      setFgRacePhase(state.phase)
      setFgRaceOver(state.phase === 'results')
      const isPlayer = state.race.players.some((p) => p.id === session.id)
      if (isPlayer) {
        setFgRole('player')
      } else if (state.phase === 'racing' && roomIdRef.current === FALLGUYS_ROOM_ID) {
        setFgRole((prev) => (prev === 'player' ? 'player' : 'spectator'))
      }
    },
    [session.id],
  )

  const applyFgRaceStartRef = useRef(applyFgRaceStart)
  applyFgRaceStartRef.current = applyFgRaceStart
  const applyFgRaceStateRef = useRef(applyFgRaceState)
  applyFgRaceStateRef.current = applyFgRaceState

  const applyXoGameStart = useCallback(
    (game: {
      gameId: number
      players: XoPlayer[]
      turnId: string
      board: XoCell[]
    }) => {
      setXoGameId(game.gameId)
      setXoPlayers(game.players)
      setXoBoard(game.board)
      setXoTurnId(game.turnId)
      setXoPhase('playing')
      setXoWinnerId(null)
      setXoReason(null)
      xoDismissedGameRef.current = 0
      if (game.players.some((p) => p.id === session.id)) {
        setXoRole('player')
      } else {
        setXoRole('none')
      }
    },
    [session.id],
  )

  const applyXoGameState = useCallback(
    (state: XoActiveGame) => {
      setXoGameId(state.game.gameId)
      setXoPlayers(state.game.players)
      setXoBoard(state.game.board)
      setXoTurnId(state.game.turnId)
      setXoPhase(state.phase)
      setXoWinnerId(state.winnerId)
      setXoReason(state.reason)
      const isPlayer = state.game.players.some((p) => p.id === session.id)
      if (isPlayer && xoDismissedGameRef.current !== state.game.gameId) {
        setXoRole('player')
      }
    },
    [session.id],
  )

  const applyXoGameStartRef = useRef(applyXoGameStart)
  applyXoGameStartRef.current = applyXoGameStart
  const applyXoGameStateRef = useRef(applyXoGameState)
  applyXoGameStateRef.current = applyXoGameState

  useEffect(() => {
    const net = new OfficeSocket(session.id)
    netRef.current = net
    const bus = new PresenceBus(net, session.id, {
      email: session.email,
      look: session.look,
    })
    busRef.current = bus
    const unsub = bus.subscribe(() => {
      peersRef.current = bus.getPeers()
      setPeerCount(peersRef.current.length)
      setPeersLive(peersRef.current)
    })

    const unsubLock = net.subscribe((msg) => {
      if (msg.type === 'session-replaced') {
        net.destroy()
        busRef.current = null
        logout('บัญชีนี้เข้าสู่ระบบจากอุปกรณ์อื่นแล้ว — อุปกรณ์นี้ถูกตัดการเชื่อมต่อ')
        return
      }
      if (msg.type === 'error') {
        console.warn('[net] error', msg.message)
        setMediaError(msg.message)
        setLobbyError(msg.message)
        return
      }
      if (msg.type === 'welcome') {
        applyLocks(msg.lockedRooms ?? [])
        const pins = new Map<string, PinnedMessage>()
        for (const p of msg.pinnedMessages ?? []) {
          if (p?.roomId) pins.set(p.roomId, p)
        }
        setPinsByRoom(pins)
        if (msg.fallguysRace) applyFgRaceStateRef.current(msg.fallguysRace)
        if (msg.xoGame) applyXoGameStateRef.current(msg.xoGame)
        if (msg.lastPose && !poseAppliedRef.current) {
          const tx = Math.floor(msg.lastPose.x / TILE)
          const ty = Math.floor(msg.lastPose.y / TILE)
          if (canTraverse(map, tx, ty, canFlyOverWater(session.look))) {
            pos.current.x = msg.lastPose.x
            pos.current.y = msg.lastPose.y
            facing.current = msg.lastPose.facing
            setLastPose(msg.lastPose)
            poseAppliedRef.current = true
            publishRef.current()
          }
        } else if (!poseAppliedRef.current) {
          poseAppliedRef.current = true
        }
        return
      }
      if (msg.type === 'fallguys-lobby') {
        return
      }
      if (msg.type === 'fallguys-race-start') {
        setLobbyError(null)
        applyFgRaceStartRef.current(msg.race)
        return
      }
      if (msg.type === 'fallguys-race-state') {
        applyFgRaceStateRef.current(msg.state)
        return
      }
      if (msg.type === 'fallguys-race-update') {
        setFgScores(msg.update.scores)
        return
      }
      if (msg.type === 'fallguys-race-over') {
        setFgScores(msg.result.ranking)
        setFgRaceOver(true)
        setFgRacePhase('results')
        return
      }
      if (msg.type === 'xo-lobby') {
        return
      }
      if (msg.type === 'xo-ack') {
        console.info('[xo] recv xo-ack', msg)
        setLobbyError(
          msg.ok
            ? `server ack · zone ${msg.zone} · ${msg.detail ?? msg.phase}`
            : (msg.detail ?? 'xo-ack failed'),
        )
        return
      }
      if (msg.type === 'xo-game-start') {
        console.info('[xo] recv xo-game-start', msg.game)
        setLobbyError(null)
        applyXoGameStartRef.current(msg.game)
        return
      }
      if (msg.type === 'xo-game-state') {
        applyXoGameStateRef.current(msg.state)
        return
      }
      if (msg.type === 'xo-game-update') {
        setXoBoard(msg.update.board)
        setXoTurnId(msg.update.turnId)
        return
      }
      if (msg.type === 'xo-game-over') {
        setXoBoard(msg.result.board)
        setXoWinnerId(msg.result.winnerId)
        setXoReason(msg.result.reason)
        setXoPhase('results')
        return
      }
      if (msg.type === 'room-pin') {
        setPinsByRoom((prev) => {
          const next = new Map(prev)
          if (msg.pinned) next.set(msg.roomId, msg.pinned)
          else next.delete(msg.roomId)
          return next
        })
        const currentRoom = roomIdRef.current
        if (currentRoom && msg.roomId === currentRoom && msg.byId !== 'system') {
          pushRoomSys(
            msg.byName,
            msg.pinned ? `📌 ปักหมุด: ${msg.pinned.text.slice(0, 80)}` : '📌 เลิกปักหมุดแล้ว',
            currentRoom,
          )
        }
        return
      }
      if (msg.type !== 'room-lock') return
      setLockedRooms((prev) => {
        const next = new Set(prev)
        if (msg.locked) next.add(msg.roomId)
        else next.delete(msg.roomId)
        lockedRoomsRef.current = next
        sceneRef.current?.setRoomLocks(next)
        return next
      })
      const currentRoom = roomIdRef.current
      if (currentRoom && msg.roomId === currentRoom && msg.byId !== 'system') {
        pushRoomSys(
          msg.byName,
          msg.locked ? '🔒 ล็อกห้องแล้ว' : '🔓 ปลดล็อกห้องแล้ว',
          currentRoom,
        )
      }
    })

    const globalChat = new GlobalChatBus(net, session.id)
    globalChatRef.current = globalChat
    const unsubChat = globalChat.subscribe(setGlobalMsgs)

    const dmChat = new DmChatBus(net, session.id)
    dmChatRef.current = dmChat
    const unsubDm = dmChat.subscribe(setDmThread)
    const unsubDmUnread = dmChat.subscribeUnread(() => setDmUnreadTick((n) => n + 1))

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
          { id: nanoid(6), emoji: ev.emoji, fromId: ev.fromId, fromName: ev.fromName },
        ])
      }
    })

    const media = new RoomMedia(
      bus,
      session.id,
      (streams) => {
        const host = audioHostRef.current
        if (!host) return
        const seen = new Set<string>()
        for (const [id, stream] of streams) {
          const audioTracks = stream.getAudioTracks().filter((t) => t.readyState !== 'ended')
          if (audioTracks.length === 0) continue
          audioTracks.forEach((t) => {
            t.enabled = true
          })
          seen.add(id)
          let audio = host.querySelector(`audio[data-peer="${CSS.escape(id)}"]`) as HTMLAudioElement | null
          if (!audio) {
            audio = document.createElement('audio')
            audio.autoplay = true
            audio.muted = false
            audio.volume = 1
            audio.setAttribute('playsinline', 'true')
            audio.dataset.peer = id
            host.appendChild(audio)
          }
          if (audio.srcObject !== stream) audio.srcObject = stream
          void audio.play().catch(() => undefined)
        }
        for (const el of [...host.querySelectorAll('audio')]) {
          const peer = (el as HTMLAudioElement).dataset.peer
          if (peer && !seen.has(peer)) el.remove()
        }
        resumeAudioRef.current?.()
        if (recorderRef.current?.recording) {
          recorderRef.current.setAudioSources(mediaRef.current?.collectAudioStreams() ?? [])
        }
      },
      (stream, fromId) => {
        screenStreamRef.current = stream
        setScreenFrom(fromId)
        // Sharing button/state follows *local* outbound share only — not whoever is on the preview.
        setSharing(fromId === session.id)
      },
      setRoomMsgs,
    )
    mediaRef.current = media

    const resumeAudio = () => {
      const host = audioHostRef.current
      if (!host) return
      for (const el of host.querySelectorAll('audio')) {
        void (el as HTMLAudioElement).play().catch(() => undefined)
      }
    }
    window.addEventListener('pointerdown', resumeAudio)
    window.addEventListener('keydown', resumeAudio)
    resumeAudioRef.current = resumeAudio

    const onLeave = () => bus.leave(session.id)
    window.addEventListener('beforeunload', onLeave)

    return () => {
      window.removeEventListener('beforeunload', onLeave)
      window.removeEventListener('pointerdown', resumeAudio)
      window.removeEventListener('keydown', resumeAudio)
      resumeAudioRef.current = null
      onLeave()
      unsub()
      unsubLock()
      unsubChat()
      unsubDm()
      unsubDmUnread()
      unsubAct()
      void media.destroy()
      globalChat.destroy()
      dmChat.destroy()
      activity.destroy()
      bus.destroy()
      net.destroy()
      netRef.current = null
      dmChatRef.current = null
    }
  }, [session.id, session.email, session.look, applyLocks, pushRoomSys, logout, map, setLastPose])

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
      if (!worldActiveRef.current) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (moveCodes.has(e.code)) {
        e.preventDefault()
        keys.current.add(e.code)
      }
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat && !crouchingRef.current) {
          sceneRef.current?.jump()
          jumpAtRef.current = Date.now()
          publishRef.current()
        }
      }
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        e.preventDefault()
        if (!crouchingRef.current) {
          crouchingRef.current = true
          publishRef.current()
        }
      }
      if (e.code === 'KeyE' && !e.repeat) {
        e.preventDefault()
        const look = lookRef.current
        if (look.species === 'male' || look.species === 'female') {
          sceneRef.current?.slapTray()
          slapAtRef.current = Date.now()
          publishRef.current()
          return
        }
        if (look.species !== 'animal') return
        const kind = normalizeAnimalKind(look.animalKind)
        if (kind === 'dragon') {
          sceneRef.current?.breathFire()
          fireAtRef.current = Date.now()
          publishRef.current()
        } else if (kind === 'godzilla') {
          sceneRef.current?.bite()
          biteAtRef.current = Date.now()
          publishRef.current()
        } else if (kind === 'snake') {
          sceneRef.current?.spitPoison()
          spitAtRef.current = Date.now()
          publishRef.current()
        }
      }
      if (e.code === 'KeyF' && !e.repeat) {
        e.preventDefault()
        tryStartFishingRef.current()
      }
      if (e.code === 'KeyM' && !e.repeat) {
        e.preventDefault()
        toggleVoiceRef.current()
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
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        // Stay crouched if the other Ctrl is still held
        if (!e.getModifierState('Control') && crouchingRef.current) {
          crouchingRef.current = false
          publishRef.current()
        }
      }
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

  // Back from character editor: keep talking — revive audio + peer links immediately.
  useEffect(() => {
    const wasActive = wasWorldActiveRef.current
    wasWorldActiveRef.current = worldActive
    if (!worldActive || wasActive) return

    resumeAudioRef.current?.()
    const room = roomAt(map, pos.current.x, pos.current.y)
    if (!room || !mediaRef.current) return
    const peerIds = peersRef.current.filter((p) => p.roomId === room.id).map((p) => p.id)
    void mediaRef.current.refreshConnections(peerIds, true)
  }, [worldActive, map])

  // 3D scene + movement loop
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const scene = new CampusScene(canvas, map, session.look)
    sceneRef.current = scene
    scene.setRoomLocks(lockedRoomsRef.current)

    let raf = 0
    let last = performance.now()
    let lastUi = { roomName: null as string | null, roomId: null as string | null, in: 0, max: 0 }
    let lastPeerKey = ''
    let lastNetSend = 0
    let lastHeal = 0
    let lastNetX = pos.current.x
    let lastNetY = pos.current.y
    let lastNetFacing = facing.current
    let lastNearWater: boolean | null = null

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

    const canFly = canFlyOverWater(session.look)

    const tryMove = (nx: number, ny: number) => {
      let x = nx
      let y = ny
      // Racers stay on the pink pad until they quit the overlay
      if (fgRoleRef.current === 'player') {
        const fg = map.rooms.find((r) => r.id === FALLGUYS_ROOM_ID)
        if (fg) {
          const inset = TILE * 0.55
          x = Math.min(Math.max(x, fg.x * TILE + inset), (fg.x + fg.w) * TILE - inset)
          y = Math.min(Math.max(y, fg.y * TILE + inset), (fg.y + fg.h) * TILE - inset)
        }
      }
      if (xoRoleRef.current === 'player') {
        const xo = map.rooms.find((r) => r.id === XO_ROOM_ID)
        if (xo) {
          const inset = TILE * 0.55
          x = Math.min(Math.max(x, xo.x * TILE + inset), (xo.x + xo.w) * TILE - inset)
          y = Math.min(Math.max(y, xo.y * TILE + inset), (xo.y + xo.h) * TILE - inset)
        }
      }
      const radius = 8
      const samples = [
        [x, y],
        [x - radius, y],
        [x + radius, y],
        [x, y - radius],
        [x, y + radius],
      ]
      for (const [sx, sy] of samples) {
        const tx = Math.floor(sx / TILE)
        const ty = Math.floor(sy / TILE)
        if (!canTraverse(map, tx, ty, canFly)) return
      }
      const prevRoom = roomAt(map, pos.current.x, pos.current.y)
      const nextRoom = roomAt(map, x, y)
      if (fgRoleRef.current === 'player' && nextRoom?.id !== FALLGUYS_ROOM_ID) return
      if (xoRoleRef.current === 'player' && nextRoom?.id !== XO_ROOM_ID) return
      if (nextRoom && (!prevRoom || prevRoom.id !== nextRoom.id)) {
        if (lockedRoomsRef.current.has(nextRoom.id)) return
        // XO is an open plaza pad but still hard-caps at 2 players
        if (!isUnlimited(nextRoom) || nextRoom.id === XO_ROOM_ID) {
          const others = peersRef.current.filter((p) => p.roomId === nextRoom.id).length
          if (others + 1 > nextRoom.capacity) return
        }
      }
      const roomChanged = (prevRoom?.id ?? null) !== (nextRoom?.id ?? null)
      pos.current.x = x
      pos.current.y = y
      // Entering/leaving game pads must update server roomId immediately for lobby counts
      if (roomChanged) publishRef.current()
    }

    const maintainMedia = (now: number) => {
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

      // While editing character, still heal dead peer links so both sides keep talking.
      if (!worldActiveRef.current && mediaRef.current && nextRoomId && now - lastHeal > 2000) {
        lastHeal = now
        void mediaRef.current.refreshConnections(
          inRoomPeers.map((p) => p.id),
          false,
        )
      }

      return { peers, movingRoom: !!nextRoomId }
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      if (!worldActiveRef.current) {
        keys.current.clear()
        stickRef.current = { x: 0, y: 0 }
        if (crouchingRef.current) {
          crouchingRef.current = false
          publishRef.current()
        }
        maintainMedia(now)
        raf = requestAnimationFrame(tick)
        return
      }

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

      const crouching = crouchingRef.current
      let moving = false
      if (dx !== 0 || dy !== 0) {
        // Any move control recenters the minimap / camera on the player
        scene.resetCameraPan()
        // Walking cancels fishing
        if (fishingActiveRef.current) stopFishingRef.current()
        const len = Math.hypot(dx, dy) || 1
        dx /= len
        dy /= len
        if (Math.abs(dx) > Math.abs(dy)) facing.current = dx < 0 ? 'left' : 'right'
        else facing.current = dy < 0 ? 'up' : 'down'
        const step = SPEED * (crouching ? 0.45 : 1) * dt
        tryMove(pos.current.x + dx * step, pos.current.y)
        tryMove(pos.current.x, pos.current.y + dy * step)
        moving = true
      } else if (fishingActiveRef.current) {
        // Keep facing the cast target so pose + line stay aligned to the pond
        const target = nearestWaterCastTarget(map, pos.current.x, pos.current.y)
        if (target) {
          facing.current = CampusScene.facingTowardWater(
            pos.current.x,
            pos.current.y,
            target.x,
            target.y,
          )
        }
      }

      const atEdge = isAtWaterEdge(map, pos.current.x, pos.current.y)
      if (atEdge !== lastNearWater) {
        lastNearWater = atEdge
        setNearWater(atEdge)
      }
      if (fishingActiveRef.current && !atEdge) {
        stopFishingRef.current()
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

      const { peers } = maintainMedia(now)
      scene.syncPeers(peers, map, dt)
      scene.render(map, pos.current.x, pos.current.y, facing.current, moving, dt, crouching)
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
    if (roomId) {
      // Entering a room: try to unmute remote audio (mic stays off until user enables it).
      resumeAudioRef.current?.()
      return
    }
    setMediaError(null)
    setVoiceOn(false)
    sceneRef.current?.setLocalMic(false)
    setHandRaised(false)
    setRaisedHands([])
    setActivePoll(null)
    setPollOpen(false)
    setWheelOpen(false)
    setFloatEmojis([])
    setScreenFs(false)
    void stopRecordingIfNeeded()
    void (async () => {
      await mediaRef.current?.setVoice(false)
      await mediaRef.current?.stopScreenShare()
      // Drop preview after local stop — do not keep showing remotes outside a room.
      setScreenFrom(null)
      setSharing(false)
      screenStreamRef.current = null
    })()
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
      sceneRef.current?.setLocalMic(next)
      if (recorderRef.current?.recording) {
        recorderRef.current.setAudioSources(mediaRef.current?.collectAudioStreams() ?? [])
      }
    } catch (err) {
      setMediaError(mediaErrMessage(err, 'ไม่สามารถเปิดไมโครโฟนได้'))
    }
  }
  toggleVoiceRef.current = () => {
    void toggleVoice()
  }

  async function toggleShare() {
    if (!roomId) return
    setMediaError(null)
    try {
      if (sharing) {
        // Stop only our outbound share; RoomMedia keeps/restores remote shares on the preview.
        await stopRecordingIfNeeded()
        await mediaRef.current?.stopScreenShare()
      } else {
        await mediaRef.current?.startScreenShare()
      }
    } catch (err) {
      setMediaError(mediaErrMessage(err, 'ยกเลิกหรือไม่สามารถแชร์จอได้'))
    }
  }

  function toggleRoomLock() {
    if (!roomId) return
    const room = map.rooms.find((r) => r.id === roomId)
    if (!room || room.kind === 'plaza') return
    const locked = lockedRooms.has(roomId)
    netRef.current?.send({ type: 'room-lock', roomId, locked: !locked })
  }

  const clearFishTimer = useCallback(() => {
    if (fishTimerRef.current != null) {
      window.clearTimeout(fishTimerRef.current)
      fishTimerRef.current = null
    }
  }, [])

  const stopFishing = useCallback(() => {
    clearFishTimer()
    fishPhaseRef.current = 'idle'
    fishingActiveRef.current = false
    setFishingActive(false)
    setFishCatch(null)
    fishCastRef.current = null
    sceneRef.current?.setFishingCast(false, null)
    publishRef.current()
  }, [clearFishTimer])
  stopFishingRef.current = stopFishing

  const beginFishCast = useCallback(() => {
    if (!isAtWaterEdge(map, pos.current.x, pos.current.y)) {
      stopFishing()
      return
    }
    const target = nearestWaterCastTarget(map, pos.current.x, pos.current.y)
    if (!target) {
      stopFishing()
      return
    }
    // Face the pond so the cast reads correctly from any shoreline
    facing.current = CampusScene.facingTowardWater(
      pos.current.x,
      pos.current.y,
      target.x,
      target.y,
    )
    clearFishTimer()
    fishPhaseRef.current = 'waiting'
    fishingActiveRef.current = true
    setFishingActive(true)
    setFishCatch(null)
    fishCastRef.current = { x: target.x, y: target.y }
    sceneRef.current?.setFishingCast(true, target)
    publishRef.current()
    const wait = randomFishWaitMs()
    fishTimerRef.current = window.setTimeout(() => {
      if (!fishingActiveRef.current) return
      if (!isAtWaterEdge(map, pos.current.x, pos.current.y)) {
        stopFishing()
        return
      }
      const caught = randomFishingCatch()
      fishPhaseRef.current = 'catch'
      setFishCatch(caught)
      fishCastRef.current = null
      sceneRef.current?.setFishingCast(false, null)
      publishRef.current()
      fishTimerRef.current = window.setTimeout(() => {
        setFishCatch(null)
        if (!fishingActiveRef.current) return
        if (isAtWaterEdge(map, pos.current.x, pos.current.y)) {
          beginFishCast()
        } else {
          stopFishing()
        }
      }, FISH_CATCH_SHOW_MS)
    }, wait)
  }, [map, clearFishTimer, stopFishing])

  const tryStartFishing = useCallback(() => {
    if (!worldActiveRef.current) return
    if (fishPhaseRef.current !== 'idle') return
    if (!isAtWaterEdge(map, pos.current.x, pos.current.y)) return
    beginFishCast()
  }, [map, beginFishCast])
  tryStartFishingRef.current = tryStartFishing

  useEffect(() => {
    if (!roomId && roster === 'room') setRoster(null)
  }, [roomId, roster])

  useEffect(() => () => stopFishing(), [stopFishing])

  const canLockRoom = !!roomId && map.rooms.find((r) => r.id === roomId)?.kind === 'room'
  const roomIsLocked = !!(roomId && lockedRooms.has(roomId))

  const roomLabelFor = (id: string | null | undefined) => {
    if (!id) return 'นอกห้อง'
    return map.rooms.find((r) => r.id === id)?.name ?? id
  }

  const selfRoster = (inRoomOnly: boolean): RosterPerson | null => {
    if (inRoomOnly && !roomId) return null
    return {
      id: session.id,
      name: session.look.displayName,
      roomLabel: roomLabelFor(roomId),
      voiceOn,
      sharing,
      isSelf: true,
    }
  }

  const serverPeople: RosterPerson[] = [
    ...(selfRoster(false) ? [selfRoster(false)!] : []),
    ...peersLive.map((p) => ({
      id: p.id,
      name: p.look.displayName || p.email,
      roomLabel: roomLabelFor(p.roomId),
      voiceOn: p.voiceOn,
      sharing: p.sharing,
      dmUnread: dmChatRef.current?.getUnread(p.id) ?? 0,
    })),
  ]
  void dmUnreadTick // re-render when unread changes

  const roomPeople: RosterPerson[] = roomId
    ? [
        ...(selfRoster(true) ? [selfRoster(true)!] : []),
        ...peersLive
          .filter((p) => p.roomId === roomId)
          .map((p) => ({
            id: p.id,
            name: p.look.displayName || p.email,
            roomLabel: roomName,
            voiceOn: p.voiceOn,
            sharing: p.sharing,
          })),
      ]
    : []

  const canUseNameWheel = roomPeople.length > 3

  // Live zone occupancy from presence (matches who is standing on the pad)
  const fgZoneCount =
    peersLive.filter((p) => p.roomId === FALLGUYS_ROOM_ID).length +
    (roomId === FALLGUYS_ROOM_ID ? 1 : 0)
  const xoZoneCount =
    peersLive.filter((p) => p.roomId === XO_ROOM_ID).length +
    (roomId === XO_ROOM_ID ? 1 : 0)
  const xoZoneIds = [
    ...(roomId === XO_ROOM_ID ? [session.id] : []),
    ...peersLive.filter((p) => p.roomId === XO_ROOM_ID).map((p) => p.id),
  ]
  const fgZoneIds = [
    ...(roomId === FALLGUYS_ROOM_ID ? [session.id] : []),
    ...peersLive.filter((p) => p.roomId === FALLGUYS_ROOM_ID).map((p) => p.id),
  ]

  useEffect(() => {
    if (!canUseNameWheel && wheelOpen) setWheelOpen(false)
  }, [canUseNameWheel, wheelOpen])

  return (
    <div className="world">
      <header className="world__bar">
        <div className="world__brand">
          <img className="world__logo" src="/favicon.svg" alt="" width={28} height={28} />
          <div className="world__brand-text">
            <strong>TrueID Office</strong>
            <span>{session.look.displayName}</span>
          </div>
        </div>
        <div className="world__meta">
          <div className="world__meta-item">
            <button
              type="button"
              ref={onlineBtnRef}
              className={roster === 'server' ? 'world__online-btn is-open' : 'world__online-btn'}
              onClick={() => setRoster((v) => (v === 'server' ? null : 'server'))}
              title="รายชื่อคนออนไลน์ทั้งเซิร์ฟ"
            >
              ออนไลน์ {peerCount + 1}
            </button>
            <OnlineRoster
              open={roster === 'server'}
              title="ออนไลน์ทั้งเซิร์ฟ"
              people={serverPeople}
              onClose={() => setRoster(null)}
              anchorRef={onlineBtnRef}
              onStartDm={(person) => {
                dmChatRef.current?.open(person.id, person.name)
                setRoster(null)
              }}
            />
          </div>
          {roomName ? (
            <div className="world__meta-item">
              <button
                type="button"
                ref={roomBtnRef}
                className={roster === 'room' ? 'world__room-btn is-open' : 'world__room-btn'}
                onClick={() => setRoster((v) => (v === 'room' ? null : 'room'))}
                title="รายชื่อคนในห้องนี้"
              >
                {roomIsLocked ? '🔒 ' : ''}
                {roomName}
                {capacity.max > 0 ? ` · ${capacity.in}/${capacity.max}` : ` · ${capacity.in} คน · ไม่จำกัด`}
              </button>
              <OnlineRoster
                open={roster === 'room'}
                title={`ในห้อง · ${roomName}`}
                people={roomPeople}
                onClose={() => setRoster(null)}
                anchorRef={roomBtnRef}
              />
            </div>
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
        <Minimap map={map} sceneRef={sceneRef} playerRef={pos} />
        <FloatingEmojis
          items={floatEmojis}
          getAnchor={(fromId) => {
            const scene = sceneRef.current
            if (!scene) return null
            return scene.projectHeadScreen(fromId === session.id ? 'local' : fromId)
          }}
          onDone={(id) => setFloatEmojis((prev) => prev.filter((e) => e.id !== id))}
        />
        <FishingCatchOverlay catchItem={fishCatch} />
        {nearWater && !fishingActive && fgRole === 'none' && (
          <div className="world__fish-hint">กด F เพื่อตกปลา</div>
        )}
        {fishingActive && !fishCatch && (
          <div className="world__fish-hint is-wait">กำลังรอปลากัด… ดูทุ่นบนน้ำ</div>
        )}
        {roomId === FALLGUYS_ROOM_ID && fgRole === 'none' && fgRacePhase !== 'racing' && (
          <div className="world__fg-lobby">
            <strong>Fall Guys Arena</strong>
            <p>ในโซน {fgZoneCount} คน</p>
            {lobbyError && <p className="world__lobby-err">{lobbyError}</p>}
            <button
              type="button"
              disabled={fgZoneCount < 1}
              onClick={() => {
                setLobbyError(null)
                publishRef.current()
                const zoneIds = [...new Set(fgZoneIds)]
                window.setTimeout(() => {
                  netRef.current?.send({ type: 'fallguys-start', zoneIds })
                  void fetch('/api/fallguys/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: session.id, zoneIds }),
                  })
                    .then(async (res) => {
                      const data = (await res.json()) as { ok?: boolean; error?: string }
                      if (!res.ok || !data.ok) {
                        setLobbyError(data.error || `HTTP start failed (${res.status})`)
                      }
                    })
                    .catch((err) => setLobbyError(String(err)))
                }, 80)
              }}
            >
              {fgZoneCount < 1 ? 'รอผู้เล่น…' : 'เริ่มเกม'}
            </button>
          </div>
        )}
        {roomId === FALLGUYS_ROOM_ID && fgRole === 'none' && fgRacePhase === 'racing' && (
          <div className="world__fg-lobby">
            <strong>กำลังแข่งอยู่</strong>
            <p>ยืนในโซนเพื่อเข้าชม</p>
          </div>
        )}
        {roomId === XO_ROOM_ID && xoRole === 'none' && xoPhase !== 'playing' && (
          <div className="world__fg-lobby">
            <strong>{XO_ROOM_NAME}</strong>
            <p>ในโซน {xoZoneCount}/2 คน</p>
            {lobbyError && <p className="world__lobby-err">{lobbyError}</p>}
            <button
              type="button"
              disabled={xoZoneCount !== 2}
              onClick={() => {
                setLobbyError(null)
                publishRef.current()
                const zoneIds = [...new Set(xoZoneIds)].slice(0, 2)
                console.info('[xo] start click', {
                  zoneIds,
                  xoZoneCount,
                  roomId,
                  hasNet: !!netRef.current,
                })
                window.setTimeout(() => {
                  netRef.current?.send({ type: 'xo-start', zoneIds })
                  console.info('[xo] sent xo-start', { zoneIds })
                  // HTTP path — reliable when WS client→server frames never reach Node.
                  void fetch('/api/xo/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: session.id, zoneIds }),
                  })
                    .then(async (res) => {
                      const data = (await res.json()) as {
                        ok?: boolean
                        error?: string
                        build?: string
                        xo?: { phase?: string; zone?: unknown[] }
                      }
                      console.info('[xo] http start', res.status, data)
                      if (!res.ok || !data.ok) {
                        setLobbyError(
                          data.error ||
                            `HTTP start failed (${res.status}) build=${data.build ?? '?'}`,
                        )
                      } else if (data.build) {
                        setLobbyError(null)
                      }
                    })
                    .catch((err) => {
                      console.warn('[xo] http start error', err)
                      setLobbyError(`HTTP start error: ${String(err)}`)
                    })
                }, 80)
              }}
            >
              {xoZoneCount !== 2 ? 'รอผู้เล่น 2 คน' : 'เริ่มเกม'}
            </button>
          </div>
        )}
        {xoRole === 'player' && xoPhase !== 'idle' && (
          <XoGame
            selfId={session.id}
            gameId={xoGameId}
            players={xoPlayers}
            board={xoBoard}
            turnId={xoTurnId}
            phase={xoPhase === 'results' ? 'results' : 'playing'}
            winnerId={xoWinnerId}
            reason={xoReason}
            onMove={(cell) =>
              netRef.current?.send({ type: 'xo-move', gameId: xoGameId, cell })
            }
            onRestart={() =>
              netRef.current?.send({
                type: 'xo-restart',
                zoneIds: [...new Set(xoZoneIds)].slice(0, 2),
              })
            }
            onQuit={() => {
              netRef.current?.send({ type: 'xo-quit' })
              xoDismissedGameRef.current = xoGameId
              setXoRole('none')
              setXoPhase('idle')
            }}
          />
        )}
        {fgRole !== 'none' && (
          <FallGuysGame
            selfId={session.id}
            selfName={session.look.displayName}
            raceId={fgRaceId}
            players={fgPlayers}
            scores={fgScores}
            raceOver={fgRaceOver}
            spectating={fgRole === 'spectator'}
            onProgress={(progress, finished) => {
              if (fgRoleRef.current !== 'player') return
              netRef.current?.send({
                type: 'fallguys-progress',
                raceId: fgRaceIdRef.current,
                progress,
                finished,
              })
            }}
            onRestart={() =>
              netRef.current?.send({
                type: 'fallguys-restart',
                zoneIds: [...new Set(fgZoneIds)],
              })
            }
            onQuit={() => {
              netRef.current?.send({ type: 'fallguys-quit' })
              fgDismissedRaceRef.current = fgRaceIdRef.current
              setFgRole('none')
              if (fgRacePhaseRef.current === 'results') {
                setFgRacePhase('idle')
                setFgRaceOver(false)
              }
            }}
          />
        )}
        {(screenFrom || sharing) && (
          <div className={`world__screen ${screenFs ? 'is-fill' : 'is-pip'}`}>
            <div className="world__screen-bar">
              <p>
                {sharing
                  ? 'คุณกำลังแชร์จอ'
                  : screenFrom
                    ? 'กำลังรับแชร์จอ'
                    : 'แชร์จอ'}
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
          WASD / ลูกศร เดิน · Ctrl หมอบ · Space กระโดด · F ตกปลา · M ไมค์ · มังกรกด E พ่นไฟ ·
          โซนชมพู = Fall Guys · ลูกกลมเมาส์ / +− ซูม
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
              <button
                type="button"
                className={voiceOn ? 'on' : ''}
                onClick={() => void toggleVoice()}
                title={voiceOn ? 'ปิดไมค์' : 'เปิดไมค์'}
                aria-label={voiceOn ? 'ปิดไมค์' : 'เปิดไมค์'}
              >
                {voiceOn ? '🔇' : '🎤'}
              </button>
              <button
                type="button"
                className={sharing ? 'on share' : ''}
                onClick={() => void toggleShare()}
                title={sharing ? 'หยุดแชร์จอ' : 'แชร์จอ'}
                aria-label={sharing ? 'หยุดแชร์จอ' : 'แชร์จอ'}
              >
                {sharing ? '⏹️' : '🖥️'}
              </button>
              {canLockRoom && (
                <button
                  type="button"
                  className={roomIsLocked ? 'on lock' : ''}
                  onClick={toggleRoomLock}
                  title={
                    roomIsLocked
                      ? 'ปลดล็อก — คนนอกจะเข้าห้องได้อีกครั้ง'
                      : 'ล็อกห้อง — คนนอกเข้าไม่ได้ / ไม่ได้ยินเสียงหรือแชร์จอ'
                  }
                  aria-label={roomIsLocked ? 'ปลดล็อกห้อง' : 'ล็อกห้อง'}
                >
                  {roomIsLocked ? '🔓' : '🔒'}
                </button>
              )}
              <button
                type="button"
                className={wheelOpen ? 'on' : ''}
                disabled={!canUseNameWheel}
                title={
                  canUseNameWheel
                    ? 'วงล้อสุ่มชื่อสมาชิกในห้อง'
                    : 'ใช้ได้เมื่อมีสมาชิกในห้องมากกว่า 3 คน'
                }
                aria-label="สุ่มชื่อ"
                onClick={() => setWheelOpen((v) => !v)}
              >
                🎡
              </button>
              {(screenFrom || sharing) && (
                <>
                  <button
                    type="button"
                    className={screenFs ? 'on' : ''}
                    onClick={() => setScreenFs((v) => !v)}
                    title={screenFs ? 'ย่อแชร์จอ' : 'เต็มพื้นที่แมพ'}
                    aria-label={screenFs ? 'ย่อแชร์จอ' : 'เต็มพื้นที่แมพ'}
                  >
                    {screenFs ? '⤓' : '⛶'}
                  </button>
                  <button
                    type="button"
                    className={recording ? 'on rec' : ''}
                    onClick={() => void toggleRecording()}
                    title={recording ? 'หยุดอัด · ดาวน์โหลด' : 'อัดภาพ+เสียง'}
                    aria-label={recording ? 'หยุดอัด' : 'อัดภาพ+เสียง'}
                  >
                    {recording ? '⏹️' : '⏺️'}
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

        <div className={`world__chats${roomId && !globalChatExpanded ? ' global-collapsed' : ''}`}>
          <ChatPanel
            channel="global"
            messages={globalMsgs}
            enabled
            placeholder="Global chat…"
            collapsed={!!roomId && !globalChatExpanded}
            onToggleCollapse={
              roomId ? () => setGlobalChatExpanded((v) => !v) : undefined
            }
            onSend={(text) => globalChatRef.current?.send(session.look.displayName, text)}
          />
          {roomId && (
            <>
              <ChatPanel
                channel="room"
                messages={roomMsgs}
                enabled
                placeholder="Room chat…"
                pinned={pinsByRoom.get(roomId) ?? null}
                onPinMessage={(message) => {
                  // Ensure server has current roomId before pin auth check
                  publishRef.current()
                  const pinned: PinnedMessage = {
                    roomId,
                    messageId: message.id,
                    text: message.text,
                    fromId: message.fromId,
                    fromName: message.fromName,
                    at: message.at,
                    pinnedById: session.id,
                    pinnedByName: session.look.displayName,
                    pinnedAt: Date.now(),
                  }
                  setPinsByRoom((prev) => {
                    const next = new Map(prev)
                    next.set(roomId, pinned)
                    return next
                  })
                  netRef.current?.send({ type: 'room-pin', roomId, message })
                }}
                onUnpin={() => {
                  publishRef.current()
                  setPinsByRoom((prev) => {
                    const next = new Map(prev)
                    next.delete(roomId)
                    return next
                  })
                  netRef.current?.send({ type: 'room-pin', roomId, message: null })
                }}
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
              {wheelOpen && (
                <NameWheel
                  members={roomPeople.map((p) => ({ id: p.id, name: p.name }))}
                  onClose={() => setWheelOpen(false)}
                />
              )}
            </>
          )}
        </div>

        <div ref={audioHostRef} className="world__audio-host" hidden />
      </aside>

      {dmThread && (
        <DmPanel
          peerName={dmThread.peerName}
          messages={dmThread.messages}
          selfId={session.id}
          onSend={(text) => dmChatRef.current?.send(session.look.displayName, text)}
          onClose={() => dmChatRef.current?.close()}
        />
      )}
    </div>
  )
}
