import type { NpcScript } from './define'
import { campusGuard } from './scripts/campus-guard'
import { janitorGossip } from './scripts/janitor-gossip'
import { maintenanceWorker } from './scripts/maintenance-worker'

/** Add new NPCs by creating `scripts/<npcKey>.ts` and listing them here. */
export const NPC_SCRIPTS: readonly NpcScript[] = [
  janitorGossip,
  campusGuard,
  maintenanceWorker,
]

export type { NpcBehavior, NpcScript, NpcWaypoint } from './define'
export { defineNpc, npcLook } from './define'
