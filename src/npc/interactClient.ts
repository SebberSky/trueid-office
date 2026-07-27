import type { ActorPresence, NpcPresence } from '../types'
import { isNpcPresence } from '../types'
import { INTERACT_RANGE_PX } from '../../shared/npcInteract'

export { facingToward, inInteractRange, INTERACT_RANGE_PX } from '../../shared/npcInteract'

/** Screen UV segment covering an avatar from nameplate (top) to feet (bottom). */
export type AvatarScreenHit = {
  top: { x: number; y: number }
  bottom: { x: number; y: number }
}

/** Nearest interactable NPC within talk range (local affordances). */
export function nearestInteractableNpc(
  peers: ActorPresence[],
  x: number,
  y: number,
  rangePx = INTERACT_RANGE_PX,
): NpcPresence | null {
  let best: NpcPresence | null = null
  let bestDist = rangePx * rangePx
  for (const peer of peers) {
    if (!isNpcPresence(peer) || !peer.interactable) continue
    const dx = peer.x - x
    const dy = peer.y - y
    const d2 = dx * dx + dy * dy
    if (d2 <= bestDist) {
      bestDist = d2
      best = peer
    }
  }
  return best
}

export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

/** Squared distance from point P to segment AB (css px). */
function distToSegment2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const ab2 = abx * abx + aby * aby
  const t = ab2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy
}

/**
 * Screen-space pick: interactable NPC whose feet→nameplate capsule contains the pointer.
 * Half-width scales with on-screen avatar height so zoom stays usable.
 */
export function pickInteractableNpcAtScreen(
  peers: ActorPresence[],
  project: (id: string) => AvatarScreenHit | null,
  cssX: number,
  cssY: number,
  canvasW: number,
  canvasH: number,
  minHalfWidthPx = 28,
): NpcPresence | null {
  let best: NpcPresence | null = null
  let bestDist = Infinity
  for (const peer of peers) {
    if (!isNpcPresence(peer) || !peer.interactable) continue
    const hit = project(peer.id)
    if (!hit) continue
    const ax = hit.top.x * canvasW
    const ay = hit.top.y * canvasH
    const bx = hit.bottom.x * canvasW
    const by = hit.bottom.y * canvasH
    const heightPx = Math.hypot(bx - ax, by - ay)
    const halfW = Math.max(minHalfWidthPx, heightPx * 0.28)
    const d2 = distToSegment2(cssX, cssY, ax, ay, bx, by)
    if (d2 <= halfW * halfW && d2 < bestDist) {
      bestDist = d2
      best = peer
    }
  }
  return best
}
