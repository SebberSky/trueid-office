import type { ActorPresence, RoomDef } from '../types'
import { isUserPresence } from '../types'
import { XO_ROOM_ID } from '../xo/types'
import {
  TILE,
  canTraverse,
  isUnlimited,
  pixelCenter,
  roomAt,
  type WorldMap,
} from './terrain'

export const ROOM_QUERY_PARAM = 'room'

export function readPendingRoomIdFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
): string | null {
  const raw = new URLSearchParams(search).get(ROOM_QUERY_PARAM)
  if (!raw) return null
  const id = raw.trim()
  return id || null
}

export function buildRoomShareUrl(
  roomId: string,
  origin = typeof window !== 'undefined' ? window.location.origin : '',
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
): string {
  const url = new URL(pathname || '/', origin || 'http://localhost')
  url.searchParams.set(ROOM_QUERY_PARAM, roomId)
  return url.toString()
}

export function clearRoomQueryFromUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(ROOM_QUERY_PARAM)) return
  url.searchParams.delete(ROOM_QUERY_PARAM)
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(null, '', next)
}

type RoomSpawnOptions = {
  map: WorldMap
  room: RoomDef
  canFly?: boolean
  random?: () => number
}

/** Pick a random walkable tile center that counts as inside the room. */
export function findRandomRoomSpawn(options: RoomSpawnOptions): { x: number; y: number } | null {
  const { map, room, canFly = false, random = Math.random } = options
  const candidates: { x: number; y: number }[] = []
  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      if (!canTraverse(map, tx, ty, canFly)) continue
      const c = pixelCenter(tx, ty)
      if (roomAt(map, c.x, c.y)?.id !== room.id) continue
      candidates.push(c)
    }
  }
  if (candidates.length === 0) return null
  const idx = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
  return candidates[idx]
}

type EnterCheckOptions = {
  room: RoomDef
  peers: ActorPresence[]
  lockedRoomIds: ReadonlySet<string>
}

export type RoomLinkEnterResult =
  | { ok: true }
  | { ok: false; reason: 'locked' | 'full' }

export function canEnterRoomViaLink(options: EnterCheckOptions): RoomLinkEnterResult {
  const { room, peers, lockedRoomIds } = options
  if (lockedRoomIds.has(room.id)) return { ok: false, reason: 'locked' }
  if (!isUnlimited(room) || room.id === XO_ROOM_ID) {
    const humanOccupants = peers.filter(
      (peer) => isUserPresence(peer) && peer.roomId === room.id,
    ).length
    if (humanOccupants + 1 > room.capacity) return { ok: false, reason: 'full' }
  }
  return { ok: true }
}

/** Jitter within the tile so people don't stack on the exact center. */
export function jitterSpawnPoint(
  point: { x: number; y: number },
  random = Math.random,
): { x: number; y: number } {
  const pad = TILE * 0.28
  return {
    x: point.x + (random() * 2 - 1) * pad,
    y: point.y + (random() * 2 - 1) * pad,
  }
}
