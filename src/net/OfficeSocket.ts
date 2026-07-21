import type { ClientMsg, ServerMsg } from '../../shared/protocol'

function defaultWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Dev: Vite proxies /ws → server. Prod: same host or VITE_WS_URL.
  if (import.meta.env.VITE_WS_URL) return String(import.meta.env.VITE_WS_URL)
  return `${proto}//${location.host}/ws`
}

function defaultApiBase() {
  if (import.meta.env.VITE_API_URL) return String(import.meta.env.VITE_API_URL)
  return ''
}

type Handler = (msg: ServerMsg) => void

/**
 * Shared WebSocket to the multiplayer server (presence, signal, chat, activity).
 */
export class OfficeSocket {
  private ws: WebSocket | null = null
  private handlers = new Set<Handler>()
  private queue: ClientMsg[] = []
  private openHooks = new Set<() => void>()
  private selfId: string
  private closed = false
  private retryMs = 800

  constructor(selfId: string) {
    this.selfId = selfId
    this.connect()
  }

  private connect() {
    if (this.closed) return
    const ws = new WebSocket(defaultWsUrl())
    this.ws = ws
    ws.onopen = () => {
      this.retryMs = 800
      // Re-auth / hello before flushing queued messages (needed after reconnect).
      this.openHooks.forEach((fn) => {
        try {
          fn()
        } catch {
          /* ignore */
        }
      })
      for (const msg of this.queue) ws.send(JSON.stringify(msg))
      this.queue = []
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMsg
        this.handlers.forEach((fn) => fn(msg))
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => {
      this.ws = null
      if (this.closed) return
      window.setTimeout(() => this.connect(), this.retryMs)
      this.retryMs = Math.min(8000, this.retryMs * 1.5)
    }
  }

  /** Runs on every successful open (including reconnects). */
  onOpen(fn: () => void) {
    this.openHooks.add(fn)
    if (this.ws?.readyState === WebSocket.OPEN) fn()
    return () => this.openHooks.delete(fn)
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      this.queue.push(msg)
    }
  }

  subscribe(fn: Handler) {
    this.handlers.add(fn)
    return () => this.handlers.delete(fn)
  }

  destroy() {
    this.closed = true
    this.handlers.clear()
    this.openHooks.clear()
    this.ws?.close()
    this.ws = null
  }

  get id() {
    return this.selfId
  }
}

export async function fetchAppearance(email: string) {
  const res = await fetch(
    `${defaultApiBase()}/api/appearance?email=${encodeURIComponent(email.trim().toLowerCase())}`,
  )
  if (!res.ok) return { look: null, lastPose: null }
  const data = (await res.json()) as {
    look: import('../types').CharacterLook | null
    lastPose?: { x: number; y: number; facing: import('../types').Facing } | null
  }
  return { look: data.look ?? null, lastPose: data.lastPose ?? null }
}

export async function putAppearance(email: string, look: import('../types').CharacterLook) {
  const res = await fetch(`${defaultApiBase()}/api/appearance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), look }),
  })
  return res.ok
}
