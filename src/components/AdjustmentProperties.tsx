import { Contrast, Palette, BarChart3 } from 'lucide-react'
import { useLayers } from '../hooks/useLayers'
import { ADJUSTMENT_LABELS } from '../engine/adjustmentEngine'
import type { AdjustmentSettings, Layer } from '../types'

type SliderDef = {
  key: keyof AdjustmentSettings & string
  label: string
  min: number
  max: number
  step?: number
  historyLabel: string
}

const SLIDERS: Record<string, SliderDef[]> = {
  brightnessContrast: [
    { key: 'brightness', label: '명도', min: -150, max: 150, historyLabel: '명도 변경' },
    { key: 'contrast', label: '대비', min: -50, max: 100, historyLabel: '대비 변경' },
  ],
  hueSaturation: [
    { key: 'hue', label: '색조', min: -180, max: 180, historyLabel: '색조 변경' },
    { key: 'saturation', label: '채도', min: -100, max: 100, historyLabel: '채도 변경' },
    { key: 'lightness', label: '밝기', min: -100, max: 100, historyLabel: '밝기 변경' },
  ],
  levels: [
    { key: 'black', label: '어두운 영역', min: 0, max: 253, historyLabel: '레벨 변경' },
    { key: 'gamma', label: '중간 영역', min: 0.1, max: 9.99, step: 0.01, historyLabel: '레벨 변경' },
    { key: 'white', label: '밝은 영역', min: 2, max: 255, historyLabel: '레벨 변경' },
  ],
}

function AdjIcon({ layer }: { layer: Layer }) {
  const size = 13
  if (layer.adjustment === 'hueSaturation') return <Palette size={size} />
  if (layer.adjustment === 'levels') return <BarChart3 size={size} />
  return <Contrast size={size} />
}

/**
 * Adjustment Layer 선택 시 Properties Panel 내용.
 * Slider Drag = 실시간 Preview (History 미기록) → mouseup 시 History 1개 기록.
 */
export function AdjustmentProperties({ layer }: { layer: Layer }) {
  const { setAdjustmentSettings, commitAdjustment } = useLayers()
  const adj = layer.adjustment
  if (!adj) return null
  const defs = SLIDERS[adj]
  if (!defs) return null
  const settings = layer.adjustmentSettings ?? {}

  return (
    <div className="adjprops">
      <div className="props__header">
        <AdjIcon layer={layer} />
        <span>{ADJUSTMENT_LABELS[adj]}</span>
        <span className="adjprops__layername">{layer.name}</span>
      </div>

      <div className="adjprops__body">
        {defs.map((d) => {
          const value = settings[d.key] ?? 0
          const commit = () => commitAdjustment(d.historyLabel)
          return (
            <div key={d.key} className="adjprops__control">
              <div className="adjprops__row">
                <span className="adjprops__label">{d.label}:</span>
                <input
                  className="adjprops__num"
                  type="number"
                  min={d.min}
                  max={d.max}
                  step={d.step ?? 1}
                  value={value}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber
                    if (Number.isNaN(v)) return
                    setAdjustmentSettings(layer.id, {
                      [d.key]: Math.min(d.max, Math.max(d.min, v)),
                    })
                  }}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                  }}
                />
              </div>
              <input
                className="adjprops__slider"
                type="range"
                min={d.min}
                max={d.max}
                step={d.step ?? 1}
                value={value}
                onChange={(e) =>
                  setAdjustmentSettings(layer.id, { [d.key]: e.target.valueAsNumber })
                }
                onPointerUp={commit}
                onKeyUp={(e) => {
                  if (e.key.startsWith('Arrow')) commit()
                }}
              />
            </div>
          )
        })}

        <button
          type="button"
          className="adjprops__reset"
          onClick={() => {
            const reset: AdjustmentSettings = {}
            for (const d of defs) reset[d.key] = d.key === 'gamma' ? 1 : d.key === 'white' ? 255 : 0
            setAdjustmentSettings(layer.id, reset)
            commitAdjustment(`${ADJUSTMENT_LABELS[adj]} 재설정`)
          }}
        >
          기본값으로 재설정
        </button>
      </div>
    </div>
  )
}
