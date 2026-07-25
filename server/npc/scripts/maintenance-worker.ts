import { defineNpc } from '../define'

/** Atmosphere idle NPC — warp disabled by design. */
export const maintenanceWorker = defineNpc({
  npcKey: 'maintenance-worker',
  look: {
    species: 'male',
    displayName: 'ช่างซ่อม',
    hairStyle: 'bald',
    skinColor: '#9f6848',
    topStyle: 'vest',
    topColor: '#d97706',
    bottomColor: '#334155',
  },
  spawn: { x: 52, y: 34 },
  facing: 'left',
  roomId: null,
  warpEnabled: false,
})
