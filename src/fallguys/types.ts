export const FALLGUYS_ROOM_ID = 'fallguys-arena'
export const FALLGUYS_ROOM_NAME = 'Fall Guys Arena'

export type FallGuysRacer = {
  id: string
  name: string
  progress: number
  finishedAt: number | null
}

export type FallGuysLobbyState = {
  hostId: string | null
  inZone: { id: string; name: string }[]
}

export type FallGuysRaceStart = {
  raceId: number
  startedAt: number
  players: { id: string; name: string }[]
}

export type FallGuysRaceUpdate = {
  raceId: number
  scores: FallGuysRacer[]
}

export type FallGuysRaceOver = {
  raceId: number
  ranking: FallGuysRacer[]
}

/** Snapshot for late joiners / welcome while a race is live. */
export type FallGuysActiveRace = {
  phase: 'racing' | 'results'
  race: FallGuysRaceStart
  scores: FallGuysRacer[]
}
