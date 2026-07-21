import http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { PeerPresence } from '../src/types'
import type { PinnedMessage } from '../src/chat/types'
import type { ClientMsg, ServerMsg } from '../shared/protocol'
import { ensureDataDir, loadAppearance, saveAppearance } from './appearances'
import { ensurePositionDir, loadPosition, savePosition, type SavedPose } from './positions'
import {
  fallGuysWelcomeLobby,
  fallGuysWelcomeRace,
  handleFallGuysMsg,
  onFallGuysLeave,
  onFallGuysPresence,
} from './fallguys'
import {
  handleXoMsg,
  onXoLeave,
  onXoPresence,
  xoWelcomeGame,
  xoWelcomeLobby,
} from './xo'

const PORT = Number(process.env.PORT || 3001)
const STALE_MS = 5000
const PIN_TEXT_MAX = 280
/** Debounce disk writes while walking. */
const POSE_SAVE_MS = 2000

type Client = {
  ws: WebSocket
  id: string | null
  email: string | null
  peer: PeerPresence | null
  /** Skip auto-reconnect leave bookkeeping when we intentionally replace a session. */
  replaced?: boolean
  lastPoseSavedAt?: number
}

const clients = new Set<Client>()
/** Locked meeting rooms (plaza-main is never lockable). */
const lockedRooms = new Map<string, { byId: string; byName: string }>()
/** One pinned chat message per room (any room including plaza). */
const pinnedByRoom = new Map<string, PinnedMessage>()
const UNLOCKABLE = new Set(['plaza-main', 'fallguys-arena', 'xo-booth'])

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function broadcast(msg: ServerMsg, except?: WebSocket) {
  const raw = JSON.stringify(msg)
  for (const c of clients) {
    if (c.ws !== except && c.ws.readyState === 1) c.ws.send(raw)
  }
}

function livePeers(): PeerPresence[] {
  const now = Date.now()
  const out: PeerPresence[] = []
  for (const c of clients) {
    if (!c.peer) continue
    if (now - c.peer.updatedAt > STALE_MS) continue
    out.push(c.peer)
  }
  return out
}

function lockedRoomIds(): string[] {
  return [...lockedRooms.keys()]
}

function allPinnedMessages(): PinnedMessage[] {
  return [...pinnedByRoom.values()]
}

function occupantsIn(roomId: string): number {
  let n = 0
  for (const c of clients) {
    if (c.peer?.roomId === roomId) n += 1
  }
  return n
}

function poseFromPeer(peer: PeerPresence | null): SavedPose | null {
  if (!peer) return null
  return { x: peer.x, y: peer.y, facing: peer.facing }
}

function maybeSavePose(client: Client, force = false) {
  const email = client.email?.trim().toLowerCase()
  const pose = poseFromPeer(client.peer)
  if (!email || !pose) return
  const now = Date.now()
  if (!force && client.lastPoseSavedAt && now - client.lastPoseSavedAt < POSE_SAVE_MS) return
  client.lastPoseSavedAt = now
  void savePosition(email, pose)
}

/** Drop every other live socket for this email so only the latest device remains. */
function replaceSessionsForEmail(email: string, keep: Client) {
  const normalized = email.trim().toLowerCase()
  for (const c of [...clients]) {
    if (c === keep) continue
    if ((c.email ?? '').trim().toLowerCase() !== normalized) continue
    maybeSavePose(c, true)
    c.replaced = true
    const oldId = c.id
    send(c.ws, {
      type: 'session-replaced',
      reason: 'logged_in_elsewhere',
    })
    clients.delete(c)
    try {
      c.ws.close()
    } catch {
      /* ignore */
    }
    if (oldId) {
      broadcast({ type: 'leave', id: oldId })
      onFallGuysLeave({ clients, send, broadcast }, oldId)
      onXoLeave({ clients, send, broadcast }, oldId)
    }
  }
}

/** Clear locks when a room is empty. Pins persist until explicitly unpinned. */
function clearEmptyRooms() {
  for (const roomId of [...lockedRooms.keys()]) {
    if (occupantsIn(roomId) > 0) continue
    lockedRooms.delete(roomId)
    broadcast({
      type: 'room-lock',
      roomId,
      locked: false,
      byId: 'system',
      byName: 'system',
    })
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function cors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, peers: livePeers().length }))
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/appearance') {
    const email = url.searchParams.get('email')?.trim().toLowerCase()
    if (!email) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'email required' }))
      return
    }
    const look = await loadAppearance(email)
    const lastPose = await loadPosition(email)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ look, lastPose }))
    return
  }

  if (req.method === 'PUT' && url.pathname === '/api/appearance') {
    try {
      const body = JSON.parse(await readBody(req)) as { email?: string; look?: unknown }
      const email = body.email?.trim().toLowerCase()
      if (!email || !body.look || typeof body.look !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'email and look required' }))
        return
      }
      await saveAppearance(email, body.look as import('../src/types').CharacterLook)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  const client: Client = { ws, id: null, email: null, peer: null }
  clients.add(client)

  ws.on('message', async (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(raw)) as ClientMsg
    } catch {
      send(ws, { type: 'error', message: 'invalid json' })
      return
    }

    if (msg.type === 'hello') {
      const email = String(msg.email || '')
        .trim()
        .toLowerCase()
      client.id = msg.id
      client.email = email || null
      if (email) replaceSessionsForEmail(email, client)
      const lastPose = email ? await loadPosition(email) : null
      send(ws, {
        type: 'welcome',
        peers: livePeers().filter((p) => p.id !== msg.id),
        lockedRooms: lockedRoomIds(),
        pinnedMessages: allPinnedMessages(),
        fallguys: fallGuysWelcomeLobby({ clients, send, broadcast }),
        fallguysRace: fallGuysWelcomeRace(),
        xo: xoWelcomeLobby({ clients, send, broadcast }),
        xoGame: xoWelcomeGame(),
        lastPose,
      })
      return
    }

    if (msg.type === 'presence') {
      if (client.id && msg.peer.id !== client.id) return
      client.id = msg.peer.id
      client.email = msg.peer.email?.trim().toLowerCase() || client.email
      client.peer = { ...msg.peer, updatedAt: Date.now() }
      maybeSavePose(client)
      broadcast({ type: 'presence', peer: client.peer }, ws)
      clearEmptyRooms()
      onFallGuysPresence({ clients, send, broadcast }, client)
      onXoPresence({ clients, send, broadcast }, client)
      return
    }

    if (msg.type === 'leave') {
      const id = msg.id || client.id
      if (!id) return
      client.peer = null
      broadcast({ type: 'leave', id }, ws)
      clearEmptyRooms()
      onFallGuysLeave({ clients, send, broadcast }, id)
      onXoLeave({ clients, send, broadcast }, id)
      return
    }

    if (
      msg.type === 'fallguys-start' ||
      msg.type === 'fallguys-restart' ||
      msg.type === 'fallguys-quit' ||
      msg.type === 'fallguys-progress'
    ) {
      handleFallGuysMsg({ clients, send, broadcast }, client, msg)
      return
    }

    if (
      msg.type === 'xo-start' ||
      msg.type === 'xo-restart' ||
      msg.type === 'xo-quit' ||
      msg.type === 'xo-move'
    ) {
      handleXoMsg({ clients, send, broadcast }, client, msg)
      return
    }

    if (msg.type === 'room-pin') {
      if (!client.id || !client.peer) {
        send(ws, { type: 'error', message: 'presence required to pin/unpin' })
        return
      }
      const roomId = msg.roomId?.trim()
      if (!roomId) {
        send(ws, { type: 'error', message: 'roomId required' })
        return
      }
      if (client.peer.roomId !== roomId) {
        send(ws, { type: 'error', message: 'must be inside the room to pin/unpin' })
        return
      }
      const byName = client.peer.look?.displayName || client.email || client.id
      if (!msg.message) {
        pinnedByRoom.delete(roomId)
        const out = {
          type: 'room-pin' as const,
          roomId,
          pinned: null,
          byId: client.id,
          byName,
        }
        broadcast(out)
        return
      }
      const text = String(msg.message.text || '')
        .trim()
        .slice(0, PIN_TEXT_MAX)
      if (!text || !msg.message.id) {
        send(ws, { type: 'error', message: 'invalid pin message' })
        return
      }
      const pinned: PinnedMessage = {
        roomId,
        messageId: String(msg.message.id).slice(0, 32),
        text,
        fromId: String(msg.message.fromId || client.id).slice(0, 64),
        fromName: String(msg.message.fromName || 'unknown').slice(0, 64),
        at: Number(msg.message.at) || Date.now(),
        pinnedById: client.id,
        pinnedByName: byName,
        pinnedAt: Date.now(),
      }
      pinnedByRoom.set(roomId, pinned)
      broadcast({
        type: 'room-pin',
        roomId,
        pinned,
        byId: client.id,
        byName,
      })
      return
    }

    if (msg.type === 'room-lock') {
      if (!client.id || !client.peer) return
      const roomId = msg.roomId?.trim()
      if (!roomId || UNLOCKABLE.has(roomId)) {
        send(ws, { type: 'error', message: 'room cannot be locked' })
        return
      }
      // Only occupants can lock / unlock
      if (client.peer.roomId !== roomId) {
        send(ws, { type: 'error', message: 'must be inside the room to lock/unlock' })
        return
      }
      const byName = client.peer.look?.displayName || client.email || client.id
      if (msg.locked) {
        lockedRooms.set(roomId, { byId: client.id, byName })
      } else {
        lockedRooms.delete(roomId)
      }
      broadcast({
        type: 'room-lock',
        roomId,
        locked: !!msg.locked,
        byId: client.id,
        byName,
      })
      return
    }

    if (msg.type === 'signal') {
      if (!client.id) return
      for (const c of clients) {
        if (c.id === msg.to && c.ws.readyState === 1) {
          send(c.ws, { type: 'signal', from: client.id, data: msg.data })
          break
        }
      }
      return
    }

    if (msg.type === 'chat') {
      broadcast({ type: 'chat', message: msg.message })
      return
    }

    if (msg.type === 'dm') {
      if (!client.id) {
        send(ws, { type: 'error', message: 'presence required to send DM' })
        return
      }
      const m = msg.message
      if (!m?.toId || !m.text?.trim()) {
        send(ws, { type: 'error', message: 'invalid DM' })
        return
      }
      const payload = {
        id: String(m.id || '').slice(0, 24) || `dm${Date.now()}`,
        fromId: client.id,
        fromName: (m.fromName || client.peer?.look?.displayName || 'guest').slice(0, 32),
        toId: String(m.toId),
        text: String(m.text).trim().slice(0, 280),
        at: typeof m.at === 'number' ? m.at : Date.now(),
      }
      let delivered = false
      for (const c of clients) {
        if (c.id === payload.toId && c.ws.readyState === 1) {
          send(c.ws, { type: 'dm', message: payload })
          delivered = true
          break
        }
      }
      if (!delivered) {
        send(ws, {
          type: 'error',
          message: 'ส่ง DM ไม่ถึง — คู่สนทนาอาจออฟไลน์หรือเปลี่ยนเซสชัน',
        })
      }
      return
    }

    if (msg.type === 'activity') {
      broadcast({ type: 'activity', event: msg.event }, ws)
      // also echo to sender so local UX stays consistent for poll-create etc. when needed
      // clients already apply locally on publish — skip echo for activity from others only
      return
    }
  })

  ws.on('close', () => {
    if (client.replaced) return
    maybeSavePose(client, true)
    const id = client.id
    clients.delete(client)
    if (id) broadcast({ type: 'leave', id })
    clearEmptyRooms()
    onFallGuysLeave({ clients, send, broadcast }, id)
    onXoLeave({ clients, send, broadcast }, id)
  })
})

setInterval(() => {
  const now = Date.now()
  for (const c of clients) {
    if (c.peer && now - c.peer.updatedAt > STALE_MS) {
      const id = c.peer.id
      maybeSavePose(c, true)
      c.peer = null
      broadcast({ type: 'leave', id })
      onFallGuysLeave({ clients, send, broadcast }, id)
      onXoLeave({ clients, send, broadcast }, id)
    }
  }
  clearEmptyRooms()
}, 2000)

await ensureDataDir()
await ensurePositionDir()
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[trueid-office] multiplayer server on http://0.0.0.0:${PORT}  ws://0.0.0.0:${PORT}/ws`)
})
