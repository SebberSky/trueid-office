import type { ActorPresence, NpcPresence } from '../types'
import { isNpcPresence } from '../types'
import { INTERACT_RANGE_PX } from '../../shared/npcInteract'

export { facingToward, inInteractRange, INTERACT_RANGE_PX } from '../../shared/npcInteract'

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

/** Screen-space pick: NPC whose projected head is closest to pointer (css px). */
export function pickInteractableNpcAtScreen(
  peers: ActorPresence[],
  project: (id: string) => { x: number; y: number } | null,
  cssX: number,
  cssY: number,
  canvasW: number,
  canvasH: number,
  hitRadiusPx = 36,
): NpcPresence | null {
  let best: NpcPresence | null = null
  let bestDist = hitRadiusPx * hitRadiusPx
  for (const peer of peers) {
    if (!isNpcPresence(peer) || !peer.interactable) continue
    const uv = project(peer.id)
    if (!uv) continue
    const sx = uv.x * canvasW
    const sy = uv.y * canvasH
    const dx = sx - cssX
    const dy = sy - cssY
    const d2 = dx * dx + dy * dy
    if (d2 <= bestDist) {
      bestDist = d2
      best = peer
    }
  }
  return best
}
