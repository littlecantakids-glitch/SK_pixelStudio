import { Square as SquareIcon } from 'lucide-react'
import { useEditorDispatch } from '../state'
import type { BlendMode, Layer, StrokeAlign } from '../types'
import { resizeShapePath } from '../engine/shapeEngine'

const BLEND_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: '표준' },
  { value: 'multiply', label: '곱하기' },
  { value: 'screen', label: '스크린' },
  { value: 'overlay', label: '오버레이' },
  { value: 'darken', label: '어둡게 하기' },
  { value: 'lighten', label: '밝게 하기' },
]

/**
 * Shape Layer 속성 패널 — Photoshop 처럼 Shape 선택 시 Properties 가 자동으로 이 뷰로 바뀐다.
 * Fill / Stroke / Stroke Width / Stroke Align / Opacity / Blend Mode / W·H / Position.
 * 모든 변경은 UPDATE_SHAPE / SET_LAYER_* 로 History 에 기록된다.
 */
export function ShapeProperties({ layer }: { layer: Layer }) {
  const dispatch = useEditorDispatch()
  const shape = layer.shape
  if (!shape) return null

  const patch = (p: Partial<Layer>, label: string) =>
    dispatch({ type: 'UPDATE_SHAPE', id: layer.id, patch: p, label })

  const setFillColor = (c: string) =>
    patch({ shape: { ...shape, fill: { ...shape.fill, color: c, enabled: true } } }, '칠 변경')
  const toggleFill = () =>
    patch({ shape: { ...shape, fill: { ...shape.fill, enabled: !shape.fill.enabled } } }, '칠 변경')
  const setStrokeColor = (c: string) =>
    patch({ shape: { ...shape, stroke: { ...shape.stroke, color: c, enabled: true } } }, '획 변경')
  const toggleStroke = () =>
    patch({ shape: { ...shape, stroke: { ...shape.stroke, enabled: !shape.stroke.enabled } } }, '획 변경')
  const setStrokeWidth = (w: number) =>
    patch({ shape: { ...shape, stroke: { ...shape.stroke, width: Math.max(0, w) } } }, '획 두께 변경')
  const setStrokeAlign = (a: StrokeAlign) =>
    patch({ shape: { ...shape, stroke: { ...shape.stroke, align: a } } }, '획 위치 변경')

  const resize = (w: number, h: number) => {
    const nw = Math.max(1, w)
    const nh = Math.max(1, h)
    patch(
      { width: nw, height: nh, shape: { ...shape, path: resizeShapePath(shape, layer.width, layer.height, nw, nh) } },
      '크기 변경',
    )
  }

  return (
    <div className="props">
      <div className="props__header">
        <SquareIcon size={13} />
        <span>모양 ({layer.name})</span>
      </div>

      <div className="props__section">
        <div className="props__section-title">▾ 모양</div>

        <div className="shape-props__row">
          <span className="shape-props__label">칠</span>
          <button
            type="button"
            className={`shapebar__swatch${shape.fill.enabled ? '' : ' shapebar__swatch--off'}`}
            title={shape.fill.enabled ? '칠 사용 안 함' : '칠 사용'}
            onClick={toggleFill}
            style={{ background: shape.fill.enabled ? shape.fill.color : undefined }}
          />
          <input type="color" className="shapebar__color-input" value={shape.fill.color} onChange={(e) => setFillColor(e.target.value)} />
        </div>

        <div className="shape-props__row">
          <span className="shape-props__label">획</span>
          <button
            type="button"
            className={`shapebar__swatch${shape.stroke.enabled ? '' : ' shapebar__swatch--off'}`}
            title={shape.stroke.enabled ? '획 사용 안 함' : '획 사용'}
            onClick={toggleStroke}
            style={{ background: shape.stroke.enabled ? shape.stroke.color : undefined }}
          />
          <input type="color" className="shapebar__color-input" value={shape.stroke.color} onChange={(e) => setStrokeColor(e.target.value)} />
          <input
            className="props__input props__input--sm"
            type="number"
            min={0}
            value={shape.stroke.width}
            title="획 두께(px)"
            onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setStrokeWidth(e.target.valueAsNumber)}
          />
          <select
            className="props__input props__input--sm"
            value={shape.stroke.align}
            title="획 위치"
            onChange={(e) => setStrokeAlign(e.target.value as StrokeAlign)}
          >
            <option value="inside">안쪽</option>
            <option value="center">가운데</option>
            <option value="outside">바깥쪽</option>
          </select>
        </div>
      </div>

      <div className="props__section">
        <div className="props__section-title">▾ 변형</div>
        <div className="props__row">
          <label className="props__label">W</label>
          <div className="props__value">
            <input
              className="props__input"
              type="number"
              value={Math.round(layer.width)}
              onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && resize(e.target.valueAsNumber, layer.height)}
            />
            <span className="props__unit">픽셀</span>
          </div>
          <label className="props__label">X</label>
          <div className="props__value">
            <input
              className="props__input"
              type="number"
              value={Math.round(layer.x)}
              onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && patch({ x: e.target.valueAsNumber }, '위치 변경')}
            />
            <span className="props__unit">픽셀</span>
          </div>
        </div>
        <div className="props__row">
          <label className="props__label">H</label>
          <div className="props__value">
            <input
              className="props__input"
              type="number"
              value={Math.round(layer.height)}
              onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && resize(layer.width, e.target.valueAsNumber)}
            />
            <span className="props__unit">픽셀</span>
          </div>
          <label className="props__label">Y</label>
          <div className="props__value">
            <input
              className="props__input"
              type="number"
              value={Math.round(layer.y)}
              onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && patch({ y: e.target.valueAsNumber }, '위치 변경')}
            />
            <span className="props__unit">픽셀</span>
          </div>
        </div>
      </div>

      <div className="props__section">
        <div className="props__section-title">▾ 모양 속성</div>
        <div className="props__row">
          <label className="props__label props__label--wide">불투명도</label>
          <div className="props__value">
            <input
              className="props__input"
              type="number"
              min={0}
              max={100}
              value={layer.opacity}
              onChange={(e) =>
                !Number.isNaN(e.target.valueAsNumber) &&
                dispatch({ type: 'SET_LAYER_OPACITY', id: layer.id, opacity: Math.min(100, Math.max(0, e.target.valueAsNumber)) })
              }
            />
            <span className="props__unit">%</span>
          </div>
        </div>
        <div className="props__row">
          <label className="props__label props__label--wide">혼합 모드</label>
          <div className="props__value">
            <select
              className="props__input"
              value={layer.blendMode}
              onChange={(e) => dispatch({ type: 'SET_LAYER_BLEND', id: layer.id, blendMode: e.target.value as BlendMode })}
            >
              {BLEND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
