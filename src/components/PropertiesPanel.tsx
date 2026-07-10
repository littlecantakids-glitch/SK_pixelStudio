import { FileText, Link2 } from 'lucide-react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { AdjustmentProperties } from './AdjustmentProperties'
import { ShapeProperties } from './ShapeProperties'
import { SmartObjectProperties } from './SmartObjectProperties'
import type { RightPanelTab } from '../types'

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: 'properties', label: '속성' },
  { id: 'adjustments', label: '조정' },
  { id: 'libraries', label: '라이브러리' },
]

const FALLBACK = { width: 0, height: 0, resolution: 72 }

export function PropertiesPanel() {
  const { activeRightPanel } = useEditor()
  const doc = useActiveDocument()
  const canvas = doc ?? FALLBACK
  const dispatch = useEditorDispatch()
  const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId)
  const isAdjustment = activeLayer?.type === 'adjustment'
  const isShape = activeLayer?.type === 'shape' && !!activeLayer.shape
  const isSmart = activeLayer?.type === 'smartObject' && !!activeLayer.smartDocId

  return (
    <section className="panel panel--properties">
      <div className="panel__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`panel__tab${
              activeRightPanel === t.id ? ' panel__tab--active' : ''
            }`}
            onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel__body">
        {/* Adjustment Layer 선택 시 Properties Panel 자동 변경 (Photoshop) */}
        {activeRightPanel === 'properties' && isAdjustment && activeLayer && (
          <AdjustmentProperties layer={activeLayer} />
        )}

        {activeRightPanel === 'properties' && isShape && activeLayer && (
          <ShapeProperties layer={activeLayer} />
        )}

        {activeRightPanel === 'properties' && isSmart && activeLayer && (
          <SmartObjectProperties layer={activeLayer} />
        )}

        {activeRightPanel === 'properties' && !isAdjustment && !isShape && !isSmart && (
          <div className="props">
            <div className="props__header">
              <FileText size={13} />
              <span>문서</span>
            </div>

            <div className="props__section">
              <div className="props__section-title">▾ 캔버스</div>
              <div className="props__row">
                <label className="props__label">W</label>
                <div className="props__value">
                  <input className="props__input" defaultValue={canvas.width} />
                  <span className="props__unit">픽셀</span>
                </div>
                <label className="props__label">X</label>
                <div className="props__value">
                  <input className="props__input" defaultValue="0" />
                  <span className="props__unit">픽셀</span>
                </div>
              </div>
              <div className="props__row">
                <label className="props__label">H</label>
                <div className="props__value">
                  <input className="props__input" defaultValue={canvas.height} />
                  <span className="props__unit">픽셀</span>
                </div>
                <label className="props__label">Y</label>
                <div className="props__value">
                  <input className="props__input" defaultValue="0" />
                  <span className="props__unit">픽셀</span>
                </div>
              </div>
              <div className="props__row props__row--link">
                <button type="button" className="props__linkbtn" title="종횡비 고정">
                  <Link2 size={12} />
                </button>
              </div>
              <div className="props__row">
                <label className="props__label props__label--wide">해상도</label>
                <div className="props__value">
                  <input className="props__input" defaultValue={canvas.resolution} />
                  <span className="props__unit">픽셀/인치</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeRightPanel === 'adjustments' && (
          <div className="adjustments">
            <div className="adjustments__grid">
              {(
                [
                  ['명도/대비', 'brightnessContrast'],
                  ['레벨', 'levels'],
                  ['곡선', null],
                  ['노출', null],
                  ['활기', null],
                  ['색조/채도', 'hueSaturation'],
                  ['색상 균형', null],
                  ['흑백', null],
                  ['포토 필터', null],
                  ['반전', null],
                  ['분판', null],
                  ['한계값', null],
                ] as const
              ).map(([label, type]) => (
                <button
                  key={label}
                  type="button"
                  className={`adjustments__btn${type ? '' : ' adjustments__btn--stub'}`}
                  title={type ? `${label} 조정 레이어 추가` : `${label} (준비 중)`}
                  disabled={!type}
                  onClick={() => {
                    if (!type) return
                    dispatch({ type: 'ADD_ADJUSTMENT_LAYER', adjustment: type })
                    dispatch({ type: 'SET_RIGHT_PANEL', tab: 'properties' })
                  }}
                >
                  <span className="adjustments__dot" />
                </button>
              ))}
            </div>
          </div>
        )}

        {activeRightPanel === 'libraries' && (
          <div className="panel__empty panel__empty--pad">
            라이브러리가 비어 있습니다.
            <br />
            항목을 추가하려면 + 를 누르세요.
          </div>
        )}
      </div>
    </section>
  )
}
