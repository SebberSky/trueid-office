import { defineNpc } from '../define'

/** Path patrol near the central campus walk. */
export const campusGuard = defineNpc({
  npcKey: 'campus-guard',
  look: {
    species: 'male',
    displayName: 'รปภ.',
    hairColor: '#1f2937',
    skinColor: '#b77952',
    topStyle: 'vest',
    topColor: '#1e3a5f',
    bottomColor: '#172033',
  },
  spawn: { x: 25, y: 34 },
  facing: 'right',
  roomId: null,
  behavior: {
    type: 'patrol',
    waypoints: [
      { x: 25, y: 34 },
      { x: 31, y: 34 },
      { x: 31, y: 33 },
      { x: 25, y: 33 },
    ],
    speedTilesPerSecond: 1.4,
  },
})
