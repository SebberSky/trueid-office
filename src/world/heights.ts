import type { TerrainType } from '../types'
import type { WorldMap } from './terrain'
import { MAP_H, MAP_W, TILE, tileAt } from './terrain'

/** World-unit height for each terrain (Y axis in Three.js). */
export const TERRAIN_HEIGHT: Record<TerrainType, number> = {
  water: -0.35,
  sand: 0.05,
  grass: 0.12,
  path: 0.1,
  floor: 0.15,
  plant: 0.12,
  rock: 0.85,
  wall: 2.55,
  desk: 0.55,
  plaza: 0.14,
  plazaBorder: 0.22,
}

export const TERRAIN_HEX: Record<TerrainType, number> = {
  grass: 0x5cad4f,
  path: 0xc9b89a,
  floor: 0xeee6d8,
  sand: 0xe0d09a,
  water: 0x3a9fd0,
  rock: 0x6e737a,
  wall: 0x3d4450,
  desk: 0x8b6914,
  plant: 0x2d6b3a,
  plaza: 0xedc96e,
  plazaBorder: 0xc45f12,
}

export function heightAt(map: WorldMap, tx: number, ty: number): number {
  const t = tileAt(map, tx, ty)
  if (!t) return 0
  return TERRAIN_HEIGHT[t]
}

/** Sample surface Y under a pixel position (smooth-ish via nearest tile). */
export function surfaceY(map: WorldMap, px: number, py: number): number {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  return heightAt(map, tx, ty)
}

export function toWorldXZ(px: number, py: number) {
  return { x: px / TILE, z: py / TILE }
}

export function mapWorldSize() {
  return { w: MAP_W, h: MAP_H }
}
