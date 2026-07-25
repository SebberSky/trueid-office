import { describe, expect, it } from 'vitest'
import { nearestInteractableNpc, pickInteractableNpcAtScreen } from './interactClient'
import type { ActorPresence, NpcPresence, UserPresence } from '../types'

function npc(partial: Partial<NpcPresence> & Pick<NpcPresence, 'id' | 'npcKey' | 'x' | 'y' | 'interactable'>): NpcPresence {
  return {
    kind: 'npc',
    warpEnabled: true,
    behavior: 'idle',
    look: {
      species: 'female',
      animalKind: 'cat',
      displayName: partial.npcKey,
      hairStyle: 'short',
      hairColor: '#000',
      skinColor: '#aaa',
      furColor: '#aaa',
      topStyle: 'tee',
      topColor: '#000',
      bottomStyle: 'pants',
      bottomColor: '#000',
    },
    facing: 'down',
    roomId: null,
    voiceOn: false,
    sharing: false,
    updatedAt: 1,
    ...partial,
  }
}

function user(id: string, x: number, y: number): UserPresence {
  return {
    kind: 'user',
    id,
    email: `${id}@t.c`,
    look: {
      species: 'male',
      animalKind: 'cat',
      displayName: id,
      hairStyle: 'short',
      hairColor: '#000',
      skinColor: '#aaa',
      furColor: '#aaa',
      topStyle: 'tee',
      topColor: '#000',
      bottomStyle: 'pants',
      bottomColor: '#000',
    },
    x,
    y,
    facing: 'down',
    roomId: null,
    voiceOn: false,
    sharing: false,
    updatedAt: 1,
  }
}

describe('nearestInteractableNpc', () => {
  it('ignores users and non-interactable NPCs', () => {
    const peers: ActorPresence[] = [
      user('u1', 0, 0),
      npc({ id: 'npc:a', npcKey: 'a', x: 10, y: 0, interactable: false }),
      npc({ id: 'npc:b', npcKey: 'b', x: 20, y: 0, interactable: true }),
      npc({ id: 'npc:c', npcKey: 'c', x: 5, y: 0, interactable: true }),
    ]
    expect(nearestInteractableNpc(peers, 0, 0, 48)?.id).toBe('npc:c')
    expect(nearestInteractableNpc(peers, 0, 0, 4)).toBeNull()
  })
})

describe('pickInteractableNpcAtScreen', () => {
  it('picks nearest projected interactable head', () => {
    const peers: ActorPresence[] = [
      npc({ id: 'npc:far', npcKey: 'far', x: 0, y: 0, interactable: true }),
      npc({ id: 'npc:near', npcKey: 'near', x: 0, y: 0, interactable: true }),
      npc({ id: 'npc:off', npcKey: 'off', x: 0, y: 0, interactable: false }),
    ]
    const project = (id: string) => {
      if (id === 'npc:near') return { x: 0.5, y: 0.5 }
      if (id === 'npc:far') return { x: 0.9, y: 0.9 }
      return { x: 0.51, y: 0.51 }
    }
    const hit = pickInteractableNpcAtScreen(peers, project, 400, 300, 800, 600, 80)
    expect(hit?.id).toBe('npc:near')
  })
})
