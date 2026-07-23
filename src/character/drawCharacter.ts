import type { AnimalKind, CharacterLook } from '../types'
import { normalizeAnimalKind } from '../types'

export const SKIN_TONES = ['#f6d7c3', '#e8b98a', '#c68642', '#8d5524', '#5c3317']
export const FUR_COLORS = ['#f5f0e6', '#c4a484', '#8b5a2b', '#3d2914', '#e8a0a0', '#7eb6ff', '#b8e0a8']
export const HAIR_COLORS = ['#1a1a1a', '#4a3728', '#c4a35a', '#c8102e', '#1a9b8e', '#f5f5f5', '#6b3fa0']
export const CLOTH_COLORS = ['#c8102e', '#1a9b8e', '#2563eb', '#1e293b', '#f8fafc', '#d97706', '#64748b']

export const DEFAULT_LOOK: CharacterLook = {
  species: 'male',
  animalKind: 'cat',
  displayName: '',
  hairStyle: 'short',
  hairColor: '#1a1a1a',
  skinColor: '#e8b98a',
  furColor: '#c4a484',
  topStyle: 'tee',
  topColor: '#c8102e',
  bottomStyle: 'pants',
  bottomColor: '#1e293b',
}

/** Minecraft-style blocky preview — animals use distinct silhouettes. */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  look: CharacterLook,
  x: number,
  y: number,
  facing: 'down' | 'up' | 'left' | 'right',
  scale = 1,
  bob = 0,
) {
  ctx.save()
  ctx.translate(x, y + bob)
  ctx.scale(scale, scale)
  ctx.imageSmoothingEnabled = false

  if (look.species === 'animal') {
    drawAnimal(ctx, normalizeAnimalKind(look.animalKind), look.furColor, facing)
    ctx.restore()
    return
  }

  const female = look.species === 'female'
  const skin = look.skinColor
  const showFace = facing !== 'up'

  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(-14, 18, 28, 6)

  const legH = look.bottomStyle === 'shorts' ? 10 : 14
  const legGap = female ? 7 : 10
  block(ctx, -legGap - 3, 4, female ? 7 : 8, legH, look.bottomColor)
  block(ctx, legGap - 4, 4, female ? 7 : 8, legH, look.bottomColor)
  block(ctx, -legGap - 3, 4 + legH - 3, female ? 7 : 8, 4, shade(look.bottomColor, -40))
  block(ctx, legGap - 4, 4 + legH - 3, female ? 7 : 8, 4, shade(look.bottomColor, -40))

  if (female) {
    if (look.bottomStyle === 'skirt') {
      block(ctx, -14, -2, 28, 12, look.bottomColor)
      block(ctx, -15, 8, 30, 3, shade(look.bottomColor, -25))
    } else {
      block(ctx, -13, 0, 26, 8, look.bottomColor)
    }
  } else if (look.bottomStyle === 'skirt') {
    block(ctx, -12, 0, 24, 10, look.bottomColor)
  }

  const tw = female ? 14 : 20
  block(ctx, -tw / 2, -14, tw, female ? 16 : 18, look.topColor)
  if (female) {
    block(ctx, -tw / 2 - 1, -18, tw + 2, 8, look.topColor)
    block(ctx, -tw / 2 + 2, -6, tw - 4, 4, shade(look.topColor, -18))
  }

  if (look.topStyle === 'hoodie') {
    block(ctx, -10, -22, 20, 8, look.topColor)
  } else if (look.topStyle === 'shirt') {
    block(ctx, -3, -14, 6, 5, '#f8fafc')
  } else if (look.topStyle === 'vest') {
    block(ctx, -tw / 2, -14, 4, 16, shade(look.topColor, -25))
    block(ctx, tw / 2 - 4, -14, 4, 16, shade(look.topColor, -25))
  }

  const aw = female ? 5 : 8
  block(ctx, -tw / 2 - aw - 1, -14, aw, 15, look.topColor)
  block(ctx, tw / 2 + 1, -14, aw, 15, look.topColor)
  block(ctx, -tw / 2 - aw, 0, aw - 1, 5, skin)
  block(ctx, tw / 2 + 2, 0, aw - 1, 5, skin)

  const hs = female ? 22 : 24
  block(ctx, -hs / 2, -38, hs, hs, skin)

  block(ctx, -hs / 2 - 1, -42, hs + 2, 8, look.hairColor)
  if (female) {
    block(ctx, -hs / 2 - 1, -36, hs + 2, 6, look.hairColor)
    block(ctx, -8, -32, 16, 4, look.hairColor)
    block(ctx, -hs / 2 - 4, -36, 5, 34, look.hairColor)
    block(ctx, hs / 2 - 1, -36, 5, 34, look.hairColor)
    block(ctx, -hs / 2, -20, hs, 22, look.hairColor)
    block(ctx, -10, -8, 20, 16, look.hairColor)
  } else {
    block(ctx, -13, -36, 26, 5, look.hairColor)
    block(ctx, -14, -38, 28, 8, look.hairColor)
  }

  if (showFace) {
    if (facing === 'down') {
      const eyeY = female ? -29 : -30
      block(ctx, -8, eyeY, female ? 6 : 5, female ? 5 : 5, '#fff')
      block(ctx, 3, eyeY, female ? 6 : 5, female ? 5 : 5, '#fff')
      block(ctx, -7, eyeY + 1, 3, 3, '#1a1a1a')
      block(ctx, 4, eyeY + 1, 3, 3, '#1a1a1a')
      if (female) {
        block(ctx, -8, eyeY - 2, 6, 2, '#2a1a14')
        block(ctx, 3, eyeY - 2, 6, 2, '#2a1a14')
        block(ctx, -11, -24, 4, 3, '#f5a0a8')
        block(ctx, 7, -24, 4, 3, '#f5a0a8')
        block(ctx, -4, -20, 8, 3, '#d4787a')
      } else {
        block(ctx, -5, -20, 10, 3, shade(skin, -45))
      }
    } else if (facing === 'left') {
      block(ctx, -10, -30, 5, 5, '#fff')
      block(ctx, -9, -29, 3, 3, '#1a1a1a')
    } else if (facing === 'right') {
      block(ctx, 5, -30, 5, 5, '#fff')
      block(ctx, 6, -29, 3, 3, '#1a1a1a')
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  ctx.strokeRect(-hs / 2 - 0.5, -38.5, hs + 1, hs + 1)

  ctx.restore()
}

function drawAnimal(
  ctx: CanvasRenderingContext2D,
  kind: AnimalKind,
  fur: string,
  facing: 'down' | 'up' | 'left' | 'right',
) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(-16, 16, 32, 5)
  const face = facing === 'down'
  const accent = shade(fur, 35)

  if (kind === 'worm') {
    for (let i = 0; i < 4; i++) {
      block(ctx, -6 + (i % 2), 10 - i * 6, 12 - i, 6, i % 2 ? shade(fur, -20) : fur)
    }
    block(ctx, -7, -18, 14, 10, shade(fur, 10))
    if (face) {
      block(ctx, -4, -14, 2, 2, '#1a1a1a')
      block(ctx, 2, -14, 2, 2, '#1a1a1a')
    }
    return
  }

  if (kind === 'snake') {
    for (let i = 0; i < 7; i++) {
      block(ctx, -10 + Math.sin(i) * 4, 12 - i * 7, 20, 9, i % 2 ? shade(fur, -25) : fur)
    }
    block(ctx, -14, -32, 28, 18, fur)
    if (face) {
      block(ctx, -9, -24, 5, 4, '#f5e6a0')
      block(ctx, 4, -24, 5, 4, '#f5e6a0')
      block(ctx, -2, -16, 4, 3, '#e05050')
    }
    return
  }

  if (kind === 'bird') {
    block(ctx, -8, 6, 5, 10, '#e8a87c')
    block(ctx, 3, 6, 5, 10, '#e8a87c')
    block(ctx, -12, -6, 24, 16, fur)
    block(ctx, -22, -4, 12, 8, shade(fur, -20))
    block(ctx, 10, -4, 12, 8, shade(fur, -20))
    block(ctx, -10, -22, 20, 16, fur)
    block(ctx, -3, -28, 6, 8, accent)
    block(ctx, -4, -14, 8, 6, '#f0b429')
    if (face) {
      block(ctx, -7, -18, 4, 4, '#fff')
      block(ctx, 3, -18, 4, 4, '#fff')
      block(ctx, -6, -17, 2, 2, '#1a1a1a')
      block(ctx, 4, -17, 2, 2, '#1a1a1a')
    }
    return
  }

  if (kind === 'dragon') {
    ctx.save()
    ctx.scale(1.35, 1.35)
    block(ctx, -16, 4, 8, 14, shade(fur, -20))
    block(ctx, 8, 4, 8, 14, shade(fur, -20))
    block(ctx, -16, -4, 8, 12, shade(fur, -20))
    block(ctx, 8, -4, 8, 12, shade(fur, -20))
    block(ctx, -20, -12, 40, 20, fur)
    block(ctx, -5, -22, 10, 8, accent)
    block(ctx, -32, -10, 14, 8, accent)
    block(ctx, 18, -10, 14, 8, accent)
    block(ctx, -14, -34, 28, 22, fur)
    block(ctx, -12, -44, 6, 12, accent)
    block(ctx, 6, -44, 6, 12, accent)
    block(ctx, -8, -24, 16, 10, shade(fur, -25))
    if (face) {
      block(ctx, -10, -28, 6, 5, '#7cf5ff')
      block(ctx, 4, -28, 6, 5, '#7cf5ff')
    }
    ctx.restore()
    return
  }

  if (kind === 'godzilla') {
    ctx.save()
    ctx.scale(1.35, 1.35)
    // Legs
    block(ctx, -14, 6, 10, 18, shade(fur, -20))
    block(ctx, 4, 6, 10, 18, shade(fur, -20))
    // Torso upright
    block(ctx, -16, -18, 32, 28, fur)
    block(ctx, -10, -12, 20, 12, shade(fur, 25))
    // Arms
    block(ctx, -24, -14, 8, 16, shade(fur, -15))
    block(ctx, 16, -14, 8, 16, shade(fur, -15))
    // Dorsal plates
    block(ctx, -4, -28, 4, 10, accent)
    block(ctx, -2, -32, 4, 10, accent)
    block(ctx, 0, -28, 4, 10, accent)
    // Head
    block(ctx, -12, -40, 24, 18, fur)
    block(ctx, -8, -34, 16, 10, shade(fur, -20))
    if (face) {
      block(ctx, -8, -36, 5, 4, '#f5e050')
      block(ctx, 3, -36, 5, 4, '#f5e050')
      block(ctx, -6, -28, 12, 4, '#1a1a1a')
    }
    // Tail
    block(ctx, -4, 10, 8, 8, fur)
    block(ctx, -2, 16, 6, 8, accent)
    ctx.restore()
    return
  }

  if (kind === 'yoda') {
    block(ctx, -8, 8, 6, 10, shade(fur, -20))
    block(ctx, 2, 8, 6, 10, shade(fur, -20))
    block(ctx, -12, -4, 24, 16, '#c4a35a')
    block(ctx, -10, -22, 20, 16, fur)
    block(ctx, -22, -18, 10, 6, fur)
    block(ctx, 12, -18, 10, 6, fur)
    if (face) {
      block(ctx, -6, -16, 4, 4, '#1a1a1a')
      block(ctx, 2, -16, 4, 4, '#1a1a1a')
    }
    block(ctx, 14, -2, 4, 22, '#8b6914')
    return
  }

  // Quad: cat / dog / bunny
  const bodyW = kind === 'dog' ? 28 : 24
  block(ctx, -10, 6, 6, 10, shade(fur, -15))
  block(ctx, 4, 6, 6, 10, shade(fur, -15))
  block(ctx, -10, 2, 6, 8, shade(fur, -15))
  block(ctx, 4, 2, 6, 8, shade(fur, -15))
  block(ctx, -bodyW / 2, -6, bodyW, 14, fur)

  if (kind === 'bunny') {
    block(ctx, -10, -40, 6, 18, fur)
    block(ctx, 4, -40, 6, 18, fur)
    block(ctx, -8, -38, 2, 12, '#f8c8c8')
    block(ctx, 6, -38, 2, 12, '#f8c8c8')
    block(ctx, -12, -22, 24, 18, fur)
    block(ctx, -4, 2, 8, 8, '#f8fafc')
  } else if (kind === 'cat') {
    // Tall triangle ears
    block(ctx, -16, -36, 8, 16, fur)
    block(ctx, 8, -36, 8, 16, fur)
    block(ctx, -14, -34, 3, 10, '#ff9eb5')
    block(ctx, 11, -34, 3, 10, '#ff9eb5')
    // Wide head + cheek
    block(ctx, -14, -24, 28, 18, fur)
    block(ctx, -16, -16, 8, 8, shade(fur, 10))
    block(ctx, 8, -16, 8, 8, shade(fur, 10))
    block(ctx, -6, -12, 12, 6, shade(fur, -12))
    block(ctx, -3, -10, 6, 4, '#ff8fab')
    if (face) {
      block(ctx, -9, -18, 7, 4, '#7CFC00')
      block(ctx, 2, -18, 7, 4, '#7CFC00')
      block(ctx, -6, -18, 2, 4, '#0a0a0a')
      block(ctx, 5, -18, 2, 4, '#0a0a0a')
    }
    block(ctx, -18, -8, 8, 2, '#f8fafc')
    block(ctx, 10, -8, 8, 2, '#f8fafc')
    block(ctx, 10, -2, 12, 4, fur)
  } else {
    block(ctx, -18, -18, 7, 14, shade(fur, -25))
    block(ctx, 11, -18, 7, 14, shade(fur, -25))
    block(ctx, -12, -22, 24, 18, fur)
    block(ctx, -6, -14, 12, 10, shade(fur, -15))
    block(ctx, -3, -10, 6, 5, '#1a1a1a')
    if (face) {
      block(ctx, -8, -18, 5, 5, '#fff')
      block(ctx, 3, -18, 5, 5, '#fff')
      block(ctx, -7, -17, 3, 3, '#1a1a1a')
      block(ctx, 4, -17, 3, 3, '#1a1a1a')
    }
    block(ctx, 10, 0, 14, 5, fur)
  }
}

function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  ctx.fillStyle = shade(color, 25)
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 2)
  ctx.fillStyle = shade(color, -30)
  ctx.fillRect(Math.round(x), Math.round(y + h - 2), Math.round(w), 2)
}

function shade(hex: string, amount: number) {
  const n = hex.replace('#', '')
  const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
