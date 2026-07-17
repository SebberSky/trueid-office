import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CharacterLook } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data', 'appearances')

function fileForEmail(email: string) {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9.@_-]/g, '_')
  return path.join(DATA_DIR, `${safe}.json`)
}

export async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

export async function loadAppearance(email: string): Promise<CharacterLook | null> {
  try {
    const raw = await readFile(fileForEmail(email), 'utf8')
    return JSON.parse(raw) as CharacterLook
  } catch {
    return null
  }
}

export async function saveAppearance(email: string, look: CharacterLook) {
  await ensureDataDir()
  await writeFile(fileForEmail(email), JSON.stringify(look, null, 2), 'utf8')
}
