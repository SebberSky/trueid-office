import type { ActorPresence } from '../types'
import { isNpcPresence, isUserPresence } from '../types'
import {
  TILE,
  canTraverse,
  isUnlimited,
  roomAt,
  type WorldMap,
} from './terrain'
import { XO_ROOM_ID } from '../xo/types'

type Point = { x: number; y: number }

type WarpOptions = {
  map: WorldMap
  target: ActorPresence
  current: Point
  peers: ActorPresence[]
  lockedRoomIds: ReadonlySet<string>
  canFly: boolean
}

const OFFSETS: readonly [number, number][] = [
  [0, TILE * 0.9],
  [0, -TILE * 0.9],
  [TILE * 0.9, 0],
  [-TILE * 0.9, 0],
  [TILE * 0.65, TILE * 0.65],
  [-TILE * 0.65, TILE * 0.65],
  [TILE * 0.65, -TILE * 0.65],
  [-TILE * 0.65, -TILE * 0.65],
  [0, TILE * 1.4],
  [0, -TILE * 1.4],
  [TILE * 1.4, 0],
  [-TILE * 1.4, 0],
]

export function findAdjacentWarpDestination(options: WarpOptions): Point | null {
  const { map, target, current, peers, lockedRoomIds, canFly } = options
  if (isNpcPresence(target) && !target.warpEnabled) return null

  const radius = 8
  const previousRoom = roomAt(map, current.x, current.y)

  for (const [offsetX, offsetY] of OFFSETS) {
    const x = target.x + offsetX
    const y = target.y + offsetY
    const samples = [
      [x, y],
      [x - radius, y],
      [x + radius, y],
      [x, y - radius],
      [x, y + radius],
    ]
    if (
      samples.some(([sampleX, sampleY]) => {
        const tileX = Math.floor(sampleX / TILE)
        const tileY = Math.floor(sampleY / TILE)
        return !canTraverse(map, tileX, tileY, canFly)
      })
    ) {
      continue
    }

    const nextRoom = roomAt(map, x, y)
    if (nextRoom && previousRoom?.id !== nextRoom.id) {
      if (lockedRoomIds.has(nextRoom.id)) continue
      if (!isUnlimited(nextRoom) || nextRoom.id === XO_ROOM_ID) {
        const humanOccupants = peers.filter(
          (peer) => isUserPresence(peer) && peer.roomId === nextRoom.id,
        ).length
        if (humanOccupants + 1 > nextRoom.capacity) continue
      }
    }
    return { x, y }
  }

  return null
}
