import { TILE } from '../src/world/terrain'

/** Max distance (px) to start / keep NPC talk affordances. 1.5 tiles. */
export const INTERACT_RANGE_PX = 1.5 * TILE

export function inInteractRange(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rangePx = INTERACT_RANGE_PX,
): boolean {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy <= rangePx * rangePx
}

export function facingToward(fromX: number, fromY: number, toX: number, toY: number): 'up' | 'down' | 'left' | 'right' {
  const dx = toX - fromX
  const dy = toY - fromY
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'down' : 'up'
}
