import type { Facing, NpcPoseUpdate, NpcPresence } from '../../src/types'
import { TILE, canWalk, pixelCenter, roomAt, type WorldMap } from '../../src/world/terrain'
import { NPC_SCRIPTS, type NpcScript, type NpcWaypoint } from './registry'

/** Sub-pixel drift is invisible; skip broadcasting it. */
const MOVE_EPSILON_PX = 0.25

export type NpcPose = {
  x: number
  y: number
  facing: Facing
}

export type NpcMotionContext = {
  script: NpcScript
  pose: Readonly<NpcPose>
  /** Pre-resolved, walkable-checked waypoints in pixel coordinates. */
  waypoints: readonly NpcWaypoint[]
  waypointIndex: number
  elapsedSeconds: number
  map: WorldMap
}

export type NpcMotionResult = NpcPose & { waypointIndex: number }

/**
 * Extension seam for later phases: an AI route planner can implement this
 * without touching spawn, dirty tracking, or broadcast.
 */
export interface NpcMotion {
  step(ctx: NpcMotionContext): NpcMotionResult
}

type NpcRecord = {
  script: NpcScript
  peer: NpcPresence
  waypoints: NpcWaypoint[]
  waypointIndex: number
  tileX: number
  tileY: number
  /** Last pose actually sent to clients — drives dirty checks. */
  sentX: number
  sentY: number
  sentFacing: Facing
  sentRoomId: string | null
}

function facingForDelta(dx: number, dy: number, fallback: Facing): Facing {
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return dx > 0 ? 'right' : 'left'
  if (dy !== 0) return dy > 0 ? 'down' : 'up'
  return fallback
}

export const waypointMotion: NpcMotion = {
  step({ script, pose, waypoints, waypointIndex, elapsedSeconds }) {
    if (waypoints.length === 0) return { ...pose, waypointIndex }

    const index = waypointIndex % waypoints.length
    const target = waypoints[index]!
    const dx = target.x - pose.x
    const dy = target.y - pose.y
    const distance = Math.hypot(dx, dy)
    const speed =
      script.behavior.type === 'patrol' ? (script.behavior.speedTilesPerSecond ?? 1.2) : 1.2
    const maxStep = Math.max(0.1, speed) * TILE * elapsedSeconds
    const facing = facingForDelta(dx, dy, pose.facing)

    if (distance <= Math.max(1, maxStep)) {
      return {
        x: target.x,
        y: target.y,
        facing,
        waypointIndex: (index + 1) % waypoints.length,
      }
    }

    return {
      x: pose.x + (dx / distance) * maxStep,
      y: pose.y + (dy / distance) * maxStep,
      facing,
      waypointIndex: index,
    }
  },
}

export class NpcRuntime {
  private readonly records: NpcRecord[] = []
  /** Patrol subset — idle NPCs are skipped entirely each tick. */
  private readonly moving: NpcRecord[] = []
  private lastTickAt: number

  constructor(
    private readonly map: WorldMap,
    scripts: readonly NpcScript[] = NPC_SCRIPTS,
    private readonly motion: NpcMotion = waypointMotion,
    now = Date.now(),
  ) {
    this.lastTickAt = now
    const seenKeys = new Set<string>()

    for (const script of scripts) {
      const npcKey = script.npcKey.trim()
      if (!npcKey) {
        console.warn('[npc] skip script with empty npcKey')
        continue
      }
      if (seenKeys.has(npcKey)) {
        console.warn(`[npc] skip duplicate npcKey: ${npcKey}`)
        continue
      }
      if (!canWalk(map, script.spawn.x, script.spawn.y)) {
        console.warn(`[npc] skip ${npcKey}: spawn tile is not walkable`)
        continue
      }
      seenKeys.add(npcKey)

      const start = pixelCenter(script.spawn.x, script.spawn.y)
      const waypoints =
        script.behavior.type === 'patrol'
          ? script.behavior.waypoints
              .filter((point) => {
                const walkable = canWalk(map, point.x, point.y)
                if (!walkable) {
                  console.warn(`[npc] ${npcKey}: dropping unwalkable waypoint ${point.x},${point.y}`)
                }
                return walkable
              })
              .map((point) => pixelCenter(point.x, point.y))
          : []

      const roomId = script.roomId ?? roomAt(map, start.x, start.y)?.id ?? null
      // Spawning on the first waypoint would otherwise burn a tick standing still.
      const startsOnFirstWaypoint =
        waypoints.length > 0 &&
        Math.abs(waypoints[0]!.x - start.x) < MOVE_EPSILON_PX &&
        Math.abs(waypoints[0]!.y - start.y) < MOVE_EPSILON_PX
      const record: NpcRecord = {
        script,
        waypoints,
        waypointIndex: startsOnFirstWaypoint ? 1 % waypoints.length : 0,
        tileX: script.spawn.x,
        tileY: script.spawn.y,
        sentX: start.x,
        sentY: start.y,
        sentFacing: script.facing,
        sentRoomId: roomId,
        peer: {
          kind: 'npc',
          id: `npc:${npcKey}`,
          npcKey,
          warpEnabled: script.warpEnabled,
          behavior: script.behavior.type,
          look: script.look,
          x: start.x,
          y: start.y,
          facing: script.facing,
          roomId,
          voiceOn: false,
          sharing: false,
          updatedAt: now,
        },
      }

      this.records.push(record)
      if (waypoints.length > 0) this.moving.push(record)
    }
  }

  get size(): number {
    return this.records.length
  }

  /** Advance patrols and return only the NPCs whose pose changed. */
  tick(now = Date.now()): NpcPoseUpdate[] {
    const elapsedSeconds = Math.min(1, Math.max(0, now - this.lastTickAt) / 1000)
    this.lastTickAt = now
    if (elapsedSeconds === 0) return []

    const updates: NpcPoseUpdate[] = []

    for (const record of this.moving) {
      const { peer } = record
      const next = this.motion.step({
        script: record.script,
        pose: peer,
        waypoints: record.waypoints,
        waypointIndex: record.waypointIndex,
        elapsedSeconds,
        map: this.map,
      })

      record.waypointIndex = next.waypointIndex
      peer.x = next.x
      peer.y = next.y
      peer.facing = next.facing

      // roomAt() scans every room, so only re-resolve when the NPC changes tile.
      if (record.script.roomId === undefined || record.script.roomId === null) {
        const tileX = Math.floor(peer.x / TILE)
        const tileY = Math.floor(peer.y / TILE)
        if (tileX !== record.tileX || tileY !== record.tileY) {
          record.tileX = tileX
          record.tileY = tileY
          peer.roomId = roomAt(this.map, peer.x, peer.y)?.id ?? null
        }
      }

      const moved =
        Math.abs(peer.x - record.sentX) >= MOVE_EPSILON_PX ||
        Math.abs(peer.y - record.sentY) >= MOVE_EPSILON_PX ||
        peer.facing !== record.sentFacing ||
        peer.roomId !== record.sentRoomId

      if (!moved) continue

      record.sentX = peer.x
      record.sentY = peer.y
      record.sentFacing = peer.facing
      record.sentRoomId = peer.roomId
      peer.updatedAt = now

      updates.push({
        id: peer.id,
        x: peer.x,
        y: peer.y,
        facing: peer.facing,
        roomId: peer.roomId,
        updatedAt: now,
      })
    }

    return updates
  }

  /** Full presence for `welcome`; `look` is shared immutable registry data. */
  snapshot(): NpcPresence[] {
    return this.records.map((record) => ({ ...record.peer }))
  }
}
