/** Lightweight one-shot SFX — each clip finishes before it can play again. */

const active = new Map<string, HTMLAudioElement>()

function play(src: string, volume = 0.75) {
  if (active.has(src)) return
  try {
    const audio = new Audio(src)
    audio.volume = volume
    const clear = () => {
      if (active.get(src) === audio) active.delete(src)
    }
    audio.addEventListener('ended', clear)
    audio.addEventListener('error', clear)
    active.set(src, audio)
    void audio.play().catch(() => {
      clear()
    })
  } catch {
    active.delete(src)
  }
}

export function playMetallicClang() {
  play('/sounds/metallic-clang.mp3', 0.75)
}

export function playPoisonSpit() {
  play('/sounds/poison-spit.mp3', 0.65)
}

export function playGodzillaBite() {
  play('/sounds/godzilla-bite.mp3', 0.8)
}

/** Incoming chat — global, room, or DM from someone else. */
export function playChatIncoming() {
  play('/sounds/chat-incoming.mp3', 0.7)
}
