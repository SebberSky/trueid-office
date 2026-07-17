import * as THREE from 'three'
import type { AnimalKind, CharacterLook, Facing } from '../types'
import { normalizeAnimalKind } from '../types'

function hex(c: string) {
  return new THREE.Color(c)
}

function mat(color: string) {
  return new THREE.MeshLambertMaterial({ color: hex(color) })
}

type Gait =
  | 'human'
  | 'feline'
  | 'canine'
  | 'hop'
  | 'bird'
  | 'worm'
  | 'slither'
  | 'dragon'
  | 'yoda'

function gaitFor(kind: AnimalKind): Gait {
  switch (kind) {
    case 'cat':
      return 'feline'
    case 'dog':
      return 'canine'
    case 'bunny':
      return 'hop'
    case 'bird':
      return 'bird'
    case 'worm':
      return 'worm'
    case 'snake':
      return 'slither'
    case 'dragon':
      return 'dragon'
    case 'yoda':
      return 'yoda'
  }
}

/**
 * Minecraft-style blocky avatar.
 * Animals use distinct bodies + gaits (not human walk).
 */
export class Character3D {
  readonly root = new THREE.Group()
  private body = new THREE.Group()
  private leftLeg!: THREE.Object3D
  private rightLeg!: THREE.Object3D
  private leftArm!: THREE.Object3D
  private rightArm!: THREE.Object3D
  private headG!: THREE.Group
  private walkPhase = 0
  private jumpY = 0
  private jumpVel = 0
  private readonly jumpSpeed = 5.2
  private readonly jumpGravity = 20
  private label: THREE.Sprite
  private gait: Gait = 'human'
  private animalKind: AnimalKind | null = null
  private wingL: THREE.Object3D | null = null
  private wingR: THREE.Object3D | null = null
  private segments: THREE.Object3D[] = []
  private restY = 0

  constructor(look: CharacterLook) {
    this.root.add(this.body)

    const isAnimal = look.species === 'animal'
    if (isAnimal) {
      this.animalKind = normalizeAnimalKind(look.animalKind)
      this.gait = gaitFor(this.animalKind)
      this.buildAnimal(look, this.animalKind)
    } else {
      this.buildHuman(look)
    }

    this.label = makeNameSprite(look.displayName || 'guest')
    this.label.position.y = labelYFor(this.animalKind, this.gait)
    this.root.add(this.label)

    const baseScale =
      this.animalKind === 'dragon'
        ? 0.88
        : this.animalKind === 'snake'
          ? 0.68
          : this.animalKind === 'yoda'
            ? 0.48
            : 0.55
    this.root.scale.setScalar(baseScale)
  }

  private buildHuman(look: CharacterLook) {
    const skin = look.skinColor
    const female = look.species === 'female'

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(female ? 0.85 : 0.95, 0.48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.01
    this.root.add(shadow)

    const legGap = female ? 0.13 : 0.155
    const legW = female ? 0.22 : 0.25
    this.leftLeg = voxel(legW, 0.75, 0.25, look.bottomColor)
    this.rightLeg = voxel(legW, 0.75, 0.25, look.bottomColor)
    this.leftLeg.position.set(-legGap, 0.375, 0)
    this.rightLeg.position.set(legGap, 0.375, 0)
    this.body.add(this.leftLeg, this.rightLeg)

    const shoeL = voxel(legW + 0.04, 0.12, 0.3, shade(look.bottomColor, -40))
    const shoeR = shoeL.clone()
    shoeL.position.set(-legGap, 0.06, 0.02)
    shoeR.position.set(legGap, 0.06, 0.02)
    this.body.add(shoeL, shoeR)

    if (female) {
      if (look.bottomStyle === 'skirt') {
        const skirt = voxel(0.95, 0.42, 0.55, look.bottomColor)
        skirt.position.set(0, 0.88, 0)
        this.body.add(skirt)
        const hem = voxel(1.0, 0.08, 0.58, shade(look.bottomColor, -25))
        hem.position.set(0, 0.68, 0)
        this.body.add(hem)
      } else {
        const hips = voxel(0.88, 0.28, 0.48, look.bottomColor)
        hips.position.set(0, 0.82, 0)
        this.body.add(hips)
      }
    } else if (look.bottomStyle === 'skirt') {
      const skirt = voxel(0.7, 0.35, 0.45, look.bottomColor)
      skirt.position.set(0, 0.85, 0)
      this.body.add(skirt)
    }

    const torsoW = female ? 0.58 : 0.8
    const torsoD = female ? 0.36 : 0.4
    const torso = voxel(torsoW, female ? 0.7 : 0.75, torsoD, look.topColor)
    torso.position.set(0, female ? 1.15 : 1.125, 0)
    this.body.add(torso)

    if (female) {
      const chest = voxel(torsoW + 0.06, 0.28, torsoD + 0.12, look.topColor)
      chest.position.set(0, 1.32, 0.08)
      this.body.add(chest)
      const waist = voxel(torsoW - 0.08, 0.14, torsoD - 0.02, shade(look.topColor, -15))
      waist.position.set(0, 1.0, 0)
      this.body.add(waist)
    }

    if (look.topStyle === 'hoodie') {
      const hood = voxel(female ? 0.48 : 0.55, 0.28, 0.45, look.topColor)
      hood.position.set(0, female ? 1.58 : 1.55, -0.05)
      this.body.add(hood)
    } else if (look.topStyle === 'shirt') {
      const collar = voxel(0.2, 0.1, 0.12, '#f8fafc')
      collar.position.set(0, female ? 1.48 : 1.45, 0.18)
      this.body.add(collar)
    } else if (look.topStyle === 'vest') {
      const vL = voxel(0.14, 0.65, 0.1, shade(look.topColor, -20))
      const vR = vL.clone()
      vL.position.set(-(torsoW / 2 - 0.05), 1.15, 0.18)
      vR.position.set(torsoW / 2 - 0.05, 1.15, 0.18)
      this.body.add(vL, vR)
    }

    const armW = female ? 0.16 : 0.25
    const armD = female ? 0.2 : 0.25
    this.leftArm = voxel(armW, 0.72, armD, look.topColor)
    this.rightArm = voxel(armW, 0.72, armD, look.topColor)
    const armX = torsoW / 2 + armW / 2 + 0.02
    this.leftArm.position.set(-armX, 1.14, 0)
    this.rightArm.position.set(armX, 1.14, 0)
    this.body.add(this.leftArm, this.rightArm)

    const handL = voxel(armW + 0.02, armW + 0.02, armD, skin)
    const handR = handL.clone()
    handL.position.set(-armX, 0.7, 0)
    handR.position.set(armX, 0.7, 0)
    this.body.add(handL, handR)

    this.headG = new THREE.Group()
    this.headG.position.set(0, female ? 1.72 : 1.7, 0)
    this.body.add(this.headG)

    const headSize = female ? 0.66 : 0.7
    this.headG.add(voxel(headSize, headSize, headSize, skin))
    addHumanFace(this.headG, female, headSize, skin)
    addHairBlocks(this.headG, look)
  }

  private buildAnimal(look: CharacterLook, kind: AnimalKind) {
    const fur = look.furColor

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(kind === 'snake' || kind === 'worm' ? 1.2 : 1.1, 0.55),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.01
    this.root.add(shadow)

    // Dummy limbs (replaced per kind); keep non-null for setPose
    this.leftLeg = new THREE.Group()
    this.rightLeg = new THREE.Group()
    this.leftArm = new THREE.Group()
    this.rightArm = new THREE.Group()
    this.headG = new THREE.Group()

    if (kind === 'worm') {
      this.buildWorm(fur)
      return
    }
    if (kind === 'snake') {
      this.buildSnake(fur)
      return
    }
    if (kind === 'bird') {
      this.buildBird(fur)
      return
    }
    if (kind === 'dragon') {
      this.buildDragon(fur)
      return
    }
    if (kind === 'yoda') {
      this.buildYoda(fur)
      return
    }
    // cat / dog / bunny — quadrupeds
    this.buildQuad(kind, fur)
  }

  private buildQuad(kind: AnimalKind, fur: string) {
    const bodyLen = kind === 'bunny' ? 0.7 : kind === 'dog' ? 0.85 : 0.75
    const bodyH = kind === 'bunny' ? 0.42 : 0.38
    const bodyW = kind === 'dog' ? 0.48 : kind === 'bunny' ? 0.5 : 0.42
    const torso = voxel(bodyW, bodyH, bodyLen, fur)
    torso.position.set(0, 0.48, 0)
    this.body.add(torso)
    this.restY = 0

    const legH = kind === 'bunny' ? 0.32 : 0.36
    const legW = kind === 'dog' ? 0.14 : 0.12
    const zx = bodyLen * 0.32
    const x = bodyW * 0.32
    this.leftArm = voxel(legW, legH, legW, shade(fur, -15)) // front-left
    this.rightArm = voxel(legW, legH, legW, shade(fur, -15)) // front-right
    this.leftLeg = voxel(legW, legH, legW, shade(fur, -15)) // back-left
    this.rightLeg = voxel(legW, legH, legW, shade(fur, -15)) // back-right
    this.leftArm.position.set(-x, legH / 2, zx)
    this.rightArm.position.set(x, legH / 2, zx)
    this.leftLeg.position.set(-x, legH / 2, -zx)
    this.rightLeg.position.set(x, legH / 2, -zx)
    this.body.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg)

    this.headG.position.set(0, kind === 'bunny' ? 0.72 : 0.68, bodyLen * 0.55)
    this.body.add(this.headG)

    if (kind === 'cat') addCatHead(this.headG, fur)
    else if (kind === 'dog') addDogHead(this.headG, fur)
    else addBunnyHead(this.headG, fur)

    const tail =
      kind === 'bunny'
        ? voxel(0.22, 0.22, 0.22, '#f8fafc')
        : kind === 'dog'
          ? voxel(0.14, 0.14, 0.45, fur)
          : voxel(0.1, 0.1, 0.5, fur)
    tail.position.set(0, kind === 'bunny' ? 0.55 : 0.58, -bodyLen * 0.55)
    if (kind === 'cat') tail.rotation.x = 0.4
    this.body.add(tail)
  }

  private buildBird(fur: string) {
    const crest = shade(fur, 35)
    const torso = voxel(0.4, 0.45, 0.5, fur)
    torso.position.set(0, 0.55, 0)
    this.body.add(torso)
    this.restY = 0

    this.leftLeg = voxel(0.1, 0.28, 0.1, '#e8a87c')
    this.rightLeg = voxel(0.1, 0.28, 0.1, '#e8a87c')
    this.leftLeg.position.set(-0.1, 0.14, 0.02)
    this.rightLeg.position.set(0.1, 0.14, 0.02)
    this.body.add(this.leftLeg, this.rightLeg)

    this.leftArm = voxel(0.08, 0.08, 0.08, fur)
    this.rightArm = voxel(0.08, 0.08, 0.08, fur)
    this.leftArm.visible = false
    this.rightArm.visible = false
    this.body.add(this.leftArm, this.rightArm)

    // Pivot wings at the shoulder so flaps read as flight
    this.wingL = voxel(0.65, 0.1, 0.32, shade(fur, -20))
    this.wingR = voxel(0.65, 0.1, 0.32, shade(fur, -20))
    this.wingL.position.set(-0.22, 0.62, 0.02)
    this.wingR.position.set(0.22, 0.62, 0.02)
    ;(this.wingL as THREE.Mesh).geometry.translate(-0.28, 0, 0)
    ;(this.wingR as THREE.Mesh).geometry.translate(0.28, 0, 0)
    this.body.add(this.wingL, this.wingR)

    this.headG.position.set(0, 0.9, 0.15)
    this.body.add(this.headG)
    addBirdHead(this.headG, fur, crest)

    const tail = voxel(0.2, 0.08, 0.35, shade(fur, -30))
    tail.position.set(0, 0.48, -0.4)
    this.body.add(tail)
  }

  private buildWorm(fur: string) {
    this.segments = []
    for (let i = 0; i < 5; i++) {
      const seg = voxel(0.26 - i * 0.015, 0.22, 0.22, i % 2 ? shade(fur, -15) : fur)
      seg.position.set(0, 0.16, 0.35 - i * 0.2)
      this.body.add(seg)
      this.segments.push(seg)
    }
    this.leftLeg = this.segments[1] ?? new THREE.Group()
    this.rightLeg = this.segments[2] ?? new THREE.Group()
    this.leftArm = this.segments[3] ?? new THREE.Group()
    this.rightArm = this.segments[4] ?? new THREE.Group()

    this.headG.position.set(0, 0.2, 0.5)
    this.body.add(this.headG)
    const head = voxel(0.28, 0.24, 0.24, shade(fur, 10))
    this.headG.add(head)
    for (const s of [-1, 1]) {
      const eye = voxel(0.06, 0.06, 0.05, '#1a1a1a')
      eye.position.set(s * 0.08, 0.04, 0.13)
      this.headG.add(eye)
    }
  }

  private buildSnake(fur: string) {
    this.segments = []
    for (let i = 0; i < 10; i++) {
      const w = 0.42 - i * 0.012
      const seg = voxel(w, 0.34, 0.32, i % 2 ? shade(fur, -20) : fur)
      seg.position.set(0, 0.2, 0.95 - i * 0.3)
      this.body.add(seg)
      this.segments.push(seg)
    }
    this.leftLeg = this.segments[2] ?? new THREE.Group()
    this.rightLeg = this.segments[3] ?? new THREE.Group()
    this.leftArm = this.segments[4] ?? new THREE.Group()
    this.rightArm = this.segments[5] ?? new THREE.Group()

    this.headG.position.set(0, 0.32, 1.25)
    this.body.add(this.headG)
    addSnakeHead(this.headG, fur)
  }

  private buildDragon(fur: string) {
    const accent = shade(fur, 40)
    const torso = voxel(0.85, 0.7, 1.45, fur)
    torso.position.set(0, 0.75, 0)
    this.body.add(torso)

    const spine = voxel(0.18, 0.32, 1.2, accent)
    spine.position.set(0, 1.2, -0.05)
    this.body.add(spine)
    for (let i = 0; i < 4; i++) {
      const spike = voxel(0.1, 0.28, 0.1, accent)
      spike.position.set(0, 1.4, 0.4 - i * 0.3)
      this.body.add(spike)
    }

    const legH = 0.55
    const legW = 0.22
    this.leftArm = voxel(legW, legH, legW, shade(fur, -20))
    this.rightArm = voxel(legW, legH, legW, shade(fur, -20))
    this.leftLeg = voxel(legW, legH, legW, shade(fur, -20))
    this.rightLeg = voxel(legW, legH, legW, shade(fur, -20))
    this.leftArm.position.set(-0.32, legH / 2, 0.4)
    this.rightArm.position.set(0.32, legH / 2, 0.4)
    this.leftLeg.position.set(-0.32, legH / 2, -0.42)
    this.rightLeg.position.set(0.32, legH / 2, -0.42)
    this.body.add(this.leftArm, this.rightArm, this.leftLeg, this.rightLeg)

    this.wingL = voxel(1.1, 0.1, 0.7, shade(accent, -10))
    this.wingR = voxel(1.1, 0.1, 0.7, shade(accent, -10))
    this.wingL.position.set(-0.75, 1.05, 0)
    this.wingR.position.set(0.75, 1.05, 0)
    this.body.add(this.wingL, this.wingR)

    this.headG.position.set(0, 1.2, 0.9)
    this.body.add(this.headG)
    addDragonHead(this.headG, fur, accent)

    const tail = voxel(0.28, 0.28, 1.1, fur)
    tail.position.set(0, 0.6, -1.05)
    this.body.add(tail)
    const tip = voxel(0.18, 0.35, 0.3, accent)
    tip.position.set(0, 0.7, -1.6)
    this.body.add(tip)
  }



  private buildYoda(fur: string) {
    const green = fur || '#6fbf4a'
    const robe = '#c4a35a'
    const torso = voxel(0.45, 0.4, 0.35, robe)
    torso.position.set(0, 0.55, 0)
    this.body.add(torso)

    this.leftLeg = voxel(0.14, 0.28, 0.16, shade(green, -20))
    this.rightLeg = voxel(0.14, 0.28, 0.16, shade(green, -20))
    this.leftArm = voxel(0.12, 0.32, 0.12, green)
    this.rightArm = voxel(0.12, 0.32, 0.12, green)
    this.leftLeg.position.set(-0.12, 0.14, 0)
    this.rightLeg.position.set(0.12, 0.14, 0)
    this.leftArm.position.set(-0.32, 0.55, 0)
    this.rightArm.position.set(0.32, 0.55, 0)
    this.body.add(this.leftLeg, this.rightLeg, this.leftArm, this.rightArm)

    // cane
    const cane = voxel(0.06, 0.7, 0.06, '#8b6914')
    cane.position.set(0.42, 0.4, 0.1)
    this.body.add(cane)

    this.headG.position.set(0, 0.95, 0.05)
    this.body.add(this.headG)
    const head = voxel(0.42, 0.36, 0.4, green)
    this.headG.add(head)
    for (const s of [-1, 1]) {
      const ear = voxel(0.12, 0.08, 0.32, green)
      ear.position.set(s * 0.28, 0.02, -0.05)
      this.headG.add(ear)
    }
    for (const s of [-1, 1]) {
      const eye = voxel(0.1, 0.1, 0.05, '#1a1a1a')
      eye.position.set(s * 0.1, 0.02, 0.22)
      this.headG.add(eye)
    }
    this.restY = 0
  }





  setLookName(name: string) {
    this.root.remove(this.label)
    this.label.material.dispose()
    ;(this.label.material as THREE.SpriteMaterial).map?.dispose()
    this.label = makeNameSprite(name)
    this.label.position.y = labelYFor(this.animalKind, this.gait)
    this.root.add(this.label)
  }

  /** Visual-only hop — does not change map collision / terrain. */
  triggerJump() {
    if (this.jumpY > 0.02 || this.jumpVel > 0) return
    this.jumpVel = this.jumpSpeed
  }

  airHeight() {
    return this.jumpY
  }

  setPose(
    px: number,
    pz: number,
    py: number,
    facing: Facing,
    moving: boolean,
    dt: number,
    overWater = false,
  ) {
    this.stepJump(dt)
    this.root.position.set(px, py + this.jumpY, pz)
    const yaw =
      facing === 'down' ? 0 : facing === 'up' ? Math.PI : facing === 'left' ? -Math.PI / 2 : Math.PI / 2
    this.body.rotation.y = yaw

    if (moving) {
      this.animateWalk(dt)
    } else if (this.gait === 'bird' && overWater) {
      // Parked over water: keep hovering — never land/stand in the pond
      this.hoverInPlace(dt)
    } else {
      this.settle()
    }
  }

  private stepJump(dt: number) {
    if (this.jumpVel === 0 && this.jumpY === 0) return
    this.jumpY += this.jumpVel * dt
    this.jumpVel -= this.jumpGravity * dt
    if (this.jumpY <= 0) {
      this.jumpY = 0
      this.jumpVel = 0
    }
  }

  /** Idle hover while floating above water. */
  private hoverInPlace(dt: number) {
    this.walkPhase += dt * 9
    const flap = Math.sin(this.walkPhase)
    const cruise = 0.62
    const targetY = this.restY + cruise + flap * 0.05
    this.body.position.y += (targetY - this.body.position.y) * Math.min(1, dt * 8)
    this.body.rotation.x += (-0.12 - this.body.rotation.x) * 0.15
    this.body.rotation.z *= 0.9
    this.leftLeg.rotation.x += (1.05 - this.leftLeg.rotation.x) * 0.2
    this.rightLeg.rotation.x += (1.05 - this.rightLeg.rotation.x) * 0.2
    if (this.wingL && this.wingR) {
      const wing = flap * 0.55
      this.wingL.rotation.z = 0.15 + wing
      this.wingR.rotation.z = -0.15 - wing
    }
    this.label.position.y = 1.85 + cruise
  }

  private animateWalk(dt: number) {
    switch (this.gait) {
      case 'feline': {
        this.walkPhase += dt * 9
        const s = Math.sin(this.walkPhase) * 0.55
        // diagonal pairs
        this.leftArm.rotation.x = s
        this.rightLeg.rotation.x = s
        this.rightArm.rotation.x = -s
        this.leftLeg.rotation.x = -s
        this.body.position.y = this.restY + Math.abs(Math.sin(this.walkPhase)) * 0.025
        break
      }
      case 'canine': {
        this.walkPhase += dt * 11
        const s = Math.sin(this.walkPhase) * 0.75
        this.leftArm.rotation.x = s
        this.rightLeg.rotation.x = s
        this.rightArm.rotation.x = -s
        this.leftLeg.rotation.x = -s
        this.body.position.y = this.restY + Math.abs(Math.sin(this.walkPhase * 2)) * 0.05
        this.body.rotation.z = Math.sin(this.walkPhase) * 0.04
        break
      }
      case 'hop': {
        this.walkPhase += dt * 8
        const hop = Math.max(0, Math.sin(this.walkPhase))
        const tuck = -hop * 0.9
        this.leftArm.rotation.x = tuck
        this.rightArm.rotation.x = tuck
        this.leftLeg.rotation.x = tuck
        this.rightLeg.rotation.x = tuck
        this.body.position.y = this.restY + hop * 0.28
        break
      }
      case 'bird': {
        // Cruise in the air with wing flaps — no hop/bounce on the ground
        this.walkPhase += dt * 14
        const flap = Math.sin(this.walkPhase)
        const cruise = 0.62
        this.body.position.y = this.restY + cruise + flap * 0.07
        this.body.rotation.x = -0.18
        this.body.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.04
        // Legs tucked for flight
        this.leftLeg.rotation.x = 1.05
        this.rightLeg.rotation.x = 1.05
        if (this.wingL && this.wingR) {
          const wing = flap * 1.05
          this.wingL.rotation.z = 0.2 + wing
          this.wingR.rotation.z = -0.2 - wing
          this.wingL.rotation.x = Math.max(0, flap) * 0.2
          this.wingR.rotation.x = Math.max(0, flap) * 0.2
        }
        this.label.position.y = 1.85 + cruise
        break
      }
      case 'worm': {
        this.walkPhase += dt * 7
        this.segments.forEach((seg, i) => {
          seg.position.y = 0.2 + Math.sin(this.walkPhase + i * 0.7) * 0.08
          seg.position.x = Math.sin(this.walkPhase * 0.5 + i * 0.5) * 0.04
        })
        break
      }
      case 'slither': {
        this.walkPhase += dt * 8
        this.segments.forEach((seg, i) => {
          seg.position.x = Math.sin(this.walkPhase + i * 0.55) * 0.18
          seg.rotation.y = Math.cos(this.walkPhase + i * 0.55) * 0.15
        })
        break
      }
      case 'dragon': {
        this.walkPhase += dt * 7
        const s = Math.sin(this.walkPhase) * 0.65
        this.leftArm.rotation.x = s
        this.rightLeg.rotation.x = s
        this.rightArm.rotation.x = -s
        this.leftLeg.rotation.x = -s
        this.body.position.y = this.restY + Math.abs(Math.sin(this.walkPhase)) * 0.06
        if (this.wingL && this.wingR) {
          const flap = Math.sin(this.walkPhase * 1.5) * 0.45
          this.wingL.rotation.z = 0.3 + flap
          this.wingR.rotation.z = -0.3 - flap
        }
        break
      }
      case 'yoda': {
        this.walkPhase += dt * 7
        const s = Math.sin(this.walkPhase)
        this.leftLeg.rotation.x = s * 0.5
        this.rightLeg.rotation.x = -s * 0.5
        this.leftArm.rotation.x = -0.3 + s * 0.2
        this.rightArm.rotation.x = -0.5
        this.body.position.y = this.restY + Math.abs(s) * 0.06
        this.body.rotation.z = s * 0.06
        break
      }
      default: {
        this.walkPhase += dt * 10
        const swing = Math.sin(this.walkPhase) * 0.7
        this.leftLeg.rotation.x = swing
        this.rightLeg.rotation.x = -swing
        this.leftArm.rotation.x = -swing
        this.rightArm.rotation.x = swing
        this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.04
      }
    }
  }

  private settle() {
    this.walkPhase *= 0.85
    this.leftLeg.rotation.x *= 0.8
    this.rightLeg.rotation.x *= 0.8
    this.leftArm.rotation.x *= 0.8
    this.rightArm.rotation.x *= 0.8
    this.body.position.y += (this.restY - this.body.position.y) * 0.2
    this.body.rotation.x *= 0.8
    this.body.rotation.z *= 0.8
    if (this.wingL) {
      this.wingL.rotation.z *= 0.85
      this.wingL.rotation.x *= 0.85
    }
    if (this.wingR) {
      this.wingR.rotation.z *= 0.85
      this.wingR.rotation.x *= 0.85
    }
    if (this.gait === 'bird') {
      this.label.position.y += (1.85 - this.label.position.y) * 0.2
    }
    this.headG.rotation.y *= 0.85
    for (const seg of this.segments) {
      seg.position.x *= 0.85
      seg.rotation.y *= 0.85
      if (this.gait === 'worm') seg.position.y += (0.2 - seg.position.y) * 0.15
    }
  }

  dispose() {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const m = obj.material
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m.dispose()
      }
    })
  }
}

function voxel(w: number, h: number, d: number, color: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function addHumanFace(head: THREE.Group, female: boolean, headSize: number, skin: string) {
  for (const s of [-1, 1]) {
    const white = new THREE.Mesh(
      new THREE.BoxGeometry(female ? 0.15 : 0.14, female ? 0.13 : 0.14, 0.04),
      mat('#ffffff'),
    )
    white.position.set(s * (female ? 0.15 : 0.16), female ? 0.08 : 0.06, headSize / 2 + 0.01)
    const iris = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), mat('#1a1a1a'))
    iris.position.set(s * (female ? 0.15 : 0.16), female ? 0.08 : 0.06, headSize / 2 + 0.03)
    head.add(white, iris)
    if (female) {
      const lash = voxel(0.16, 0.04, 0.03, '#2a1a14')
      lash.position.set(s * 0.15, 0.16, headSize / 2 + 0.02)
      head.add(lash)
      const blush = voxel(0.12, 0.06, 0.03, '#f5a0a8')
      blush.position.set(s * 0.24, -0.02, headSize / 2 + 0.01)
      head.add(blush)
    }
  }
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(female ? 0.18 : 0.22, female ? 0.05 : 0.06, 0.04),
    mat(female ? '#d4787a' : shade(skin, -40)),
  )
  mouth.position.set(0, female ? -0.14 : -0.16, headSize / 2 + 0.01)
  head.add(mouth)
}

function addCatHead(head: THREE.Group, fur: string) {
  // Wide feline skull (not round mouse)
  head.add(voxel(0.62, 0.48, 0.52, fur))
  head.add(pos(voxel(0.7, 0.22, 0.4, shade(fur, 8)), 0, 0.05, 0.02)) // cheek fluff
  // Tall triangle ears on top corners
  for (const s of [-1, 1]) {
    const ear = voxel(0.16, 0.42, 0.1, fur)
    ear.position.set(s * 0.28, 0.42, -0.05)
    ear.rotation.z = s * 0.35
    const inner = voxel(0.07, 0.26, 0.06, '#ff9eb5')
    inner.position.set(s * 0.28, 0.4, 0.02)
    inner.rotation.z = s * 0.35
    head.add(ear, inner)
  }
  // Short flat muzzle (cat, not rodent)
  head.add(pos(voxel(0.34, 0.18, 0.22, shade(fur, -12)), 0, -0.12, 0.3))
  // Pink inverted-triangle nose
  head.add(pos(voxel(0.1, 0.08, 0.08, '#ff8fab'), 0, -0.04, 0.42))
  // Almond eyes + vertical slit pupils
  for (const s of [-1, 1]) {
    head.add(pos(voxel(0.16, 0.1, 0.04, '#7CFC00'), s * 0.16, 0.1, 0.28))
    head.add(pos(voxel(0.04, 0.1, 0.04, '#0a0a0a'), s * 0.16, 0.1, 0.3))
  }
  // Long whiskers
  for (const s of [-1, 1]) {
    head.add(pos(voxel(0.28, 0.025, 0.025, '#f8fafc'), s * 0.34, -0.1, 0.28))
    head.add(pos(voxel(0.24, 0.025, 0.025, '#f8fafc'), s * 0.32, -0.16, 0.26))
  }
}

function addDogHead(head: THREE.Group, fur: string) {
  head.add(voxel(0.58, 0.52, 0.52, fur))
  // Floppy rounded ears
  for (const s of [-1, 1]) {
    const ear = voxel(0.16, 0.36, 0.12, shade(fur, -25))
    ear.position.set(s * 0.34, 0.05, 0.02)
    ear.rotation.z = s * 0.55
    head.add(ear)
  }
  // Long snout
  head.add(pos(voxel(0.32, 0.24, 0.42, shade(fur, -15)), 0, -0.06, 0.4))
  head.add(pos(voxel(0.16, 0.12, 0.12, '#1a1a1a'), 0, 0.0, 0.62))
  // Round eyes
  for (const s of [-1, 1]) {
    head.add(pos(voxel(0.12, 0.12, 0.04, '#fff'), s * 0.16, 0.1, 0.28))
    head.add(pos(voxel(0.07, 0.07, 0.04, '#1a1a1a'), s * 0.16, 0.1, 0.3))
  }
  // Tongue hint
  head.add(pos(voxel(0.1, 0.06, 0.12, '#e07070'), 0, -0.16, 0.55))
}

function addBunnyHead(head: THREE.Group, fur: string) {
  head.add(voxel(0.55, 0.5, 0.5, fur))
  for (const s of [-1, 1]) {
    const ear = voxel(0.12, 0.55, 0.1, fur)
    ear.position.set(s * 0.16, 0.55, 0)
    const inner = voxel(0.05, 0.4, 0.06, '#f8c8c8')
    inner.position.set(s * 0.16, 0.52, 0.04)
    head.add(ear, inner)
  }
  head.add(pos(voxel(0.3, 0.18, 0.22, shade(fur, -15)), 0, -0.1, 0.32))
  head.add(pos(voxel(0.1, 0.08, 0.08, '#1a1a1a'), 0, -0.05, 0.46))
  for (const s of [-1, 1]) {
    head.add(pos(voxel(0.1, 0.1, 0.04, '#fff'), s * 0.14, 0.08, 0.28))
    head.add(pos(voxel(0.05, 0.05, 0.04, '#1a1a1a'), s * 0.14, 0.08, 0.3))
  }
}

function addBirdHead(head: THREE.Group, fur: string, accent: string) {
  head.add(voxel(0.42, 0.4, 0.4, fur))
  // Crest
  head.add(pos(voxel(0.12, 0.22, 0.1, accent), 0, 0.28, 0))
  // Beak
  head.add(pos(voxel(0.14, 0.1, 0.28, '#f0b429'), 0, -0.02, 0.32))
  for (const s of [-1, 1]) {
    head.add(pos(voxel(0.1, 0.1, 0.04, '#fff'), s * 0.12, 0.08, 0.22))
    head.add(pos(voxel(0.05, 0.05, 0.04, '#1a1a1a'), s * 0.12, 0.08, 0.24))
  }
}

function addSnakeHead(head: THREE.Group, fur: string) {
  head.add(voxel(0.36, 0.28, 0.45, fur))
  head.add(pos(voxel(0.2, 0.12, 0.2, shade(fur, -25)), 0, -0.02, 0.28))
  for (const s of [-1, 1]) {
    head.add(pos(voxel(0.1, 0.08, 0.04, '#f5e6a0'), s * 0.12, 0.06, 0.2))
    head.add(pos(voxel(0.04, 0.08, 0.04, '#1a1a1a'), s * 0.12, 0.06, 0.22))
  }
  // Tongue
  head.add(pos(voxel(0.04, 0.04, 0.16, '#e05050'), 0, -0.08, 0.4))
}

function addDragonHead(head: THREE.Group, fur: string, accent: string) {
  head.add(voxel(0.55, 0.48, 0.55, fur))
  for (const s of [-1, 1]) {
    const horn = voxel(0.1, 0.35, 0.1, accent)
    horn.position.set(s * 0.2, 0.4, -0.05)
    horn.rotation.z = s * 0.2
    head.add(horn)
  }
  head.add(pos(voxel(0.35, 0.22, 0.4, shade(fur, -20)), 0, -0.05, 0.35))
  head.add(pos(voxel(0.1, 0.08, 0.1, '#1a1a1a'), -0.08, 0.02, 0.55))
  head.add(pos(voxel(0.1, 0.08, 0.1, '#1a1a1a'), 0.08, 0.02, 0.55))
  for (const s of [-1, 1]) {
    head.add(pos(voxel(0.12, 0.1, 0.04, '#7cf5ff'), s * 0.16, 0.1, 0.3))
    head.add(pos(voxel(0.06, 0.08, 0.04, '#0a1a2a'), s * 0.16, 0.1, 0.32))
  }
}

function pos(mesh: THREE.Mesh, x: number, y: number, z: number) {
  mesh.position.set(x, y, z)
  return mesh
}

function addHairBlocks(head: THREE.Group, look: CharacterLook) {
  const c = look.hairColor
  const female = look.species === 'female'
  const top = voxel(0.74, 0.16, 0.74, c)
  top.position.set(0, 0.4, 0)
  head.add(top)
  if (female) {
    const bang = voxel(0.72, 0.14, 0.16, c)
    bang.position.set(0, 0.28, 0.38)
    head.add(bang)
    const fringe = voxel(0.5, 0.1, 0.12, c)
    fringe.position.set(0, 0.18, 0.4)
    head.add(fringe)
    for (const s of [-1, 1]) {
      const side = voxel(0.16, 1.0, 0.28, c)
      side.position.set(s * 0.42, -0.1, 0.05)
      head.add(side)
    }
    const back = voxel(0.72, 0.9, 0.18, c)
    back.position.set(0, -0.08, -0.42)
    head.add(back)
    const fall = voxel(0.68, 0.55, 0.2, c)
    fall.position.set(0, -0.45, -0.35)
    head.add(fall)
    return
  }
  const fringe = voxel(0.74, 0.14, 0.12, c)
  fringe.position.set(0, 0.28, 0.34)
  head.add(fringe)
  const sides = voxel(0.76, 0.22, 0.7, c)
  sides.position.set(0, 0.28, -0.02)
  head.add(sides)
}

function makeNameSprite(name: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 256, 64)
  ctx.fillStyle = 'rgba(15,23,42,0.8)'
  ctx.fillRect(28, 18, 200, 28)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.strokeRect(28.5, 18.5, 199, 27)
  ctx.fillStyle = '#fff'
  ctx.font = '600 20px Karla, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name.slice(0, 18), 128, 33)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  const sprMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(sprMat)
  sprite.scale.set(1.4, 0.35, 1)
  return sprite
}

function labelYFor(kind: AnimalKind | null, gait: Gait) {
  if (gait === 'human') return 2.4
  if (kind === 'dragon') return 2.35
  if (kind === 'yoda') return 1.45
  return 1.85
}

function shade(hexColor: string, amount: number) {
  const n = hexColor.replace('#', '')
  const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
