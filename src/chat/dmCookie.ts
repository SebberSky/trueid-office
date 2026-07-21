import type { DmMessage } from './types'

const TTL_MS = 24 * 60 * 60 * 1000
const MAX_MSGS = 40
const PREFIX = 'tid_dm_'

type ThreadPayload = {
  /** Absolute expiry — thread wiped after this. */
  exp: number
  peerName: string
  messages: DmMessage[]
}

function cookieName(peerId: string) {
  // Keep name short & cookie-safe
  const safe = peerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
  return `${PREFIX}${safe || 'x'}`
}

function readRaw(name: string): string | null {
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    if (k !== name) continue
    return part.slice(idx + 1)
  }
  return null
}

function writeCookie(name: string, value: string, maxAgeSec: number) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value}; path=/; max-age=${Math.max(0, maxAgeSec)}; SameSite=Lax${secure}`
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}

/** Load DM thread for peer; clears cookie if past 24h. */
export function loadDmThread(peerId: string): { peerName: string; messages: DmMessage[] } {
  const name = cookieName(peerId)
  const raw = readRaw(name)
  if (!raw) return { peerName: '', messages: [] }
  try {
    const data = JSON.parse(decodeURIComponent(raw)) as ThreadPayload
    if (!data?.exp || Date.now() >= data.exp) {
      clearCookie(name)
      return { peerName: '', messages: [] }
    }
    return {
      peerName: typeof data.peerName === 'string' ? data.peerName : '',
      messages: Array.isArray(data.messages) ? data.messages.slice(-MAX_MSGS) : [],
    }
  } catch {
    clearCookie(name)
    return { peerName: '', messages: [] }
  }
}

/** Persist DM thread; first write starts a 24h clock. */
export function saveDmThread(peerId: string, peerName: string, messages: DmMessage[]) {
  const name = cookieName(peerId)
  const existing = readRaw(name)
  let exp = Date.now() + TTL_MS
  if (existing) {
    try {
      const prev = JSON.parse(decodeURIComponent(existing)) as ThreadPayload
      if (prev?.exp && Date.now() < prev.exp) exp = prev.exp
      else {
        clearCookie(name)
      }
    } catch {
      /* fresh */
    }
  }
  if (Date.now() >= exp) {
    clearCookie(name)
    return
  }
  const payload: ThreadPayload = {
    exp,
    peerName,
    messages: messages.slice(-MAX_MSGS),
  }
  const encoded = encodeURIComponent(JSON.stringify(payload))
  // Cookie budget ~4KB — drop older msgs until it fits
  let msgs = payload.messages
  let value = encoded
  while (msgs.length > 1 && value.length > 3500) {
    msgs = msgs.slice(1)
    value = encodeURIComponent(JSON.stringify({ ...payload, messages: msgs }))
  }
  if (value.length > 3800) {
    // Still too big — keep only latest few
    msgs = msgs.slice(-8)
    value = encodeURIComponent(JSON.stringify({ ...payload, messages: msgs }))
  }
  const maxAgeSec = Math.max(1, Math.ceil((exp - Date.now()) / 1000))
  writeCookie(name, value, maxAgeSec)
}

export function clearDmThread(peerId: string) {
  clearCookie(cookieName(peerId))
}
