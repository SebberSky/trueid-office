/** Lightweight one-shot SFX helpers (HTMLAudioElement). */

function play(src: string, volume = 0.75) {
  try {
    const audio = new Audio(src)
    audio.volume = volume
    void audio.play().catch(() => undefined)
  } catch {
    /* autoplay / missing asset */
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
