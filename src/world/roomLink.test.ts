import { describe, expect, it } from 'vitest'
import { generateWorld, roomAt } from './terrain'
import {
  buildRoomShareUrl,
  canEnterRoomViaLink,
  findRandomRoomSpawn,
  jitterSpawnPoint,
  readPendingRoomIdFromUrl,
} from './roomLink'
import type { UserPresence } from '../types'

const map = generateWorld(20260717)

function userInRoom(roomId: string, id = 'u1'): UserPresence {
  return {
    kind: 'user',
    id,
    email: `${id}@truedigital.com`,
    look: {
      species: 'male',
      animalKind: 'cat',
      displayName: id,
      hairStyle: 'short',
      hairColor: '#321',
      skinColor: '#b98',
      furColor: '#aaa',
      topStyle: 'tee',
      topColor: '#465',
      bottomStyle: 'pants',
      bottomColor: '#333',
    },
    x: 0,
    y: 0,
    facing: 'down',
    roomId,
    voiceOn: false,
    sharing: false,
    updatedAt: 1,
  }
}

describe('roomLink URL helpers', () => {
  it('reads room id from query string', () => {
    expect(readPendingRoomIdFromUrl('?room=team-core')).toBe('team-core')
    expect(readPendingRoomIdFromUrl('?foo=1&room=meet2-1')).toBe('meet2-1')
    expect(readPendingRoomIdFromUrl('')).toBeNull()
    expect(readPendingRoomIdFromUrl('?room=')).toBeNull()
  })

  it('builds share URL with room query', () => {
    expect(buildRoomShareUrl('team-core', 'https://office.example', '/')).toBe(
      'https://office.example/?room=team-core',
    )
  })
})

describe('findRandomRoomSpawn', () => {
  it('returns a point inside the target room', () => {
    const room = map.rooms.find((r) => r.id === 'team-core')
    expect(room).toBeTruthy()
    const spawn = findRandomRoomSpawn({
      map,
      room: room!,
      random: () => 0,
    })
    expect(spawn).not.toBeNull()
    expect(roomAt(map, spawn!.x, spawn!.y)?.id).toBe('team-core')
  })

  it('works for plaza tiles', () => {
    const room = map.rooms.find((r) => r.id === 'plaza-main')
    expect(room).toBeTruthy()
    const spawn = findRandomRoomSpawn({
      map,
      room: room!,
      random: () => 0.5,
    })
    expect(spawn).not.toBeNull()
    expect(roomAt(map, spawn!.x, spawn!.y)?.id).toBe('plaza-main')
  })

  it('jitter stays near the tile center', () => {
    const base = { x: 100, y: 200 }
    const j = jitterSpawnPoint(base, () => 1)
    expect(Math.abs(j.x - base.x)).toBeLessThan(32)
    expect(Math.abs(j.y - base.y)).toBeLessThan(32)
  })
})

describe('canEnterRoomViaLink', () => {
  it('blocks locked rooms', () => {
    const room = map.rooms.find((r) => r.id === 'team-core')!
    const result = canEnterRoomViaLink({
      room,
      peers: [],
      lockedRoomIds: new Set(['team-core']),
    })
    expect(result).toEqual({ ok: false, reason: 'locked' })
  })

  it('blocks full capacity rooms', () => {
    const room = map.rooms.find((r) => r.id === 'meet2-1')!
    const peers = [userInRoom('meet2-1', 'a'), userInRoom('meet2-1', 'b')]
    const result = canEnterRoomViaLink({
      room,
      peers,
      lockedRoomIds: new Set(),
    })
    expect(result).toEqual({ ok: false, reason: 'full' })
  })

  it('allows open rooms under capacity', () => {
    const room = map.rooms.find((r) => r.id === 'meet2-1')!
    const result = canEnterRoomViaLink({
      room,
      peers: [userInRoom('meet2-1', 'a')],
      lockedRoomIds: new Set(),
    })
    expect(result).toEqual({ ok: true })
  })
})
