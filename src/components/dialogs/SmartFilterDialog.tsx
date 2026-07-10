import { useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { useActiveDocument } from '../../state'
import { useLayers } from '../../hooks/useLayers'
import { SMART_FILTER_META } from '../../engine/smartFilterEngine'

/**
 * Smart Filter 편집 대화상자 — 실시간 Preview.
 * 슬라이더 변경은 label 없이(History 미기록) 실시간 반영, OK 시 1개 History 로 커밋, Cancel 시 원복.
 */
export function SmartFilterDialog({
  layerId,
  filterId,
  onClose,
}: {
  layerId: string
  filterId: string
  onClose: () => void
}) {
  const doc = useActiveDocument()
  const { setSmartFilter } = useLayers()
  const layer = doc?.layers.find((l) => l.id === layerId)
  const filter = layer?.smartFilters?.find((f) => f.id === filterId)
  const original = useRef<Record<string, number> | null>(filter ? { ...filter.parameters } : null)

  if (!filter) return null
  const meta = SMART_FILTER_META[filter.type]

  const setParam = (key: string, v: number, commit = false) =>
    setSmartFilter(
      layerId,
      filterId,
      { parameters: { ...filter.parameters, [key]: v } },
      commit ? '스마트 필터 편집' : undefined,
    )

  const reset = () => {
    const zeroed: Record<string, number> = {}
    for (const p of meta.params) zeroed[p.key] = p.key === 'radius' ? 5 : 0
    setSmartFilter(layerId, filterId, { parameters: zeroed })
  }

  return (
    <div className="warp-modal__backdrop" onMouseDown={onClose}>
      <div className="warp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="warp-modal__title">{meta.label}</div>
        <div className="warp-modal__body">
          {meta.params.length === 0 && (
            <div style={{ color: '#9a9a9a', fontSize: 12 }}>이 필터는 조정 옵션이 없습니다 (구조 준비).</div>
          )}
          {meta.params.map((p) =>
            p.kind === 'toggle' ? (
              <label key={p.key} className="warp-modal__row">
                <span>{p.label}</span>
                <input
                  type="checkbox"
                  checked={(filter.parameters[p.key] ?? 0) > 0}
                  onChange={(e) => setParam(p.key, e.target.checked ? 1 : 0)}
                />
              </label>
            ) : (
              <label key={p.key} className="warp-modal__slider">
                <span>{p.label}</span>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={filter.parameters[p.key] ?? 0}
                  onChange={(e) => setParam(p.key, e.target.valueAsNumber)}
                />
                <input
                  type="number"
                  className="warp-modal__num"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={filter.parameters[p.key] ?? 0}
                  onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setParam(p.key, e.target.valueAsNumber)}
                />
                {p.unit && <b>{p.unit}</b>}
              </label>
            ),
          )}
        </div>
        <div className="warp-modal__actions">
          <button type="button" className="warp-modal__btn" title="재설정" onClick={reset}>
            <RotateCcw size={13} />
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="warp-modal__btn"
            onClick={() => {
              if (original.current) setSmartFilter(layerId, filterId, { parameters: original.current })
              onClose()
            }}
          >
            취소
          </button>
          <button
            type="button"
            className="warp-modal__btn warp-modal__btn--primary"
            onClick={() => {
              setSmartFilter(layerId, filterId, { parameters: filter.parameters }, '스마트 필터 편집')
              onClose()
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
