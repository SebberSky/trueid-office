import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Facing } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data', 'positions')

export type SavedPose = {
  x: number
  y: number
  facing: Facing
}

const FACINGS = new Set<Facing>(['down', 'up', 'left', 'right'])

function fileForEmail(email: string) {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9.@_-]/g, '_')
  return path.join(DATA_DIR, `${safe}.json`)
}

export async function ensurePositionDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

function normalizePose(raw: unknown): SavedPose | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const facing = o.facing
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (typeof facing !== 'string' || !FACINGS.has(facing as Facing)) return null
  return { x, y, facing: facing as Facing }
}

export async function loadPosition(email: string): Promise<SavedPose | null> {
  try {
    const raw = await readFile(fileForEmail(email), 'utf8')
    return normalizePose(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function savePosition(email: string, pose: SavedPose) {
  const normalized = normalizePose(pose)
  if (!normalized) return
  await ensurePositionDir()
  await writeFile(fileForEmail(email), JSON.stringify(normalized, null, 2), 'utf8')
}
