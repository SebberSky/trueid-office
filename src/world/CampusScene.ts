import * as THREE from 'three'
import type { WorldMap } from './terrain'
import { MAP_H, MAP_W, TILE, isWaterAt, roomAt, roomDoor, tileAt } from './terrain'
import { TERRAIN_HEIGHT, TERRAIN_HEX, surfaceY, toWorldXZ } from './heights'
import { Character3D } from '../character/Character3D'
import type { CharacterLook, Facing, PeerPresence, RoomDef } from '../types'
import { canFlyOverWater } from '../types'
import { FALLGUYS_ROOM_ID } from '../fallguys/types'

/** 1 = max zoom in (character). Min zoom stays mid-range — no full-map pullback. */
const ZOOM_DEFAULT = 0.42
const ZOOM_MIN = 0.28
const ROOM_WALL_H = 2.55
const ROOM_ROOF_Y = 2.68
/** Slightly faster than local walk (280) so remotes catch up after network delay. */
const PEER_CATCHUP = 340
/** Snap instead of sliding when the gap is clearly a teleport / first join. */
const PEER_SNAP_DIST = 200

type PeerMotion = {
  x: number
  y: number
  tx: number
  ty: number
  facing: Facing
  lastJumpAt: number
  lastFireAt: number
}

export class CampusScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private player: Character3D
  /** Bird or dragon — fly over water; camera ignores flap bob. */
  private playerCanFly = false
  private peers = new Map<string, Character3D>()
  private peerMotion = new Map<string, PeerMotion>()
  private waterMeshes: THREE.Mesh[] = []
  private waterMap: THREE.CanvasTexture | null = null
  private waterNormal: THREE.CanvasTexture | null = null
  private waterMat: THREE.MeshStandardMaterial | null = null
  private roofs = new Map<string, THREE.Group>()
  /** Wall + trim + door frame shells — sink / fade when local player is inside. */
  private roomWalls = new Map<string, THREE.Group>()
  /** Padlock sprites at room doors — visible when room is locked. */
  private doorLocks = new Map<string, THREE.Group>()
  private clock = 0
  /** South-side skyscrapers — faded when player is near the bottom map edge. */
  private citySouth = new THREE.Group()
  /** Smooth 0..1 hide amount for south skyline. */
  private citySouthHide = 0
  private lastCitySouthHideBucket = -1
  /** Smooth zoom target & current in [0, 1]. */
  private zoomTarget = ZOOM_DEFAULT
  private zoom = ZOOM_DEFAULT
  private lastLocalPos = { x: 0, y: 0, facing: 'down' as Facing }
  /** Smoothed camera look-at height (terrain-based — ignores bird flap / hover bob). */
  private camFocusY = 0
  private camFocusReady = false
  /** Camera look-at offset from the player (tile units). Set via minimap drag. */
  private camPanX = 0
  private camPanZ = 0
  private readonly headWorld = new THREE.Vector3()
  private readonly headNdc = new THREE.Vector3()
  private fishingGroup = new THREE.Group()
  private fishingBobber: THREE.Group | null = null
  private fishingLine: THREE.Line | null = null
  private fishingRipples: THREE.Mesh[] = []
  private fishingActive = false
  private fishingBobberPx = { x: 0, y: 0 }
  private fishingClock = 0
  /** 0 = just cast from hand, 1 = landed on water. */
  private fishingCastT = 1
  private fishingNibbleUntil = 0
  private readonly fishHand = new THREE.Vector3()
  private readonly fishBob = new THREE.Vector3()
  private readonly fishMid = new THREE.Vector3()
  private playerLabelName = ''

  constructor(canvas: HTMLCanvasElement, map: WorldMap, look: CharacterLook) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.15, 200)
    this.camera.position.set(0, 12, 14)

    this.scene.background = new THREE.Color(0x8eb8d8)
    this.scene.fog = new THREE.Fog(0xa8c8e0, 32, 90)

    // lights
    const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x7a6a48, 0.95)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.35)
    sun.position.set(MAP_W / 2 + 30, 55, MAP_H / 2 + 22)
    sun.target.position.set(MAP_W / 2, 0, MAP_H / 2)
    this.scene.add(sun.target)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 180
    sun.shadow.camera.left = -55
    sun.shadow.camera.right = 55
    sun.shadow.camera.top = 55
    sun.shadow.camera.bottom = -55
    // normalBias stops ground shadow acne / crawling shimmer when camera is close
    sun.shadow.bias = -0.0002
    sun.shadow.normalBias = 0.04
    this.scene.add(sun)

    const fill = new THREE.DirectionalLight(0x8eb6ff, 0.32)
    fill.position.set(-22, 12, -14)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0xffd4a8, 0.18)
    rim.position.set(10, 6, -30)
    this.scene.add(rim)

    this.buildTerrain(map)
    this.playerCanFly = canFlyOverWater(look)
    this.player = new Character3D(look)
    this.playerLabelName = (look.displayName || 'guest').slice(0, 10)
    this.scene.add(this.player.root)

    this.fishingGroup.visible = false
    this.fishingBobber = makeFishingBobber()
    this.fishingGroup.add(this.fishingBobber)

    // Sagging line (hand → mid → bobber)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ])
    this.fishingLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: 0xf1f5f9,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.fishingLine.renderOrder = 20
    this.fishingLine.frustumCulled = false
    this.fishingGroup.add(this.fishingLine)

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.18, 32),
        new THREE.MeshBasicMaterial({
          color: 0xdbeafe,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.visible = false
      ring.renderOrder = 19
      ring.frustumCulled = false
      this.fishingRipples.push(ring)
      this.fishingGroup.add(ring)
    }
    this.scene.add(this.fishingGroup)
  }

  private buildTerrain(map: WorldMap) {
    const ground = new THREE.Group()
    this.scene.add(ground)

    // Continuous underlay hides seams; sits below water so ponds stay blue
    const underlay = new THREE.Mesh(
      new THREE.BoxGeometry(MAP_W + 2, 0.2, MAP_H + 2),
      new THREE.MeshStandardMaterial({ color: 0x4a8f42, roughness: 1, depthWrite: true }),
    )
    underlay.position.set(MAP_W / 2, -0.55, MAP_H / 2)
    underlay.receiveShadow = true
    ground.add(underlay)

    const T = 1
    const grassA = 0x5cad4f
    const grassB = 0x4f9a45
    const grassC = 0x6bb85a
    const fallGuysPad = map.rooms.find((r) => r.id === FALLGUYS_ROOM_ID) ?? null

    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const type = map.tiles[ty][tx]
        const h = TERRAIN_HEIGHT[type]
        let color = TERRAIN_HEX[type]
        const n = (tx * 13 + ty * 7) % 17
        const inFallGuys =
          !!fallGuysPad &&
          tx >= fallGuysPad.x &&
          tx < fallGuysPad.x + fallGuysPad.w &&
          ty >= fallGuysPad.y &&
          ty < fallGuysPad.y + fallGuysPad.h

        if (inFallGuys && (type === 'plaza' || type === 'plazaBorder')) {
          // Solid pink pad — no yellow checker
          color = type === 'plazaBorder' ? 0xd946ef : 0xff4fd8
        } else if (type === 'grass') {
          color = n % 3 === 0 ? grassA : n % 3 === 1 ? grassB : grassC
        } else if (type === 'path' && n % 5 === 0) {
          color = 0xbba888
        } else if (type === 'plaza' && ((tx + ty) & 1) === 0) {
          color = 0xe2be5c
        }

        if (type === 'water') {
          if (!this.waterMat) {
            const { map: wMap, normal } = makeWaterTextures()
            this.waterMap = wMap
            this.waterNormal = normal
            this.waterMat = new THREE.MeshStandardMaterial({
              map: wMap,
              normalMap: normal,
              normalScale: new THREE.Vector2(0.45, 0.45),
              color: 0x7ad4ff,
              roughness: 0.28,
              metalness: 0.05,
              transparent: true,
              opacity: 0.88,
              depthWrite: false,
              emissive: new THREE.Color(0x3aa8e8),
              emissiveIntensity: 0.22,
            })
          }

          // Bright pond bed — kept light so water reads as sky-blue, not navy
          const bed = new THREE.Mesh(
            new THREE.BoxGeometry(T, 0.22, T),
            new THREE.MeshStandardMaterial({
              color: n % 3 === 0 ? 0x2a9fd4 : n % 3 === 1 ? 0x2490c8 : 0x1f8ab8,
              roughness: 0.85,
              metalness: 0,
            }),
          )
          bed.position.set(tx + 0.5, -0.48, ty + 0.5)
          bed.receiveShadow = true
          ground.add(bed)

          // Flat surface so ponds read as a continuous sheet, not stacked bricks
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(T * 1.02, T * 1.02), this.waterMat)
          mesh.rotation.x = -Math.PI / 2
          mesh.position.set(tx + 0.5, h + 0.02, ty + 0.5)
          // No receiveShadow — cast shadows turn the sheet navy under the sun
          mesh.receiveShadow = false
          // Stagger UVs so ripples don't tile as identical stamps
          const uvs = mesh.geometry.attributes.uv
          for (let i = 0; i < uvs.count; i++) {
            uvs.setXY(i, uvs.getX(i) * 0.55 + tx * 0.37, uvs.getY(i) * 0.55 + ty * 0.41)
          }
          uvs.needsUpdate = true
          ground.add(mesh)
          this.waterMeshes.push(mesh)

          // Soft foam along land edges
          const shore =
            tileAt(map, tx - 1, ty) !== 'water' ||
            tileAt(map, tx + 1, ty) !== 'water' ||
            tileAt(map, tx, ty - 1) !== 'water' ||
            tileAt(map, tx, ty + 1) !== 'water'
          if (shore) {
            const foam = new THREE.Mesh(
              new THREE.PlaneGeometry(T * 0.92, T * 0.92),
              new THREE.MeshStandardMaterial({
                color: 0xe8f7ff,
                transparent: true,
                opacity: 0.35,
                roughness: 0.55,
                depthWrite: false,
              }),
            )
            foam.rotation.x = -Math.PI / 2
            foam.position.set(tx + 0.5, h + 0.035, ty + 0.5)
            ground.add(foam)
          }

          // lily / foam accents
          if (n % 9 === 0) {
            const pad = new THREE.Mesh(
              new THREE.CylinderGeometry(0.16, 0.16, 0.04, 8),
              new THREE.MeshStandardMaterial({ color: 0x3d8f45, roughness: 0.85 }),
            )
            pad.position.set(tx + 0.35 + (n % 3) * 0.12, h + 0.12, ty + 0.4)
            ground.add(pad)
          }
          continue
        }

        const thickness = Math.max(0.12, Math.abs(h) + 0.15)
        const y = h / 2

        if (type === 'plant') {
          addGrassTile(ground, tx, ty, T)
          addTree(ground, tx + 0.5, ty + 0.5, 1 + (n % 3))
          continue
        }

        if (type === 'desk') {
          addDeskCluster(ground, tx, ty, T)
          continue
        }

        if (type === 'wall') {
          const inRoom = map.rooms.some(
            (r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h,
          )
          if (inRoom) continue
        }

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(T, thickness, T),
          new THREE.MeshStandardMaterial({
            color,
            roughness:
              type === 'path' || type === 'floor' || type === 'plaza' ? 0.72 : type === 'sand' ? 0.95 : 0.88,
            metalness: type === 'rock' ? 0.18 : 0.02,
          }),
        )
        mesh.position.set(tx + 0.5, y, ty + 0.5)
        mesh.castShadow = type === 'wall' || type === 'rock'
        mesh.receiveShadow = true
        ground.add(mesh)

        // --- Decorations (visual only, walkability unchanged) ---
        if (type === 'grass') {
          if (n % 7 === 0) addGrassTufts(ground, tx, ty, h)
          if (n % 19 === 0) addFlower(ground, tx + 0.35, h + 0.08, ty + 0.4, 0xf472b6)
          if (n % 23 === 0) addFlower(ground, tx + 0.65, h + 0.08, ty + 0.55, 0xfbbf24)
          if (n % 29 === 0) addBush(ground, tx + 0.5, ty + 0.5)
        }

        if (type === 'sand' && n % 8 === 0) {
          const pebble = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.08, 0.1),
            new THREE.MeshStandardMaterial({ color: 0xa89870, roughness: 0.9 }),
          )
          pebble.position.set(tx + 0.3 + (n % 4) * 0.1, h + 0.05, ty + 0.4)
          ground.add(pebble)
        }

        if (type === 'rock') {
          addRockCluster(ground, tx + 0.5, ty + 0.5, h)
        }

        if (type === 'path') {
          // cobble / edge stones
          if (n % 4 === 0) {
            const stone = new THREE.Mesh(
              new THREE.BoxGeometry(0.22, 0.06, 0.18),
              new THREE.MeshStandardMaterial({ color: 0x9a8b72, roughness: 0.8 }),
            )
            stone.position.set(tx + 0.25, h + 0.04, ty + 0.3)
            ground.add(stone)
          }
          // path lamps at intersections-ish
          if (tx % 12 === 4 && ty % 12 === 3) {
            addPathLamp(ground, tx + 0.5, ty + 0.5)
          }
        }

        if (type === 'plazaBorder' && n % 3 === 0 && !inFallGuys) {
          const bead = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.1, 0.18),
            new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6, metalness: 0.15 }),
          )
          bead.position.set(tx + 0.5, h + 0.08, ty + 0.5)
          ground.add(bead)
        }
      }
    }

    for (const room of map.rooms) {
      if (room.id === FALLGUYS_ROOM_ID) this.buildFallGuysPad(ground, room)
      else if (room.kind === 'plaza') this.buildPlazaShell(ground, room)
      else this.buildRoomShell(ground, room)
    }

    this.buildCityscape(ground)
  }

  /** Single ring of tall buildings just outside the playable map (lightweight). */
  private buildCityscape(ground: THREE.Group) {
    const pad = 8
    const city = new THREE.Group()
    ground.add(city)
    this.citySouth.clear()
    city.add(this.citySouth)

    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(MAP_W + pad * 2, 0.4, MAP_H + pad * 2),
      new THREE.MeshStandardMaterial({ color: 0x3a4555, roughness: 0.92 }),
    )
    apron.position.set(MAP_W / 2, -0.25, MAP_H / 2)
    apron.receiveShadow = true
    city.add(apron)

    const palette = [0x4b5568, 0x374151, 0x5b6b7c, 0x2f3a48, 0x6b7280, 0x455a6e]
    const glass = [0x88b4d8, 0x6a9fc4, 0xa8c8e0, 0x5a8aaa]

    const placeBuilding = (bx: number, bz: number, seed: number, parent: THREE.Group) => {
      if (bx > -1.2 && bx < MAP_W + 1.2 && bz > -1.2 && bz < MAP_H + 1.2) return

      const h = 4.5 + (seed % 14) * 0.75 + ((seed * 3) % 5) * 0.3
      const w = 1.5 + (seed % 4) * 0.4
      const d = 1.5 + ((seed * 7) % 4) * 0.35
      const tower = new THREE.Group()
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          color: palette[seed % palette.length],
          roughness: 0.75,
          metalness: 0.12,
          transparent: true,
          opacity: 1,
        }),
      )
      body.position.set(bx, h / 2, bz)
      body.castShadow = true
      body.receiveShadow = true
      tower.add(body)

      for (let f = 2; f < h - 1; f += 2.4) {
        if ((seed + Math.floor(f)) % 3 === 0) continue
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.9, 0.1, d * 0.9),
          new THREE.MeshStandardMaterial({
            color: glass[seed % glass.length],
            emissive: glass[seed % glass.length],
            emissiveIntensity: 0.16,
            roughness: 0.4,
            metalness: 0.35,
            transparent: true,
            opacity: 1,
          }),
        )
        band.position.set(bx, f, bz)
        tower.add(band)
      }
      parent.add(tower)
    }

    // First ring only — buildings along the four sides
    let i = 0
    const step = 2.6
    const ring = pad - 1.5
    for (let x = -ring; x <= MAP_W + ring; x += step) {
      placeBuilding(x, -ring, i++ * 31, city) // north — keep
      placeBuilding(x + 0.3, MAP_H + ring, i++ * 47, this.citySouth) // south — hide near edge
    }
    for (let z = -ring + step; z <= MAP_H + ring - step; z += step) {
      // Southern half of E/W towers also blocks the SE camera near the bottom edge
      const parent = z > MAP_H - 8 ? this.citySouth : city
      placeBuilding(-ring, z, i++ * 53, parent)
      placeBuilding(MAP_W + ring, z + 0.2, i++ * 59, parent)
    }
  }

  /** Minimal solid pad for Fall Guys — no stage / benches / plaza props. */
  private buildFallGuysPad(ground: THREE.Group, room: RoomDef) {
    const cx = room.x + room.w / 2
    const cz = room.y + room.h / 2
    const plazaH = TERRAIN_HEIGHT.plaza
    const tileThick = Math.max(0.12, Math.abs(plazaH) + 0.15)
    const floorTop = plazaH / 2 + tileThick / 2
    const plate = makeFloorPlate(room.name, room.color, Math.min(6.5, room.w - 1.5), 1.35)
    plate.position.set(cx, floorTop + 0.04, cz)
    ground.add(plate)
  }

  private buildPlazaShell(ground: THREE.Group, room: RoomDef) {
    const accent = new THREE.Color(room.color)
    const postMat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.5,
      metalness: 0.12,
    })
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.75 })
    const cx = room.x + room.w / 2
    const cz = room.y + room.h / 2

    const posts: [number, number][] = [
      [room.x + 0.5, room.y + 0.5],
      [room.x + room.w - 0.5, room.y + 0.5],
      [room.x + 0.5, room.y + room.h - 0.5],
      [room.x + room.w - 0.5, room.y + room.h - 0.5],
      [room.x + room.w / 2, room.y + 0.5],
      [room.x + room.w / 2, room.y + room.h - 0.5],
      [room.x + 0.5, room.y + room.h / 2],
      [room.x + room.w - 0.5, room.y + room.h / 2],
    ]
    for (const [px, pz] of posts) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.35, 0.3), postMat)
      post.position.set(px, 0.68, pz)
      post.castShadow = true
      ground.add(post)
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshStandardMaterial({
          color: 0xfff1c1,
          emissive: 0xffaa33,
          emissiveIntensity: 0.75,
        }),
      )
      lamp.position.set(px, 1.45, pz)
      ground.add(lamp)
      // string-light blob toward center
      const wire = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0xffe08a,
          emissive: 0xffcc66,
          emissiveIntensity: 0.5,
        }),
      )
      wire.position.set((px + cx) / 2, 1.55, (pz + cz) / 2)
      ground.add(wire)
    }

    // Stage platform (north side of plaza)
    const stage = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(8, room.w - 4), 0.28, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x7c5a2e, roughness: 0.7 }),
    )
    stage.position.set(cx, 0.28, room.y + 2.2)
    stage.castShadow = true
    stage.receiveShadow = true
    ground.add(stage)
    const stageTrim = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(8.2, room.w - 3.6), 0.08, 0.2),
      postMat,
    )
    stageTrim.position.set(cx, 0.42, room.y + 3.75)
    ground.add(stageTrim)

    // Benches facing center
    addBench(ground, cx - 4.5, cz + 2.5, woodMat, 0)
    addBench(ground, cx + 4.5, cz + 2.5, woodMat, 0)
    addBench(ground, cx - 4.5, cz - 2.8, woodMat, Math.PI)
    addBench(ground, cx + 4.5, cz - 2.8, woodMat, Math.PI)

    // Planters
    addPlanter(ground, room.x + 2.5, room.y + room.h - 2.5, accent)
    addPlanter(ground, room.x + room.w - 2.5, room.y + room.h - 2.5, accent)
    addPlanter(ground, room.x + 2.5, room.y + 4.5, accent)
    addPlanter(ground, room.x + room.w - 2.5, room.y + 4.5, accent)

    // Name plate center
    const plazaH = TERRAIN_HEIGHT.plaza
    const tileThick = Math.max(0.12, Math.abs(plazaH) + 0.15)
    const floorTop = plazaH / 2 + tileThick / 2
    const plate = makeFloorPlate(`${room.name} · ไม่จำกัด`, room.color, 7.5, 1.6)
    plate.position.set(cx, floorTop + 0.04, cz + 1.2)
    ground.add(plate)
  }

  private buildRoomShell(ground: THREE.Group, room: RoomDef) {
    const door = roomDoor(room)
    const accent = new THREE.Color(room.color)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 0.96,
      depthWrite: true,
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.55,
      metalness: 0.1,
      transparent: true,
      opacity: 0.96,
      depthWrite: true,
    })

    const wallGroup = new THREE.Group()

    const addWall = (x: number, z: number, w: number, d: number) => {
      if (w < 0.35 || d < 0.35) return
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, ROOM_WALL_H, d), wallMat)
      panel.position.set(x, ROOM_WALL_H / 2, z)
      panel.castShadow = true
      panel.receiveShadow = true
      wallGroup.add(panel)
      const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), trimMat)
      band.position.set(x, ROOM_WALL_H - 0.2, z)
      wallGroup.add(band)
    }

    const thick = 0.85
    const rx = room.x
    const ry = room.y
    const rw = room.w
    const rh = room.h

    // Build each facade; split the door wall into two segments
    if (room.door === 'n') {
      const leftW = door.doorX - rx
      const rightW = rx + rw - 1 - door.doorX2
      addWall(rx + leftW / 2, ry + 0.5, leftW - 0.05, thick)
      addWall(door.doorX2 + 1 + rightW / 2, ry + 0.5, rightW - 0.05, thick)
    } else {
      addWall(rx + rw / 2, ry + 0.5, rw - 0.05, thick)
    }

    if (room.door === 's') {
      const leftW = door.doorX - rx
      const rightW = rx + rw - 1 - door.doorX2
      const z = ry + rh - 0.5
      addWall(rx + leftW / 2, z, leftW - 0.05, thick)
      addWall(door.doorX2 + 1 + rightW / 2, z, rightW - 0.05, thick)
    } else {
      addWall(rx + rw / 2, ry + rh - 0.5, rw - 0.05, thick)
    }

    if (room.door === 'w') {
      const topH = door.doorY - ry
      const botH = ry + rh - 1 - door.doorY2
      addWall(rx + 0.5, ry + topH / 2, thick, topH - 0.05)
      addWall(rx + 0.5, door.doorY2 + 1 + botH / 2, thick, botH - 0.05)
    } else {
      addWall(rx + 0.5, ry + rh / 2, thick, rh - 0.05)
    }

    if (room.door === 'e') {
      const topH = door.doorY - ry
      const botH = ry + rh - 1 - door.doorY2
      const x = rx + rw - 0.5
      addWall(x, ry + topH / 2, thick, topH - 0.05)
      addWall(x, door.doorY2 + 1 + botH / 2, thick, botH - 0.05)
    } else {
      addWall(rx + rw - 0.5, ry + rh / 2, thick, rh - 0.05)
    }

    // Door frame
    const frameH = ROOM_WALL_H * 0.72
    let frameX = 0
    let frameZ = 0
    let lintelW = 2.3
    let lintelD = 0.28
    if (room.door === 's') {
      frameX = door.doorX + 1
      frameZ = door.doorY + 0.55
      wallGroup.add(framePost(door.doorX + 0.05, frameZ, frameH, trimMat))
      wallGroup.add(framePost(door.doorX2 + 0.95, frameZ, frameH, trimMat))
    } else if (room.door === 'n') {
      frameX = door.doorX + 1
      frameZ = door.doorY - 0.55
      wallGroup.add(framePost(door.doorX + 0.05, frameZ, frameH, trimMat))
      wallGroup.add(framePost(door.doorX2 + 0.95, frameZ, frameH, trimMat))
    } else if (room.door === 'e') {
      frameX = door.doorX + 0.55
      frameZ = door.doorY + 1
      lintelW = 0.28
      lintelD = 2.3
      wallGroup.add(framePost(frameX, door.doorY + 0.05, frameH, trimMat))
      wallGroup.add(framePost(frameX, door.doorY2 + 0.95, frameH, trimMat))
    } else {
      frameX = door.doorX - 0.55
      frameZ = door.doorY + 1
      lintelW = 0.28
      lintelD = 2.3
      wallGroup.add(framePost(frameX, door.doorY + 0.05, frameH, trimMat))
      wallGroup.add(framePost(frameX, door.doorY2 + 0.95, frameH, trimMat))
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lintelW, 0.22, lintelD), trimMat)
    lintel.position.set(frameX, frameH + 0.1, frameZ)
    wallGroup.add(lintel)

    const roofMat = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.55),
      roughness: 0.7,
      metalness: 0.08,
      transparent: true,
      opacity: 0.96,
      depthWrite: true,
    })
    const roofGroup = new THREE.Group()
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(room.w + 0.55, 0.16, room.h + 0.55),
      roofMat,
    )
    roof.position.set(room.x + room.w / 2, ROOM_ROOF_Y, room.y + room.h / 2)
    roof.castShadow = true
    roof.receiveShadow = true
    roofGroup.add(roof)

    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(room.w + 0.2, 0.1, 0.35),
      new THREE.MeshStandardMaterial({
        color: accent,
        roughness: 0.5,
        transparent: true,
        opacity: 0.96,
        depthWrite: true,
      }),
    )
    ridge.position.set(room.x + room.w / 2, ROOM_ROOF_Y + 0.12, room.y + room.h / 2)
    roofGroup.add(ridge)

    ground.add(roofGroup)
    this.roofs.set(room.id, roofGroup)

    // Name plate flush on the outer door wall (solid mesh, not a billboard)
    const signW = Math.min(3.2, Math.max(1.8, room.name.length * 0.28))
    const signH = 0.58
    const plate = makeWallPlate(room.name, room.color, signW, signH)

    const rightStart = door.doorX2 + 1
    const rightEnd = rx + rw
    const leftStart = rx
    const leftEnd = door.doorX
    let sx: number
    if (rightEnd - rightStart >= signW + 0.25) {
      sx = (rightStart + rightEnd) / 2
    } else if (leftEnd - leftStart >= signW + 0.25) {
      sx = (leftStart + leftEnd) / 2
    } else {
      sx = door.doorX + 1
    }

    if (room.door === 's') {
      plate.position.set(sx, 1.72, ry + rh - 0.5 + thick / 2 + 0.045)
    } else if (room.door === 'n') {
      plate.position.set(sx, 1.72, ry + 0.5 - thick / 2 - 0.045)
    } else if (room.door === 'e') {
      plate.rotation.y = Math.PI / 2
      plate.position.set(rx + rw - 0.5 + thick / 2 + 0.045, 1.72, door.doorY2 + 1.5)
    } else {
      plate.rotation.y = Math.PI / 2
      plate.position.set(rx + 0.5 - thick / 2 - 0.045, 1.72, door.doorY2 + 1.5)
    }
    wallGroup.add(plate)
    ground.add(wallGroup)
    this.roomWalls.set(room.id, wallGroup)

    // Padlock over the doorway (hidden until locked) — stays upright outside wall sink
    const lock = makeDoorPadlock()
    if (room.door === 's') {
      lock.position.set(door.doorX + 1, 1.35, door.doorY + 0.7)
    } else if (room.door === 'n') {
      lock.position.set(door.doorX + 1, 1.35, door.doorY - 0.7)
    } else if (room.door === 'e') {
      lock.rotation.y = Math.PI / 2
      lock.position.set(door.doorX + 0.7, 1.35, door.doorY + 1)
    } else {
      lock.rotation.y = Math.PI / 2
      lock.position.set(door.doorX - 0.7, 1.35, door.doorY + 1)
    }
    lock.visible = false
    ground.add(lock)
    this.doorLocks.set(room.id, lock)
  }

  /** Show / hide door padlocks for locked room ids. */
  setRoomLocks(lockedIds: Iterable<string>) {
    const set = lockedIds instanceof Set ? lockedIds : new Set(lockedIds)
    for (const [id, group] of this.doorLocks) {
      group.visible = set.has(id)
    }
  }

  setSize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  /** Positive delta = zoom in, negative = zoom out. */
  adjustZoom(delta: number) {
    this.zoomTarget = Math.min(1, Math.max(ZOOM_MIN, this.zoomTarget + delta))
  }

  getZoom() {
    return this.zoomTarget
  }

  getCameraPan() {
    return { x: this.camPanX, z: this.camPanZ }
  }

  /** Snap look-at back onto the player (minimap frame centers the avatar). */
  resetCameraPan() {
    this.camPanX = 0
    this.camPanZ = 0
  }

  /** Pan the camera look-at away from the player (tile units). */
  setCameraPan(panX: number, panZ: number, playerPx: number, playerPy: number) {
    let focusTx = playerPx / TILE + panX
    let focusTz = playerPy / TILE + panZ
    const margin = 3
    focusTx = Math.max(margin, Math.min(MAP_W - margin, focusTx))
    focusTz = Math.max(margin, Math.min(MAP_H - margin, focusTz))
    this.camPanX = focusTx - playerPx / TILE
    this.camPanZ = focusTz - playerPy / TILE
  }

  /** Visible ground area on the minimap (tile units). */
  getViewExtents(playerPx: number, playerPy: number) {
    const blend = Math.min(1, Math.max(0, (this.zoom - ZOOM_MIN) / (1 - ZOOM_MIN)))
    const halfW = 5.5 + (1 - blend) * 16
    const aspect = this.camera.aspect > 0 ? this.camera.aspect : 16 / 9
    const halfH = halfW / aspect
    return {
      focusTx: playerPx / TILE + this.camPanX,
      focusTz: playerPy / TILE + this.camPanZ,
      halfW,
      halfH,
      playerTx: playerPx / TILE,
      playerTz: playerPy / TILE,
    }
  }

  /** Visual hop for the local player (Space). */
  jump() {
    this.player.triggerJump()
  }

  /** Dragon fire breath (E) — VFX + burn anyone in the forward cone. */
  breathFire() {
    this.player.triggerFireBreath()
    this.applyFireCone(
      this.player,
      this.lastLocalPos.x,
      this.lastLocalPos.y,
      this.lastLocalPos.facing,
    )
  }

  /** Char avatars standing in front of a dragon's breath. */
  private applyFireCone(
    attacker: Character3D,
    ox: number,
    oy: number,
    facing: Facing,
  ) {
    const dir =
      facing === 'down'
        ? { x: 0, y: 1 }
        : facing === 'up'
          ? { x: 0, y: -1 }
          : facing === 'left'
            ? { x: -1, y: 0 }
            : { x: 1, y: 0 }
    const range = TILE * 3.2
    const halfWidth = TILE * 1.15

    const tryHit = (avatar: Character3D, x: number, y: number) => {
      if (avatar === attacker) return
      const dx = x - ox
      const dy = y - oy
      const along = dx * dir.x + dy * dir.y
      if (along < TILE * 0.35 || along > range) return
      const lat = Math.abs(dx * dir.y - dy * dir.x)
      if (lat > halfWidth) return
      avatar.applyBurn()
    }

    tryHit(this.player, this.lastLocalPos.x, this.lastLocalPos.y)
    for (const [id, motion] of this.peerMotion) {
      const avatar = this.peers.get(id)
      if (avatar) tryHit(avatar, motion.x, motion.y)
    }
  }

  setLocalMic(voiceOn: boolean) {
    this.player.setNameplate(this.playerLabelName, voiceOn)
  }

  /**
   * Project a character head to canvas UV (0–1, origin top-left).
   * `who === 'local'` uses the local player; otherwise a peer id.
   */
  projectHeadScreen(who: 'local' | string): { x: number; y: number } | null {
    const avatar = who === 'local' ? this.player : this.peers.get(who)
    if (!avatar) return null
    avatar.getHeadWorld(this.headWorld)
    this.headNdc.copy(this.headWorld).project(this.camera)
    if (this.headNdc.z > 1) return null
    return {
      x: (this.headNdc.x + 1) / 2,
      y: (-this.headNdc.y + 1) / 2,
    }
  }

  /** Show / hide the local fishing line + bobber toward a pond cast target (pixel coords). */
  setFishingCast(active: boolean, targetPx: { x: number; y: number } | null = null) {
    this.fishingActive = active && !!targetPx
    this.fishingGroup.visible = this.fishingActive
    if (targetPx) {
      this.fishingBobberPx = { x: targetPx.x, y: targetPx.y }
      this.fishingClock = 0
      this.fishingCastT = 0
      this.fishingNibbleUntil = 0
      for (const ring of this.fishingRipples) {
        ring.visible = false
        ;(ring.material as THREE.MeshBasicMaterial).opacity = 0
      }
    }
  }

  private updateFishingVisual(dt: number) {
    if (!this.fishingActive || !this.fishingBobber || !this.fishingLine) return
    this.fishingClock += dt
    this.fishingCastT = Math.min(1, this.fishingCastT + dt / 0.55)

    const target = toWorldXZ(this.fishingBobberPx.x, this.fishingBobberPx.y)
    const root = this.player.root.position
    // Cast from the water-facing side of the body (not character facing) so the
    // line is visible from any approach angle around the pond.
    const toX = target.x - root.x
    const toZ = target.z - root.z
    const toLen = Math.hypot(toX, toZ) || 1
    const nx = toX / toLen
    const nz = toZ / toLen

    const hand = this.fishHand
    hand.set(root.x + nx * 0.42, root.y + 1.05, root.z + nz * 0.42)

    const waterY = TERRAIN_HEIGHT.water + 0.06
    const cast = this.fishingCastT
    const ease = 1 - Math.pow(1 - cast, 2.4)

    // Arc from hand → splash landing
    const midX = hand.x + (target.x - hand.x) * ease
    const midZ = hand.z + (target.z - hand.z) * ease
    const arc = Math.sin(ease * Math.PI) * 1.35
    let bobY = hand.y + (waterY - hand.y) * ease + arc

    const landed = cast >= 1
    if (landed) {
      // Idle bob + occasional hard nibble so the wait reads clearly
      if (this.fishingClock > this.fishingNibbleUntil) {
        if (Math.random() < 0.012) this.fishingNibbleUntil = this.fishingClock + 0.55
      }
      const nibbling = this.fishingClock < this.fishingNibbleUntil
      if (nibbling) {
        const t = 1 - (this.fishingNibbleUntil - this.fishingClock) / 0.55
        bobY = waterY - 0.12 - Math.sin(t * Math.PI) * 0.22
        this.fishingBobber.rotation.z = Math.sin(this.fishingClock * 28) * 0.55
        this.fishingBobber.rotation.x = Math.cos(this.fishingClock * 22) * 0.35
      } else {
        bobY = waterY + Math.sin(this.fishingClock * 5.2) * 0.07
        this.fishingBobber.rotation.z = Math.sin(this.fishingClock * 2.4) * 0.12
        this.fishingBobber.rotation.x = Math.cos(this.fishingClock * 1.8) * 0.08
      }
    } else {
      this.fishingBobber.rotation.set(0.4, 0, ease * 1.2)
    }

    this.fishBob.set(midX, bobY, midZ)
    this.fishingBobber.position.copy(this.fishBob)
    this.fishingBobber.scale.setScalar(landed ? 1.15 : 0.85 + ease * 0.3)
    this.fishingBobber.frustumCulled = false

    // Line sag
    this.fishMid.set(
      (hand.x + this.fishBob.x) * 0.5,
      Math.min(hand.y, this.fishBob.y) - 0.25 - (1 - ease) * 0.1,
      (hand.z + this.fishBob.z) * 0.5,
    )
    const positions = this.fishingLine.geometry.attributes.position as THREE.BufferAttribute
    positions.setXYZ(0, hand.x, hand.y, hand.z)
    positions.setXYZ(1, this.fishMid.x, this.fishMid.y, this.fishMid.z)
    positions.setXYZ(2, this.fishBob.x, this.fishBob.y + 0.04, this.fishBob.z)
    positions.needsUpdate = true
    this.fishingLine.geometry.computeBoundingSphere()

    // Splash ripples after landing
    if (landed) {
      for (let i = 0; i < this.fishingRipples.length; i++) {
        const ring = this.fishingRipples[i]!
        const phase = (this.fishingClock * 0.85 + i * 0.45) % 1.35
        const u = phase / 1.35
        ring.visible = true
        ring.position.set(target.x, waterY + 0.02, target.z)
        const s = 0.55 + u * 2.8
        ring.scale.set(s, s, s)
        const mat = ring.material as THREE.MeshBasicMaterial
        mat.opacity = (1 - u) * 0.55
      }
    }
  }

  /** Preferred facing while casting toward a water tile (pixel coords). */
  static facingTowardWater(px: number, py: number, targetPx: number, targetPy: number): Facing {
    const dx = targetPx - px
    const dy = targetPy - py
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
    return dy < 0 ? 'up' : 'down'
  }

  syncPeers(peers: PeerPresence[], map: WorldMap, dt = 0) {
    const seen = new Set<string>()
    for (const p of peers) {
      seen.add(p.id)
      let avatar = this.peers.get(p.id)
      let motion = this.peerMotion.get(p.id)
      if (!avatar || !motion) {
        avatar = new Character3D(p.look)
        this.peers.set(p.id, avatar)
        this.scene.add(avatar.root)
        motion = {
          x: p.x,
          y: p.y,
          tx: p.x,
          ty: p.y,
          facing: p.facing,
          lastJumpAt: p.jumpAt ?? 0,
          lastFireAt: p.fireAt ?? 0,
        }
        this.peerMotion.set(p.id, motion)
      }

      avatar.setNameplate(p.look.displayName, !!p.voiceOn)

      motion.tx = p.x
      motion.ty = p.y
      motion.facing = p.facing
      if (p.jumpAt && p.jumpAt !== motion.lastJumpAt) {
        motion.lastJumpAt = p.jumpAt
        avatar.triggerJump()
      }
      if (p.fireAt && p.fireAt !== motion.lastFireAt) {
        motion.lastFireAt = p.fireAt
        avatar.triggerFireBreath()
        this.applyFireCone(avatar, motion.x, motion.y, motion.facing)
      }

      const dx = motion.tx - motion.x
      const dy = motion.ty - motion.y
      const dist = Math.hypot(dx, dy)
      if (dist > PEER_SNAP_DIST) {
        motion.x = motion.tx
        motion.y = motion.ty
      } else if (dist > 0.4) {
        const step = Math.min(dist, PEER_CATCHUP * dt)
        motion.x += (dx / dist) * step
        motion.y += (dy / dist) * step
      } else {
        motion.x = motion.tx
        motion.y = motion.ty
      }

      const moving = dist > 1.2
      const { x, z } = toWorldXZ(motion.x, motion.y)
      const y = surfaceY(map, motion.x, motion.y)
      const overWater =
        canFlyOverWater(p.look) && isWaterAt(map, motion.x, motion.y)
      avatar.setPose(x, z, y, motion.facing, moving, dt, overWater, !!p.crouching)
    }
    for (const [id, avatar] of this.peers) {
      if (!seen.has(id)) {
        this.scene.remove(avatar.root)
        avatar.dispose()
        this.peers.delete(id)
        this.peerMotion.delete(id)
      }
    }
  }

  render(
    map: WorldMap,
    px: number,
    py: number,
    facing: Facing,
    moving: boolean,
    dt: number,
    crouching = false,
  ) {
    this.clock += dt
    this.lastLocalPos = { x: px, y: py, facing }
    if (this.waterMap && this.waterNormal) {
      const drift = this.clock * 0.045
      this.waterMap.offset.set(drift * 0.7, Math.sin(this.clock * 0.35) * 0.08 + drift * 0.4)
      this.waterNormal.offset.set(drift * 0.55, -drift * 0.65)
    }
    for (const w of this.waterMeshes) {
      w.position.y = TERRAIN_HEIGHT.water + 0.02 + Math.sin(this.clock * 1.6 + w.position.x * 1.3 + w.position.z) * 0.018
    }

    const { x, z } = toWorldXZ(px, py)
    const y = surfaceY(map, px, py)
    const overWater = isWaterAt(map, px, py)
    this.player.setPose(x, z, y, facing, moving, dt, overWater, crouching)
    this.updateFishingVisual(dt)

    // Soften / sink roof + walls when inside so the character stays visible
    const inside = roomAt(map, px, py)
    for (const room of map.rooms) {
      const hide = inside?.id === room.id
      const roofGroup = this.roofs.get(room.id)
      if (roofGroup) {
        roofGroup.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          const mat = obj.material as THREE.MeshStandardMaterial
          if (!mat || !('opacity' in mat)) return
          mat.transparent = true
          mat.opacity = hide ? 0.08 : 0.96
          mat.depthWrite = !hide
        })
      }
      const wallGroup = this.roomWalls.get(room.id)
      if (wallGroup) {
        // Sink walls down (เว้าหลบ) + fade so they don't bury the avatar
        const target = hide ? 1 : 0
        const cur = (wallGroup.userData.hide as number) ?? 0
        const next = cur + (target - cur) * (1 - Math.exp(-10 * dt))
        wallGroup.userData.hide = next < 0.001 ? 0 : next
        wallGroup.scale.y = 1 - wallGroup.userData.hide * 0.88
        wallGroup.position.y = -wallGroup.userData.hide * (ROOM_WALL_H * 0.42)
        wallGroup.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          const mat = obj.material as THREE.MeshStandardMaterial
          if (!mat || !('opacity' in mat)) return
          mat.transparent = true
          mat.opacity = 0.96 - wallGroup.userData.hide * 0.88
          mat.depthWrite = wallGroup.userData.hide < 0.35
          obj.castShadow = wallGroup.userData.hide < 0.45
        })
      }
    }

    // Near south (bottom) edge: fade south skyline so camera/character aren't buried in towers
    const southDist = MAP_H - z
    const hideTarget = southDist < 14 ? 1 - Math.min(1, Math.max(0, southDist / 14)) : 0
    this.citySouthHide += (hideTarget - this.citySouthHide) * (1 - Math.exp(-6 * dt))
    if (this.citySouthHide < 0.001) this.citySouthHide = 0
    const hideBucket = Math.round(this.citySouthHide * 40)
    if (hideBucket !== this.lastCitySouthHideBucket) {
      this.lastCitySouthHideBucket = hideBucket
      const skyOpacity = 1 - this.citySouthHide * 0.92
      this.citySouth.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        const mat = obj.material as THREE.MeshStandardMaterial
        if (!mat || !('opacity' in mat)) return
        mat.transparent = true
        mat.opacity = skyOpacity
        mat.depthWrite = this.citySouthHide < 0.35
        obj.castShadow = this.citySouthHide < 0.5
      })
      this.citySouth.scale.y = 1 - this.citySouthHide * 0.85
    }

    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-8 * dt))
    if (Math.abs(this.zoomTarget - this.zoom) < 0.0003) this.zoom = this.zoomTarget
    const t = this.zoom

    // Fixed camera angle (does not rotate with character facing) —
    // south-east of the player so WASD stays screen-stable.
    const camDirX = 0.42
    const camDirZ = 1
    const camDirLen = Math.hypot(camDirX, camDirZ)

    // Follow-only camera — zoom out stays local (no full-map overview / sky gaps)
    const closeDist = 2.6
    const closeHeight = 2.05
    const farDist = 11
    const farHeight = 9.5
    const blend = Math.min(1, Math.max(0, (t - ZOOM_MIN) / (1 - ZOOM_MIN)))
    const followDist = farDist + (closeDist - farDist) * blend
    const followHeight = farHeight + (closeHeight - farHeight) * blend

    // Place camera at a rigid offset from the player every frame.
    // Bird flap / water-hover / jump bob stay on the avatar mesh — do not pump the lens.
    const desiredFocusY = this.playerCanFly ? y : y + this.player.airHeight()
    if (!this.camFocusReady) {
      this.camFocusY = desiredFocusY
      this.camFocusReady = true
    } else {
      this.camFocusY += (desiredFocusY - this.camFocusY) * (1 - Math.exp(-10 * dt))
    }
    const focusY = this.camFocusY
    const focusWx = x + this.camPanX
    const focusWz = z + this.camPanZ
    this.camera.position.set(
      focusWx + (camDirX / camDirLen) * followDist,
      focusY + followHeight,
      focusWz + (camDirZ / camDirLen) * followDist,
    )
    this.camera.lookAt(focusWx, focusY + 0.75 + blend * 0.35, focusWz)

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.player.dispose()
    for (const a of this.peers.values()) a.dispose()
    this.roofs.clear()
    this.roomWalls.clear()
    this.fishingLine?.geometry.dispose()
    ;(this.fishingLine?.material as THREE.Material | undefined)?.dispose()
    this.fishingBobber?.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.geometry.dispose()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    })
    for (const ring of this.fishingRipples) {
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
    }
    this.waterMat?.dispose()
    this.waterMap?.dispose()
    this.waterNormal?.dispose()
    this.renderer.dispose()
  }
}

export { TILE }

/** Bright cork bobber with red tip — reads clearly on blue water. */
function makeFishingBobber() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.45,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
    }),
  )
  body.castShadow = true
  g.add(body)
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.35,
      emissive: 0xdc2626,
      emissiveIntensity: 0.35,
    }),
  )
  tip.position.y = 0.14
  tip.castShadow = true
  g.add(tip)
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 }),
  )
  stem.position.y = 0.26
  g.add(stem)
  g.frustumCulled = false
  g.traverse((o) => {
    o.frustumCulled = false
  })
  return g
}

function addGrassTile(ground: THREE.Group, tx: number, ty: number, T: number) {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(T, 0.18, T),
    new THREE.MeshStandardMaterial({ color: TERRAIN_HEX.grass, roughness: 0.9 }),
  )
  base.position.set(tx + 0.5, 0.09, ty + 0.5)
  base.receiveShadow = true
  ground.add(base)
}

function addTree(ground: THREE.Group, x: number, z: number, variant: number) {
  const trunkH = 0.45 + variant * 0.12
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.09, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 }),
  )
  trunk.position.set(x, trunkH / 2 + 0.1, z)
  trunk.castShadow = true
  ground.add(trunk)

  const greens = [0x2d6b3a, 0x3d8f48, 0x245c30]
  for (let i = 0; i < 2 + (variant % 2); i++) {
    const r = 0.32 + i * 0.08 + variant * 0.04
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 8),
      new THREE.MeshStandardMaterial({ color: greens[i % 3], roughness: 0.82 }),
    )
    canopy.position.set(x + (i - 1) * 0.08, trunkH + 0.25 + i * 0.18, z + (i % 2) * 0.05)
    canopy.castShadow = true
    ground.add(canopy)
  }
}

function addGrassTufts(ground: THREE.Group, tx: number, ty: number, h: number) {
  for (let i = 0; i < 3; i++) {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.04 + i * 0.01, 0.14 + i * 0.03, 5),
      new THREE.MeshStandardMaterial({ color: 0x3d7a32, roughness: 1 }),
    )
    tuft.position.set(tx + 0.3 + i * 0.15, h + 0.07, ty + 0.35 + (i % 2) * 0.12)
    ground.add(tuft)
  }
}

function addFlower(ground: THREE.Group, x: number, y: number, z: number, color: number) {
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.12, 4),
    new THREE.MeshStandardMaterial({ color: 0x3d7a32 }),
  )
  stem.position.set(x, y + 0.06, z)
  ground.add(stem)
  const bloom = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
  )
  bloom.position.set(x, y + 0.14, z)
  ground.add(bloom)
}

function addBush(ground: THREE.Group, x: number, z: number) {
  for (let i = 0; i < 3; i++) {
    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + i * 0.04, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2f6b38, roughness: 0.9 }),
    )
    bush.position.set(x + (i - 1) * 0.12, 0.22, z + (i % 2) * 0.08)
    bush.castShadow = true
    ground.add(bush)
  }
}

function addRockCluster(ground: THREE.Group, x: number, z: number, h: number) {
  for (let i = 0; i < 3; i++) {
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(0.25 + i * 0.08, 0.2 + i * 0.1, 0.22 + i * 0.05),
      new THREE.MeshStandardMaterial({ color: 0x7a8088, roughness: 0.85, metalness: 0.12 }),
    )
    rock.position.set(x + (i - 1) * 0.15, h * 0.35 + i * 0.05, z + (i % 2) * 0.1)
    rock.rotation.y = i * 0.4
    rock.castShadow = true
    ground.add(rock)
  }
}

function addPathLamp(ground: THREE.Group, x: number, z: number) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.6, metalness: 0.3 }),
  )
  pole.position.set(x, 0.7, z)
  pole.castShadow = true
  ground.add(pole)
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.18, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0xfff4c8,
      emissive: 0xffc857,
      emissiveIntensity: 0.65,
    }),
  )
  lamp.position.set(x, 1.45, z)
  ground.add(lamp)
}

function addDeskCluster(ground: THREE.Group, tx: number, ty: number, T: number) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(T, 0.16, T),
    new THREE.MeshStandardMaterial({ color: TERRAIN_HEX.floor, roughness: 0.85 }),
  )
  floor.position.set(tx + 0.5, 0.08, ty + 0.5)
  floor.receiveShadow = true
  ground.add(floor)

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.08, 0.48),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.55 }),
  )
  top.position.set(tx + 0.5, 0.45, ty + 0.5)
  top.castShadow = true
  ground.add(top)

  const legL = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.35, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x5c4010 }),
  )
  const legR = legL.clone()
  legL.position.set(tx + 0.25, 0.25, ty + 0.35)
  legR.position.set(tx + 0.75, 0.25, ty + 0.65)
  ground.add(legL, legR)

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.24, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x9ad0ff,
      emissive: 0x224466,
      emissiveIntensity: 0.45,
    }),
  )
  screen.position.set(tx + 0.5, 0.64, ty + 0.32)
  ground.add(screen)

  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8),
    new THREE.MeshStandardMaterial({ color: 0xc8102e }),
  )
  mug.position.set(tx + 0.72, 0.54, ty + 0.58)
  ground.add(mug)
}

function addBench(
  ground: THREE.Group,
  x: number,
  z: number,
  mat: THREE.Material,
  rotY: number,
) {
  const g = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.4), mat)
  seat.position.y = 0.35
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.08), mat)
  back.position.set(0, 0.55, -0.16)
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), mat)
  const leg2 = leg1.clone()
  leg1.position.set(-0.55, 0.175, 0.1)
  leg2.position.set(0.55, 0.175, 0.1)
  g.add(seat, back, leg1, leg2)
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  ground.add(g)
}

function addPlanter(ground: THREE.Group, x: number, z: number, accent: THREE.Color) {
  const pot = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.35, 0.7),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.65 }),
  )
  pot.position.set(x, 0.2, z)
  pot.castShadow = true
  ground.add(pot)
  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.08, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x3d2914, roughness: 1 }),
  )
  soil.position.set(x, 0.4, z)
  ground.add(soil)
  addBush(ground, x, z)
}

function framePost(x: number, z: number, h: number, mat: THREE.Material) {
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.22), mat)
  post.position.set(x, h / 2, z)
  post.castShadow = true
  return post
}

/** Billboard padlock blocking the doorway when the room is locked. */
function makeDoorPadlock() {
  const group = new THREE.Group()

  // Semi-transparent door slab
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 2.1, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.72,
      roughness: 0.6,
      metalness: 0.15,
    }),
  )
  slab.position.y = 1.05
  group.add(slab)

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 256, 256)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
  ctx.fillRect(28, 28, 200, 200)
  ctx.font = '140px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🔒', 128, 138)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const icon = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.15),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  icon.position.set(0, 1.2, 0.08)
  group.add(icon)

  // Face camera-ish from both sides
  const iconBack = icon.clone()
  iconBack.rotation.y = Math.PI
  iconBack.position.z = -0.08
  group.add(iconBack)

  return group
}

/** Solid wall-mounted name plate (box mesh + canvas texture). */
function makeWallPlate(text: string, color: string, w: number, h: number) {
  const mat = makeSignMaterial(text, color)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), mat)
  plate.castShadow = true
  plate.receiveShadow = true
  return plate
}

/** Flat floor decal — lies on XZ, readable from above. */
function makeFloorPlate(text: string, color: string, w: number, d: number) {
  const mat = makeSignMaterial(text, color)
  // Thin slab: width X, thickness Y, depth Z — no rotation needed
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat)
  plate.castShadow = true
  plate.receiveShadow = true
  return plate
}

function makeSignMaterial(text: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1024, 256)
  // Dark inset so it reads on yellow plaza tiles
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(24, 24, 976, 208)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 10
  ctx.strokeRect(24, 24, 976, 208)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 72px Bricolage Grotesque, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 512, 132, 920)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.85,
    metalness: 0.05,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.15,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
}

/** Procedural pond maps — soft ripples + caustic mottling + tangent normals. */
function makeWaterTextures() {
  const size = 128
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size
      const ny = y / size
      const r1 = Math.sin(nx * Math.PI * 6.2 + ny * 2.1) * Math.cos(ny * Math.PI * 5.4)
      const r2 = Math.sin((nx + ny) * Math.PI * 9.5) * 0.55
      const r3 = Math.sin(nx * Math.PI * 14 - ny * Math.PI * 11) * 0.28
      height[y * size + x] = r1 + r2 + r3
    }
  }

  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = size
  colorCanvas.height = size
  const cctx = colorCanvas.getContext('2d')!
  const cimg = cctx.createImageData(size, size)

  const normalCanvas = document.createElement('canvas')
  normalCanvas.width = size
  normalCanvas.height = size
  const nctx = normalCanvas.getContext('2d')!
  const nimg = nctx.createImageData(size, size)

  const sample = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const h = sample(x, y)
      const t = (h + 2.2) / 4.4
      // Bright sky-blue → cyan highlights (avoid dark navy under outdoor light)
      const r = Math.round(90 + t * 90 + Math.max(0, h) * 35)
      const g = Math.round(180 + t * 55 + Math.max(0, h) * 25)
      const b = Math.round(220 + t * 30)
      cimg.data[i] = Math.min(255, r)
      cimg.data[i + 1] = Math.min(255, g)
      cimg.data[i + 2] = Math.min(255, b)
      cimg.data[i + 3] = 255

      const dx = sample(x + 1, y) - sample(x - 1, y)
      const dy = sample(x, y + 1) - sample(x, y - 1)
      const nx = -dx * 1.8
      const ny = -dy * 1.8
      const nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      nimg.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      nimg.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      nimg.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255)
      nimg.data[i + 3] = 255
    }
  }
  cctx.putImageData(cimg, 0, 0)
  nctx.putImageData(nimg, 0, 0)

  // Soft highlight rings on top of the color map
  cctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 47) % size) + 8
    const cy = ((i * 73) % size) + 8
    const rad = 10 + (i % 4) * 5
    const g = cctx.createRadialGradient(cx, cy, 1, cx, cy, rad)
    g.addColorStop(0, 'rgba(230, 250, 255, 0.45)')
    g.addColorStop(0.45, 'rgba(160, 220, 255, 0.18)')
    g.addColorStop(1, 'rgba(0, 0, 0, 0)')
    cctx.fillStyle = g
    cctx.beginPath()
    cctx.arc(cx, cy, rad, 0, Math.PI * 2)
    cctx.fill()
  }

  const map = new THREE.CanvasTexture(colorCanvas)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4

  const normal = new THREE.CanvasTexture(normalCanvas)
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping
  normal.anisotropy = 4

  return { map, normal }
}
