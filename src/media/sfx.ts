import { TILE } from '../world/terrain'

/** Lightweight one-shot SFX — each clip finishes before it can play again. */

const active = new Map<string, HTMLAudioElement>()

const PUBLIC_CHAT_MUTE_KEY = 'trueid-office-public-chat-alert-muted'
/** Global / room alerts — quieter than DM by default. */
const PUBLIC_CHAT_VOLUME = 0.28
/** Private DM alerts — louder so they stand out. */
const DM_CHAT_VOLUME = 0.78
/** World combat / pet cries — hear only within this many tiles of the source. */
export const SFX_HEAR_TILES = 5

let listenerX = 0
let listenerY = 0

/** Local player position in map pixels — call each frame / before world SFX. */
export function setSfxListener(px: number, py: number) {
  listenerX = px
  listenerY = py
}

function play(src: string, volume = 0.75, lockKey = src) {
  if (active.has(lockKey)) return
  try {
    const audio = new Audio(src)
    audio.volume = Math.max(0, Math.min(1, volume))
    const clear = () => {
      if (active.get(lockKey) === audio) active.delete(lockKey)
    }
    audio.addEventListener('ended', clear)
    audio.addEventListener('error', clear)
    active.set(lockKey, audio)
    void audio.play().catch(() => {
      clear()
    })
  } catch {
    active.delete(lockKey)
  }
}

/** Play only if the listener is within {@link SFX_HEAR_TILES} of the source (pixel coords). */
function playWorld(src: string, baseVolume: number, sourcePx: number, sourcePy: number, lockKey = src) {
  const distTiles = Math.hypot(sourcePx - listenerX, sourcePy - listenerY) / TILE
  if (distTiles > SFX_HEAR_TILES) return
  play(src, baseVolume, lockKey)
}

function readPublicChatMuted(): boolean {
  try {
    return localStorage.getItem(PUBLIC_CHAT_MUTE_KEY) === '1'
  } catch {
    return false
  }
}

let publicChatAlertMuted = readPublicChatMuted()

export function isPublicChatAlertMuted() {
  return publicChatAlertMuted
}

export function setPublicChatAlertMuted(muted: boolean) {
  publicChatAlertMuted = muted
  try {
    localStorage.setItem(PUBLIC_CHAT_MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

export function playMetallicClang(sourcePx: number, sourcePy: number) {
  playWorld('/sounds/metallic-clang.mp3', 0.28, sourcePx, sourcePy)
}

export function playPoisonSpit(sourcePx: number, sourcePy: number) {
  playWorld('/sounds/poison-spit.mp3', 0.22, sourcePx, sourcePy)
}

export function playGodzillaBite(sourcePx: number, sourcePy: number) {
  playWorld('/sounds/godzilla-bite.mp3', 0.3, sourcePx, sourcePy)
}

export function playDragonFire(sourcePx: number, sourcePy: number) {
  playWorld('/sounds/dragon-fire.mp3', 0.26, sourcePx, sourcePy)
}

export function playDogBark(sourcePx: number, sourcePy: number) {
  playWorld('/sounds/dog-bark.mp3', 0.32, sourcePx, sourcePy)
}

export function playCatMeow(sourcePx: number, sourcePy: number) {
  playWorld('/sounds/cat-meow.mp3', 0.32, sourcePx, sourcePy)
}

/** Incoming global or room chat (quieter; respects mute). */
export function playChatPublicIncoming() {
  if (publicChatAlertMuted) return
  play('/sounds/chat-incoming.mp3', PUBLIC_CHAT_VOLUME, 'chat-alert-public')
}

/** Incoming private DM — louder than public chat alerts. */
export function playChatDmIncoming() {
  play('/sounds/chat-incoming.mp3', DM_CHAT_VOLUME, 'chat-alert-dm')
}
