import type { DmMessage } from './types'

const TTL_MS = 24 * 60 * 60 * 1000
const MAX_MSGS = 40
const PREFIX = 'tid_dm_'
/** Mirror cookie in localStorage — cookies can silently fail (size/quota); still honor 24h TTL. */
const LS_PREFIX = 'tid_dm_ls_'

type ThreadPayload = {
  /** Absolute expiry — thread wiped after this. */
  exp: number
  peerName: string
  messages: DmMessage[]
}

function cookieName(peerId: string) {
  const safe = peerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
  return `${PREFIX}${safe || 'x'}`
}

function lsKey(peerId: string) {
  const safe = peerId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
  return `${LS_PREFIX}${safe || 'x'}`
}

function readRawCookie(name: string): string | null {
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

function parsePayload(raw: string): ThreadPayload | null {
  try {
    // Cookie values may already be decoded by the browser
    let text = raw
    try {
      text = decodeURIComponent(raw)
    } catch {
      text = raw
    }
    const data = JSON.parse(text) as ThreadPayload
    if (!data?.exp || !Array.isArray(data.messages)) return null
    return data
  } catch {
    return null
  }
}

function readLs(peerId: string): ThreadPayload | null {
  try {
    const raw = localStorage.getItem(lsKey(peerId))
    if (!raw) return null
    return parsePayload(raw)
  } catch {
    return null
  }
}

function writeLs(peerId: string, payload: ThreadPayload) {
  try {
    localStorage.setItem(lsKey(peerId), JSON.stringify(payload))
  } catch {
    /* quota */
  }
}

function clearLs(peerId: string) {
  try {
    localStorage.removeItem(lsKey(peerId))
  } catch {
    /* ignore */
  }
}

/** Load DM thread for peer; clears storage if past 24h. */
export function loadDmThread(peerId: string): { peerName: string; messages: DmMessage[] } {
  const name = cookieName(peerId)
  const fromCookie = readRawCookie(name)
  const cookieData = fromCookie ? parsePayload(fromCookie) : null
  const lsData = readLs(peerId)
  const data =
    cookieData && lsData
      ? cookieData.exp >= lsData.exp
        ? cookieData
        : lsData
      : cookieData || lsData

  if (!data) return { peerName: '', messages: [] }
  if (Date.now() >= data.exp) {
    clearCookie(name)
    clearLs(peerId)
    return { peerName: '', messages: [] }
  }
  return {
    peerName: typeof data.peerName === 'string' ? data.peerName : '',
    messages: data.messages.slice(-MAX_MSGS),
  }
}

/** Persist DM thread; first write starts a 24h clock. */
export function saveDmThread(peerId: string, peerName: string, messages: DmMessage[]) {
  const name = cookieName(peerId)
  const existing = loadDmThread(peerId)
  // loadDmThread already cleared if expired — start fresh clock when empty history was wiped
  let exp = Date.now() + TTL_MS
  const fromCookie = readRawCookie(name)
  const cookieData = fromCookie ? parsePayload(fromCookie) : null
  const lsData = readLs(peerId)
  const prev = cookieData || lsData
  if (prev?.exp && Date.now() < prev.exp) exp = prev.exp

  if (Date.now() >= exp) {
    clearCookie(name)
    clearLs(peerId)
    return
  }

  const payload: ThreadPayload = {
    exp,
    peerName: peerName || existing.peerName,
    messages: messages.slice(-MAX_MSGS),
  }

  writeLs(peerId, payload)

  let msgs = payload.messages
  let value = encodeURIComponent(JSON.stringify({ ...payload, messages: msgs }))
  while (msgs.length > 1 && value.length > 3500) {
    msgs = msgs.slice(1)
    value = encodeURIComponent(JSON.stringify({ ...payload, messages: msgs }))
  }
  if (value.length > 3800) {
    msgs = msgs.slice(-8)
    value = encodeURIComponent(JSON.stringify({ ...payload, messages: msgs }))
  }
  const maxAgeSec = Math.max(1, Math.ceil((exp - Date.now()) / 1000))
  writeCookie(name, value, maxAgeSec)
}

export function clearDmThread(peerId: string) {
  clearCookie(cookieName(peerId))
  clearLs(peerId)
}
