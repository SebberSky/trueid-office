import { defineNpc } from '../define'

/** Plaza greeter on ลานกิจกรรม — gossip flavor reserved for Phase 2. */
export const janitorGossip = defineNpc({
  npcKey: 'janitor-gossip',
  look: {
    displayName: 'แม่บ้าน',
    hairStyle: 'bun',
    hairColor: '#3f2d20',
    topStyle: 'vest',
    topColor: '#55705b',
  },
  // Center of plaza-main (ลานกิจกรรม).
  spawn: { x: 42, y: 26 },
  roomId: 'plaza-main',
  tags: ['gossip', 'janitor'],
})
