/** Lightweight one-shot SFX — each clip finishes before it can play again. */

const active = new Map<string, HTMLAudioElement>()

const PUBLIC_CHAT_MUTE_KEY = 'trueid-office-public-chat-alert-muted'
/** Global / room alerts — quieter than DM by default. */
const PUBLIC_CHAT_VOLUME = 0.28
/** Private DM alerts — louder so they stand out. */
const DM_CHAT_VOLUME = 0.78

function play(src: string, volume = 0.75, lockKey = src) {
  if (active.has(lockKey)) return
  try {
    const audio = new Audio(src)
    audio.volume = volume
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

export function playMetallicClang() {
  play('/sounds/metallic-clang.mp3', 0.28)
}

export function playPoisonSpit() {
  play('/sounds/poison-spit.mp3', 0.22)
}

export function playGodzillaBite() {
  play('/sounds/godzilla-bite.mp3', 0.3)
}

export function playDragonFire() {
  play('/sounds/dragon-fire.mp3', 0.26)
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
