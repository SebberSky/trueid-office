import { useEffect, useRef } from 'react'
import { useAppStore } from '../store'
import {
  CLOTH_COLORS,
  FUR_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  drawCharacter,
} from '../character/drawCharacter'
import type { BottomStyle, Species, TopStyle } from '../types'
import { ANIMAL_KIND_LABELS, ANIMAL_KINDS } from '../types'
import './Creator.css'

export function CharacterCreator() {
  const draft = useAppStore((s) => s.draftLook)
  const setDraft = useAppStore((s) => s.setDraftLook)
  const save = useAppStore((s) => s.saveCharacter)
  const logout = useAppStore((s) => s.logout)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    let raf = 0
    const tick = () => {
      frame++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const bob = Math.sin(frame / 18) * 2
      drawCharacter(ctx, draft, canvas.width / 2, canvas.height / 2 + 20, 'down', 3.2, bob)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [draft])

  return (
    <div className="creator">
      <header className="creator__header">
        <div>
          <p className="creator__eyebrow">สร้างตัวละคร</p>
          <h1>ออกแบบตัวตนใน Office</h1>
        </div>
        <button type="button" className="ghost" onClick={logout}>
          ออกจากระบบ
        </button>
      </header>

      <div className="creator__body">
        <section className="creator__preview">
          <canvas ref={canvasRef} width={280} height={320} />
          <p className="creator__preview-label">{draft.displayName || 'ชื่อเล่น'}</p>
        </section>

        <section className="creator__panel">
          <label>
            ชื่อที่แสดง
            <input
              value={draft.displayName}
              onChange={(e) => setDraft({ displayName: e.target.value })}
              maxLength={10}
              placeholder="ชื่อเล่น (สูงสุด 10 ตัว)"
            />
          </label>

          <fieldset>
            <legend>ประเภทตัวละคร</legend>
            <div className="chip-row">
              {(
                [
                  ['male', 'ชาย'],
                  ['female', 'หญิง'],
                  ['animal', 'ตัวละครพิเศษ'],
                ] as [Species, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={draft.species === v ? 'chip on' : 'chip'}
                  onClick={() => {
                    if (v === 'female') {
                      setDraft({
                        species: v,
                        hairStyle: 'long',
                        bottomStyle: draft.bottomStyle === 'pants' ? 'skirt' : draft.bottomStyle,
                      })
                    } else if (v === 'male') {
                      setDraft({ species: v, hairStyle: 'short' })
                    } else {
                      setDraft({ species: v })
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {draft.species === 'animal' && (
            <fieldset>
              <legend>ชนิดตัวละคร (ท่าเดินไม่ซ้ำกัน)</legend>
              <div className="chip-row">
                {ANIMAL_KINDS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={draft.animalKind === v ? 'chip on' : 'chip'}
                    onClick={() => setDraft({ animalKind: v })}
                  >
                    {ANIMAL_KIND_LABELS[v]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {draft.species !== 'animal' && (
            <>
              <ColorRow
                label="สีผม"
                colors={HAIR_COLORS}
                value={draft.hairColor}
                onChange={(hairColor) => setDraft({ hairColor })}
              />
              <ColorRow
                label="สีผิว"
                colors={SKIN_TONES}
                value={draft.skinColor}
                onChange={(skinColor) => setDraft({ skinColor })}
              />
            </>
          )}

          {draft.species === 'animal' && (
            <ColorRow
              label="สีหลัก / ขน"
              colors={FUR_COLORS}
              value={draft.furColor}
              onChange={(furColor) => setDraft({ furColor })}
            />
          )}

          {draft.species !== 'animal' && (
            <>
              <fieldset>
                <legend>เสื้อ</legend>
                <div className="chip-row">
                  {(
                    [
                      ['tee', 'เสื้อยืด'],
                      ['shirt', 'เชิ้ต'],
                      ['hoodie', 'ฮู้ด'],
                      ['vest', 'กั๊ก'],
                    ] as [TopStyle, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={draft.topStyle === v ? 'chip on' : 'chip'}
                      onClick={() => setDraft({ topStyle: v })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <ColorRow
                label="สีเสื้อ"
                colors={CLOTH_COLORS}
                value={draft.topColor}
                onChange={(topColor) => setDraft({ topColor })}
              />

              <fieldset>
                <legend>กางเกง / กระโปรง</legend>
                <div className="chip-row">
                  {(
                    [
                      ['pants', 'กางเกง'],
                      ['shorts', 'ขาสั้น'],
                      ['skirt', 'กระโปรง'],
                    ] as [BottomStyle, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={draft.bottomStyle === v ? 'chip on' : 'chip'}
                      onClick={() => setDraft({ bottomStyle: v })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <ColorRow
                label="สีกางเกง"
                colors={CLOTH_COLORS}
                value={draft.bottomColor}
                onChange={(bottomColor) => setDraft({ bottomColor })}
              />
            </>
          )}

          <button type="button" className="creator__save" onClick={save}>
            เข้าสู่ Workspace
          </button>
        </section>
      </div>
    </div>
  )
}

function ColorRow({
  label,
  colors,
  value,
  onChange,
}: {
  label: string
  colors: string[]
  value: string
  onChange: (c: string) => void
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="swatch-row">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className={value === c ? 'swatch on' : 'swatch'}
            style={{ background: c }}
            aria-label={c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </fieldset>
  )
}
