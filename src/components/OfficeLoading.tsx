import { useEffect, useRef } from 'react'
import {
  CLOTH_COLORS,
  FUR_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  drawCharacter,
} from '../character/drawCharacter'
import type { AnimalKind, CharacterLook } from '../types'
import { ANIMAL_KINDS } from '../types'
import './OfficeLoading.css'

/** One bounce cycle (up + down), then swap character. */
const BOUNCE_MS = 720

type CastId =
  | { species: 'male' }
  | { species: 'female' }
  | { species: 'animal'; animalKind: AnimalKind }

function allCastIds(): CastId[] {
  return [
    { species: 'male' },
    { species: 'female' },
    ...ANIMAL_KINDS.map((animalKind) => ({ species: 'animal' as const, animalKind })),
  ]
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = items[i]!
    items[i] = items[j]!
    items[j] = tmp
  }
  return items
}

function pick<T>(palette: readonly T[]): T {
  return palette[Math.floor(Math.random() * palette.length)]!
}

function lookFor(id: CastId): CharacterLook {
  if (id.species === 'animal') {
    return {
      species: 'animal',
      animalKind: id.animalKind,
      displayName: '',
      hairStyle: 'short',
      hairColor: pick(HAIR_COLORS),
      skinColor: pick(SKIN_TONES),
      furColor: pick(FUR_COLORS),
      topStyle: 'tee',
      topColor: pick(CLOTH_COLORS),
      bottomStyle: 'pants',
      bottomColor: pick(CLOTH_COLORS),
    }
  }
  return {
    species: id.species,
    animalKind: 'cat',
    displayName: '',
    hairStyle: id.species === 'female' ? 'long' : 'short',
    hairColor: pick(HAIR_COLORS),
    skinColor: pick(SKIN_TONES),
    furColor: pick(FUR_COLORS),
    topStyle: id.species === 'female' ? 'hoodie' : 'tee',
    topColor: pick(CLOTH_COLORS),
    bottomStyle: id.species === 'female' ? 'skirt' : 'pants',
    bottomColor: pick(CLOTH_COLORS),
  }
}

function sameId(a: CastId, b: CastId): boolean {
  if (a.species !== b.species) return false
  if (a.species === 'animal' && b.species === 'animal') return a.animalKind === b.animalKind
  return true
}

/**
 * Suspense fallback while the office chunk loads.
 * Cycles cast members: one bounce each, no repeat until the deck is empty,
 * then reshuffles with fresh colors. Unmounts immediately when the chunk is ready.
 */
export function OfficeLoading() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let deck = shuffleInPlace(allCastIds())
    let current = lookFor(deck.pop()!)
    let bounceStartedAt = performance.now()
    let raf = 0

    const nextCast = () => {
      if (deck.length === 0) {
        deck = shuffleInPlace(allCastIds())
        // Prefer not starting the new round on the same identity we just showed.
        if (deck.length > 1 && sameId(deck[deck.length - 1]!, castIdOf(current))) {
          const last = deck.pop()!
          const swapAt = Math.floor(Math.random() * (deck.length - 1))
          deck.push(deck[swapAt]!)
          deck[swapAt] = last
        }
      }
      current = lookFor(deck.pop()!)
      bounceStartedAt = performance.now()
    }

    const tick = (now: number) => {
      const elapsed = now - bounceStartedAt
      const t = Math.min(1, elapsed / BOUNCE_MS)
      // Single hop: rise then land.
      const bob = -Math.sin(t * Math.PI) * 26

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawCharacter(ctx, current, canvas.width / 2, canvas.height / 2 + 28, 'down', 3.4, bob)

      if (t >= 1) nextCast()
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="office-loading" role="status" aria-live="polite">
      <canvas
        className="office-loading__cast"
        ref={canvasRef}
        width={200}
        height={200}
        aria-hidden="true"
      />
      <p className="office-loading__label">กำลังโหลดออฟฟิศ…</p>
    </div>
  )
}

function castIdOf(look: CharacterLook): CastId {
  if (look.species === 'animal') return { species: 'animal', animalKind: look.animalKind }
  return { species: look.species }
}
