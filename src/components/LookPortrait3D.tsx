import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { NpcCharacter3D } from '../character/Character3D'
import type { CharacterLook } from '../types'

type Props = {
  look: CharacterLook
  className?: string
}

/** Small isolated WebGL bust of an NPC look for dialogue UI. */
export function LookPortrait3D({ look, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40)
    camera.position.set(0, 1.15, 3.1)
    camera.lookAt(0, 0.85, 0)

    scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x4a5568, 0.95))
    const key = new THREE.DirectionalLight(0xfff0d8, 1.2)
    key.position.set(2.2, 4.5, 3.5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x8eb6ff, 0.35)
    fill.position.set(-2.5, 2, -1.5)
    scene.add(fill)

    const avatar = new NpcCharacter3D(look)
    avatar.root.traverse((obj) => {
      if (obj instanceof THREE.Sprite) obj.visible = false
    })
    scene.add(avatar.root)

    let raf = 0
    let last = performance.now()
    let disposed = false

    const resize = () => {
      const w = canvas.clientWidth || 112
      const h = canvas.clientHeight || 112
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()

    const tick = (now: number) => {
      if (disposed) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      avatar.setPose(0, 0, 0, 'down', false, dt)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
      scene.remove(avatar.root)
      avatar.dispose()
      renderer.dispose()
    }
  }, [look])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      width={112}
      height={112}
    />
  )
}
