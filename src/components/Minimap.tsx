import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { CampusScene } from '../world/CampusScene'
import type { WorldMap } from '../world/terrain'
import { MAP_H, MAP_W, TERRAIN_COLOR, TILE } from '../world/terrain'
import './Minimap.css'

const MM_W = 168
const MM_H = Math.round((MAP_H / MAP_W) * MM_W)

type Props = {
  map: WorldMap
  sceneRef: RefObject<CampusScene | null>
  playerRef: RefObject<{ x: number; y: number }>
  moveTargetRef: RefObject<{ x: number; y: number } | null>
}

export function Minimap({ map, sceneRef, playerRef, moveTargetRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ startTx: number; startTy: number; panX: number; panZ: number } | null>(
    null,
  )
  const terrainRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const off = document.createElement('canvas')
    off.width = MM_W
    off.height = MM_H
    const ctx = off.getContext('2d')
    if (!ctx) return
    const tw = MM_W / MAP_W
    const th = MM_H / MAP_H
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        ctx.fillStyle = TERRAIN_COLOR[map.tiles[ty][tx]]
        ctx.fillRect(tx * tw, ty * th, tw + 0.5, th + 0.5)
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    for (const r of map.rooms) {
      ctx.strokeRect(r.x * tw, r.y * th, r.w * tw, r.h * th)
    }
    terrainRef.current = off
  }, [map])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    const draw = () => {
      const ctx = canvas.getContext('2d')
      const scene = sceneRef.current
      const player = playerRef.current
      if (!ctx || !scene || !player) {
        raf = requestAnimationFrame(draw)
        return
      }
      const base = terrainRef.current
      if (base) ctx.drawImage(base, 0, 0)

      const view = scene.getViewExtents(player.x, player.y)
      const tw = MM_W / MAP_W
      const th = MM_H / MAP_H

      const vx = (view.focusTx - view.halfW) * tw
      const vy = (view.focusTz - view.halfH) * th
      const vw = view.halfW * 2 * tw
      const vh = view.halfH * 2 * th
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
      ctx.fillRect(vx, vy, vw, vh)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
      ctx.lineWidth = 2
      ctx.strokeRect(vx + 1, vy + 1, vw - 2, vh - 2)

      const target = moveTargetRef.current
      if (target) {
        ctx.fillStyle = '#fbbf24'
        ctx.beginPath()
        ctx.arc((target.x / TILE) * tw, (target.y / TILE) * th, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = '#4ade80'
      ctx.strokeStyle = '#14532d'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(view.playerTx * tw, view.playerTz * th, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [sceneRef, playerRef, moveTargetRef])

  const clientToTile = (clientX: number, clientY: number) => {
    const el = canvasRef.current!
    const rect = el.getBoundingClientRect()
    return {
      tx: ((clientX - rect.left) / rect.width) * MAP_W,
      ty: ((clientY - rect.top) / rect.height) * MAP_H,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const scene = sceneRef.current
    const player = playerRef.current
    if (!scene || !player) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    const { tx, ty } = clientToTile(e.clientX, e.clientY)
    const view = scene.getViewExtents(player.x, player.y)
    const inView =
      tx >= view.focusTx - view.halfW &&
      tx <= view.focusTx + view.halfW &&
      ty >= view.focusTz - view.halfH &&
      ty <= view.focusTz + view.halfH
    if (inView) {
      const pan = scene.getCameraPan()
      dragRef.current = { startTx: tx, startTy: ty, panX: pan.x, panZ: pan.z }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    const scene = sceneRef.current
    const player = playerRef.current
    if (!drag || !scene || !player) return
    const { tx, ty } = clientToTile(e.clientX, e.clientY)
    scene.setCameraPan(
      drag.panX + (tx - drag.startTx),
      drag.panZ + (ty - drag.startTy),
      player.x,
      player.y,
    )
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div className="minimap" title="ลากกรอบขาวเพื่อเลื่อนมุมมอง">
      <canvas
        ref={canvasRef}
        width={MM_W}
        height={MM_H}
        className="minimap__canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  )
}
