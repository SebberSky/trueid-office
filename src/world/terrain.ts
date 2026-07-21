import type { DoorSide, RoomDef, TerrainType } from '../types'
import { FALLGUYS_ROOM_ID, FALLGUYS_ROOM_NAME } from '../fallguys/types'
import { XO_ROOM_ID, XO_ROOM_NAME } from '../xo/types'

export const TILE = 32
export const MAP_W = 84
export const MAP_H = 64

/** Horizontal path row starts (2 tiles thick). */
export const PATH_ROWS = [9, 21, 33, 45, 55]
/** Vertical path column starts. */
export const PATH_COLS = [8, 22, 36, 50, 64, 76]

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function hash2(x: number, y: number, seed: number) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash2(x0, y0, seed)
  const n10 = hash2(x0 + 1, y0, seed)
  const n01 = hash2(x0, y0 + 1, seed)
  const n11 = hash2(x0 + 1, y0 + 1, seed)
  const nx0 = n00 * (1 - sx) + n10 * sx
  const nx1 = n01 * (1 - sx) + n11 * sx
  return nx0 * (1 - sy) + nx1 * sy
}

export const WALKABLE: Record<TerrainType, boolean> = {
  grass: true,
  path: true,
  floor: true,
  sand: true,
  plaza: true,
  plazaBorder: true,
  water: false,
  rock: false,
  wall: false,
  desk: false,
  plant: false,
}

export const TERRAIN_COLOR: Record<TerrainType, string> = {
  grass: '#5a9e4a',
  path: '#c4b59a',
  floor: '#e8dfd0',
  sand: '#d4c48a',
  water: '#4fc3f0',
  rock: '#6b6f76',
  wall: '#3d4450',
  desk: '#8b6914',
  plant: '#2d6b3a',
  plaza: '#e8c96a',
  plazaBorder: '#b45309',
}

export interface WorldMap {
  seed: number
  tiles: TerrainType[][]
  rooms: RoomDef[]
  spawn: { x: number; y: number }
}

type RoomSpec = Omit<RoomDef, 'x' | 'y' | 'door'>

export function generateWorld(seed = 20260717): WorldMap {
  const rand = mulberry32(seed)
  const tiles: TerrainType[][] = []

  for (let y = 0; y < MAP_H; y++) {
    const row: TerrainType[] = []
    for (let x = 0; x < MAP_W; x++) {
      const elev = noise(x / 9, y / 9, seed)
      const moisture = noise(x / 12 + 40, y / 12 + 20, seed + 99)

      // Soft natural ponds + shore
      if (elev < 0.32) {
        row.push('water')
      } else if (elev < 0.38) {
        row.push('sand')
      } else if (elev > 0.82 && moisture < 0.35) {
        row.push('rock')
      } else if (moisture > 0.75 && elev > 0.4 && elev < 0.7) {
        row.push(rand() > 0.7 ? 'plant' : 'grass')
      } else {
        row.push('grass')
      }
    }
    tiles.push(row)
  }

  // Campus path grid
  for (const py of PATH_ROWS) {
    for (let x = 2; x < MAP_W - 2; x++) {
      tiles[py][x] = 'path'
      if (py + 1 < MAP_H - 1) tiles[py + 1][x] = 'path'
    }
  }
  for (const px of PATH_COLS) {
    for (let y = 2; y < MAP_H - 2; y++) {
      tiles[y][px] = 'path'
      if (px + 1 < MAP_W - 1) tiles[y][px + 1] = 'path'
    }
  }

  const teamRooms: RoomSpec[] = [
    { id: 'team-core', name: 'Core', w: 10, h: 7, capacity: 12, color: '#c8102e', kind: 'room' },
    { id: 'team-watch', name: 'Watch', w: 10, h: 7, capacity: 12, color: '#2563eb', kind: 'room' },
    { id: 'team-today', name: 'Today', w: 10, h: 7, capacity: 12, color: '#d97706', kind: 'room' },
    { id: 'team-hero', name: 'Hero', w: 10, h: 7, capacity: 12, color: '#7c3aed', kind: 'room' },
    { id: 'team-commerce', name: 'Commerce', w: 10, h: 7, capacity: 12, color: '#0d9488', kind: 'room' },
    { id: 'team-commerce-2', name: 'Commerce 2', w: 10, h: 7, capacity: 12, color: '#0891b2', kind: 'room' },
  ]

  const meet2: RoomSpec[] = Array.from({ length: 5 }, (_, i) => ({
    id: `meet2-${i + 1}`,
    name: `Meet 2 · ${i + 1}`,
    w: 6,
    h: 5,
    capacity: 2,
    color: '#1a9b8e',
    kind: 'room' as const,
  }))

  const meet4: RoomSpec[] = Array.from({ length: 5 }, (_, i) => ({
    id: `meet4-${i + 1}`,
    name: `Meet 4 · ${i + 1}`,
    w: 7,
    h: 5,
    capacity: 4,
    color: '#2563eb',
    kind: 'room' as const,
  }))

  const meet8: RoomSpec[] = Array.from({ length: 3 }, (_, i) => ({
    id: `meet8-${i + 1}`,
    name: `Meet 8 · ${i + 1}`,
    w: 9,
    h: 6,
    capacity: 8,
    color: '#d97706',
    kind: 'room' as const,
  }))

  const meet15: RoomSpec[] = Array.from({ length: 2 }, (_, i) => ({
    id: `meet15-${i + 1}`,
    name: `Meet 15 · ${i + 1}`,
    w: 12,
    h: 8,
    capacity: 15,
    color: '#c8102e',
    kind: 'room' as const,
  }))

  const plazaSpec: RoomSpec = {
    id: 'plaza-main',
    name: 'ลานกิจกรรม',
    w: 18,
    h: 14,
    capacity: 0,
    color: '#ea580c',
    kind: 'plaza',
  }

  const roomSpecs: RoomSpec[] = [
    ...teamRooms,
    ...meet2,
    ...meet4,
    ...meet8,
    ...meet15,
  ]

  const rooms: RoomDef[] = []
  const occupied: { x: number; y: number; w: number; h: number }[] = []

  // Plaza first — open event ground near map center
  {
    const pathY = 33
    const plaza: RoomDef = {
      ...plazaSpec,
      x: Math.floor(MAP_W / 2 - plazaSpec.w / 2),
      y: pathY - plazaSpec.h,
      door: 's',
    }
    flattenFootprint(tiles, plaza.x, plaza.y, plaza.w, plaza.h)
    stampPlaza(tiles, plaza)
    rooms.push(plaza)
    occupied.push({ x: plaza.x, y: plaza.y, w: plaza.w, h: plaza.h })
  }

  // Fall Guys pad first (reserves space) so meeting rooms stay clear of it
  stampFallGuysArena(tiles, occupied, rooms)
  // XO booth (cap 2) — dedicated game room near west paths
  stampXoBooth(tiles, occupied, rooms)

  const slots = buildSlots()
  for (const spec of roomSpecs) {
    const slot = takeSlot(slots, occupied, spec.w, spec.h)
    if (!slot) continue

    flattenFootprint(tiles, slot.x, slot.y, spec.w, spec.h)

    const room: RoomDef = { ...spec, x: slot.x, y: slot.y, door: 's' }
    rooms.push(room)
    occupied.push({ x: slot.x, y: slot.y, w: spec.w, h: spec.h })
    stampRoom(tiles, room)
    clearDoorApproach(tiles, room)
  }

  // Guarantee a few visible campus ponds (paths/rooms can wipe natural water)
  stampCampusPonds(tiles, occupied, seed)

  // Spawn on central path near plaza if possible
  let spawn = { x: 42, y: 34 }
  const plaza = rooms.find((r) => r.kind === 'plaza')
  if (plaza) {
    spawn = {
      x: plaza.x + Math.floor(plaza.w / 2),
      y: plaza.y + plaza.h + 2,
    }
  }
  if (!WALKABLE[tiles[spawn.y]?.[spawn.x]]) {
    outer: for (let y = 30; y < 40; y++) {
      for (let x = 36; x < 50; x++) {
        if (WALKABLE[tiles[y][x]]) {
          spawn = { x, y }
          break outer
        }
      }
    }
  }

  return { seed, tiles, rooms, spawn }
}

/** Slots north of each horizontal path, spaced along X. */
function buildSlots() {
  const slots: { x: number; y: number; pathY: number }[] = []
  const xs = [3, 14, 25, 37, 48, 59, 70]
  for (const pathY of PATH_ROWS) {
    for (const x of xs) {
      slots.push({ x, y: pathY, pathY })
    }
  }
  return slots
}

function takeSlot(
  slots: { x: number; y: number; pathY: number }[],
  occupied: { x: number; y: number; w: number; h: number }[],
  w: number,
  h: number,
) {
  while (slots.length > 0) {
    const raw = slots.shift()!
    const y = raw.pathY - h
    if (y < 2 || y + h >= MAP_H - 2) continue
    if (raw.x < 2 || raw.x + w >= MAP_W - 2) continue
    const candidate = { x: raw.x, y }
    if (overlapsAny(candidate, w, h, occupied)) continue
    // Prefer plaza near map center — skip early slots for large plaza by allowing center bias
    return candidate
  }
  // Fallback sweep
  for (const pathY of PATH_ROWS) {
    for (let x = 3; x < MAP_W - 12; x += 11) {
      const y = pathY - h
      if (y < 2) continue
      const candidate = { x, y }
      if (overlapsAny(candidate, w, h, occupied)) continue
      if (candidate.x + w >= MAP_W - 2) continue
      return candidate
    }
  }
  return null
}

function overlapsAny(
  c: { x: number; y: number },
  w: number,
  h: number,
  occupied: { x: number; y: number; w: number; h: number }[],
  pad = 1,
) {
  for (const o of occupied) {
    if (
      c.x < o.x + o.w + pad &&
      c.x + w + pad > o.x &&
      c.y < o.y + o.h + pad &&
      c.y + h + pad > o.y
    ) {
      return true
    }
  }
  return false
}

function flattenFootprint(tiles: TerrainType[][], x0: number, y0: number, w: number, h: number) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (y <= 0 || y >= MAP_H - 1 || x <= 0 || x >= MAP_W - 1) continue
      const t = tiles[y][x]
      if (t === 'water' || t === 'rock' || t === 'plant' || t === 'wall') {
        tiles[y][x] = 'grass'
      }
    }
  }
}

function doorSpan(rx: number, ry: number, w: number, h: number, side: DoorSide) {
  if (side === 's' || side === 'n') {
    const a = rx + Math.floor((w - 2) / 2)
    const b = a + 1
    const wallY = side === 's' ? ry + h - 1 : ry
    return { a, b, wallX: a, wallY }
  }
  const a = ry + Math.floor((h - 2) / 2)
  const b = a + 1
  const wallX = side === 'e' ? rx + w - 1 : rx
  return { a, b, wallX, wallY: a }
}

export function roomDoor(room: RoomDef) {
  const { a, b, wallX, wallY } = doorSpan(room.x, room.y, room.w, room.h, room.door)
  if (room.door === 's' || room.door === 'n') {
    return { doorX: a, doorX2: b, doorY: wallY, doorY2: wallY, side: room.door }
  }
  return { doorX: wallX, doorX2: wallX, doorY: a, doorY2: b, side: room.door }
}

function stampRoom(tiles: TerrainType[][], room: RoomDef) {
  const door = roomDoor(room)

  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const onPerimeter =
        y === room.y || y === room.y + room.h - 1 || x === room.x || x === room.x + room.w - 1
      if (onPerimeter) {
        const isDoor =
          y === door.doorY && (x === door.doorX || x === door.doorX2)
        tiles[y][x] = isDoor ? 'floor' : 'wall'
      } else {
        tiles[y][x] = 'floor'
      }
    }
  }

  const deskY = room.y + 2
  if (deskY < room.y + room.h - 2 && room.capacity >= 4) {
    for (let dx = 2; dx < room.w - 2; dx += 2) {
      const x = room.x + dx
      if (x === door.doorX || x === door.doorX2) continue
      tiles[deskY][x] = 'desk'
    }
  }

  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    tiles[y][door.doorX] = 'floor'
    tiles[y][door.doorX2] = 'floor'
  }
}

/** Open plaza: walkable plaza tiles + visible border ring (no walls/roof). */
function stampPlaza(tiles: TerrainType[][], room: RoomDef) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const onBorder =
        y === room.y || y === room.y + room.h - 1 || x === room.x || x === room.x + room.w - 1
      tiles[y][x] = onBorder ? 'plazaBorder' : 'plaza'
    }
  }
  // Open all four sides with path connectors (especially south for camera)
  const midX = room.x + Math.floor(room.w / 2)
  const midY = room.y + Math.floor(room.h / 2)
  for (const [x, y] of [
    [midX, room.y],
    [midX + 1, room.y],
    [midX, room.y + room.h - 1],
    [midX + 1, room.y + room.h - 1],
    [room.x, midY],
    [room.x, midY + 1],
    [room.x + room.w - 1, midY],
    [room.x + room.w - 1, midY + 1],
  ] as const) {
    if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) tiles[y][x] = 'plaza'
  }

  // South approach to path
  for (let y = room.y + room.h; y < MAP_H - 1 && y <= room.y + room.h + 4; y++) {
    for (const x of [midX - 1, midX, midX + 1, midX + 2]) {
      if (x <= 0 || x >= MAP_W - 1) continue
      if (tiles[y][x] !== 'wall') tiles[y][x] = 'path'
    }
    if (PATH_ROWS.includes(y) || PATH_ROWS.includes(y - 1)) break
  }
}

/**
 * Fall Guys lobby: one solid meet-room-sized rectangle, placed south of a path
 * on the far east so it sits apart from meeting rooms (which sit north of paths).
 */
function stampFallGuysArena(
  tiles: TerrainType[][],
  occupied: { x: number; y: number; w: number; h: number }[],
  rooms: RoomDef[],
) {
  // Same footprint as Meet 8
  const w = 9
  const h = 6
  // Prefer south of path rows (meeting rooms take the north side)
  const candidates: { x: number; y: number; pathY: number }[] = [
    { x: 70, y: 47, pathY: 45 },
    { x: 68, y: 47, pathY: 45 },
    { x: 70, y: 35, pathY: 33 },
    { x: 2, y: 47, pathY: 45 },
    { x: 2, y: 35, pathY: 33 },
  ]
  let spot = candidates[0]!
  for (const c of candidates) {
    if (c.x + w >= MAP_W - 1 || c.y + h >= MAP_H - 1) continue
    // Extra gap from other footprints so it doesn't sit against meeting rooms
    if (!overlapsAny(c, w, h, occupied, 3)) {
      spot = c
      break
    }
  }

  const room: RoomDef = {
    id: FALLGUYS_ROOM_ID,
    name: FALLGUYS_ROOM_NAME,
    x: spot.x,
    y: spot.y,
    w,
    h,
    capacity: 16,
    color: '#ff4fd8',
    door: 'n',
    kind: 'plaza',
  }
  flattenFootprint(tiles, room.x, room.y, room.w, room.h)

  // Solid rectangle — border ring + flat fill (no checker, no plaza gate cuts)
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const onBorder =
        y === room.y || y === room.y + room.h - 1 || x === room.x || x === room.x + room.w - 1
      tiles[y][x] = onBorder ? 'plazaBorder' : 'plaza'
    }
  }

  // Door on the north edge facing the path
  const door = roomDoor(room)
  tiles[door.doorY][door.doorX] = 'plaza'
  tiles[door.doorY][door.doorX2] = 'plaza'
  for (let y = room.y - 1; y >= spot.pathY && y > 0; y--) {
    for (const x of [door.doorX - 1, door.doorX, door.doorX2, door.doorX2 + 1]) {
      if (x <= 0 || x >= MAP_W - 1) continue
      const t = tiles[y][x]
      if (t !== 'wall' && t !== 'water' && t !== 'rock') tiles[y][x] = 'path'
    }
  }

  rooms.push(room)
  occupied.push({ x: room.x, y: room.y, w: room.w, h: room.h })
}

/** Compact 2-player XO booth — real room so capacity 2 is enforced. */
function stampXoBooth(
  tiles: TerrainType[][],
  occupied: { x: number; y: number; w: number; h: number }[],
  rooms: RoomDef[],
) {
  const w = 6
  const h = 5
  const candidates: { x: number; y: number }[] = [
    { x: 3, y: 24 },
    { x: 3, y: 12 },
    { x: 14, y: 24 },
    { x: 3, y: 36 },
    { x: 58, y: 12 },
  ]
  let spot = candidates[0]!
  for (const c of candidates) {
    if (c.x + w >= MAP_W - 1 || c.y + h >= MAP_H - 1) continue
    if (!overlapsAny(c, w, h, occupied, 2)) {
      spot = c
      break
    }
  }

  const room: RoomDef = {
    id: XO_ROOM_ID,
    name: XO_ROOM_NAME,
    x: spot.x,
    y: spot.y,
    w,
    h,
    capacity: 2,
    color: '#0ea5e9',
    door: 's',
    kind: 'room',
  }
  flattenFootprint(tiles, room.x, room.y, room.w, room.h)
  stampRoom(tiles, room)
  clearDoorApproach(tiles, room)
  rooms.push(room)
  occupied.push({ x: room.x, y: room.y, w: room.w, h: room.h })
}

function clearDoorApproach(tiles: TerrainType[][], room: RoomDef) {
  const door = roomDoor(room)
  tiles[door.doorY][door.doorX] = 'floor'
  tiles[door.doorY][door.doorX2] = 'floor'

  for (let y = door.doorY + 1; y < MAP_H - 1 && y <= door.doorY + 6; y++) {
    for (const x of [door.doorX - 1, door.doorX, door.doorX2, door.doorX2 + 1]) {
      if (x <= 0 || x >= MAP_W - 1) continue
      const t = tiles[y][x]
      if (
        t === 'wall' ||
        t === 'water' ||
        t === 'rock' ||
        t === 'plant' ||
        t === 'desk' ||
        t === 'grass' ||
        t === 'sand'
      ) {
        tiles[y][x] = 'path'
      }
    }
    if (PATH_ROWS.some((py) => y === py || y === py + 1)) break
  }
}

/** Carve a few oval ponds with sand shores into open grass (not on rooms/paths). */
function stampCampusPonds(
  tiles: TerrainType[][],
  occupied: { x: number; y: number; w: number; h: number }[],
  seed: number,
) {
  const candidates: { cx: number; cy: number; rx: number; ry: number }[] = [
    { cx: 16, cy: 15, rx: 4, ry: 3 },
    { cx: 68, cy: 16, rx: 5, ry: 3 },
    { cx: 14, cy: 40, rx: 4, ry: 3 },
    { cx: 70, cy: 42, rx: 4, ry: 4 },
    { cx: 42, cy: 50, rx: 5, ry: 3 },
    { cx: 55, cy: 28, rx: 3, ry: 3 },
  ]

  const hitsOccupied = (x: number, y: number) =>
    occupied.some(
      (o) => x >= o.x - 1 && x < o.x + o.w + 1 && y >= o.y - 1 && y < o.y + o.h + 1,
    )

  let placed = 0
  for (let i = 0; i < candidates.length && placed < 4; i++) {
    const c = candidates[(i + (seed % 5)) % candidates.length]
    let blocked = 0
    let cells = 0
    for (let y = c.cy - c.ry - 1; y <= c.cy + c.ry + 1; y++) {
      for (let x = c.cx - c.rx - 1; x <= c.cx + c.rx + 1; x++) {
        if (x <= 1 || y <= 1 || x >= MAP_W - 2 || y >= MAP_H - 2) continue
        cells++
        const t = tiles[y][x]
        if (t === 'path' || t === 'floor' || t === 'wall' || t === 'plaza' || t === 'plazaBorder' || t === 'desk') {
          blocked++
        } else if (hitsOccupied(x, y)) {
          blocked++
        }
      }
    }
    if (cells === 0 || blocked / cells > 0.25) continue

    for (let y = c.cy - c.ry - 1; y <= c.cy + c.ry + 1; y++) {
      for (let x = c.cx - c.rx - 1; x <= c.cx + c.rx + 1; x++) {
        if (x <= 1 || y <= 1 || x >= MAP_W - 2 || y >= MAP_H - 2) continue
        const t = tiles[y][x]
        if (t === 'path' || t === 'floor' || t === 'wall' || t === 'plaza' || t === 'plazaBorder' || t === 'desk') {
          continue
        }
        const nx = (x - c.cx) / (c.rx + 0.01)
        const ny = (y - c.cy) / (c.ry + 0.01)
        const d = nx * nx + ny * ny
        if (d <= 0.85) tiles[y][x] = 'water'
        else if (d <= 1.35 && (t === 'grass' || t === 'plant' || t === 'sand' || t === 'rock')) {
          tiles[y][x] = 'sand'
        }
      }
    }
    placed++
  }
}

export function tileAt(map: WorldMap, tx: number, ty: number): TerrainType | null {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null
  return map.tiles[ty][tx]
}

export function canWalk(map: WorldMap, tx: number, ty: number): boolean {
  // Soft world edge: cannot leave the original playable ring (same as old wall frame)
  if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return false
  const t = tileAt(map, tx, ty)
  return t !== null && WALKABLE[t]
}

/** Walk, or fly over water (birds / dragons). Still blocked by walls / rock / desk / world edge. */
export function canTraverse(map: WorldMap, tx: number, ty: number, fly = false): boolean {
  if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return false
  const t = tileAt(map, tx, ty)
  if (!t) return false
  if (WALKABLE[t]) return true
  return fly && t === 'water'
}

export function isWaterAt(map: WorldMap, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  return tileAt(map, tx, ty) === 'water'
}

/** Standing on walkable land with at least one neighboring water tile. */
export function isAtWaterEdge(map: WorldMap, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  const here = tileAt(map, tx, ty)
  if (!here || here === 'water' || !WALKABLE[here]) return false
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      if (tileAt(map, tx + dx, ty + dy) === 'water') return true
    }
  }
  return false
}

/** Nearest water tile center (pixel) from the player — for casting the line. */
export function nearestWaterCastTarget(
  map: WorldMap,
  px: number,
  py: number,
): { x: number; y: number } | null {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  let best: { x: number; y: number; d: number } | null = null
  // Wider search so shoreline approaches from any side still find a cast point
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx === 0 && dy === 0) continue
      const wx = tx + dx
      const wy = ty + dy
      if (tileAt(map, wx, wy) !== 'water') continue
      const cx = wx * TILE + TILE / 2
      const cy = wy * TILE + TILE / 2
      const d = Math.hypot(cx - px, cy - py)
      if (!best || d < best.d) best = { x: cx, y: cy, d }
    }
  }
  return best ? { x: best.x, y: best.y } : null
}

export function roomAt(map: WorldMap, px: number, py: number): RoomDef | null {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  return (
    map.rooms.find((r) => {
      if (tx < r.x || tx >= r.x + r.w || ty < r.y || ty >= r.y + r.h) return false
      const t = map.tiles[ty][tx]
      if (r.kind === 'plaza') return t === 'plaza' || t === 'plazaBorder'
      return t === 'floor'
    }) ?? null
  )
}

export function isUnlimited(room: RoomDef) {
  return room.capacity <= 0 || room.kind === 'plaza'
}

export function pixelCenter(tx: number, ty: number) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }
}
