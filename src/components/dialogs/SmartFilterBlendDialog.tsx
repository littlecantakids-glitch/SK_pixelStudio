import { useRef } from 'react'
import { useActiveDocument } from '../../state'
import { useLayers } from '../../hooks/useLayers'
import { SMART_FILTER_META } from '../../engine/smartFilterEngine'
import type { BlendMode } from '../../types'

/** 실제 렌더에서 지원하는 Blend Mode (나머지는 구조 준비 — 비활성 표시) */
const ACTIVE_BLENDS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: '표준' },
  { value: 'multiply', label: '곱하기' },
  { value: 'screen', label: '스크린' },
  { value: 'overlay', label: '오버레이' },
  { value: 'darken', label: '어둡게 하기' },
  { value: 'lighten', label: '밝게 하기' },
]
const STUB_BLENDS = ['소프트 라이트', '하드 라이트', '차이', '색상 닷지', '색상 번']

/**
 * Smart Filter 혼합 옵션 — Blend Mode + Opacity.
 * 슬라이더/드롭다운은 실시간(무기록) 반영, OK 시 History 1개로 커밋, Cancel 시 원복.
 */
export function SmartFilterBlendDialog({
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
  const original = useRef<{ opacity: number; blendMode: BlendMode } | null>(
    filter ? { opacity: filter.opacity, blendMode: filter.blendMode } : null,
  )

  if (!filter) return null

  return (
    <div className="warp-modal__backdrop" onMouseDown={onClose}>
      <div className="warp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="warp-modal__title">혼합 옵션 — {SMART_FILTER_META[filter.type].label}</div>
        <div className="warp-modal__body">
          <label className="warp-modal__row">
            <span>혼합 모드</span>
            <select
              value={filter.blendMode}
              onChange={(e) => setSmartFilter(layerId, filterId, { blendMode: e.target.value as BlendMode })}
            >
              {ACTIVE_BLENDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
              {STUB_BLENDS.map((b) => (
                <option key={b} value={b} disabled>
                  {b} (준비 중)
                </option>
              ))}
            </select>
          </label>
          <label className="warp-modal__slider">
            <span>불투명도</span>
            <input
              type="range"
              min={0}
              max={100}
              value={filter.opacity}
              onChange={(e) => setSmartFilter(layerId, filterId, { opacity: e.target.valueAsNumber })}
            />
            <input
              type="number"
              className="warp-modal__num"
              min={0}
              max={100}
              value={filter.opacity}
              onChange={(e) =>
                !Number.isNaN(e.target.valueAsNumber) &&
                setSmartFilter(layerId, filterId, { opacity: Math.max(0, Math.min(100, e.target.valueAsNumber)) })
              }
            />
            <b>%</b>
          </label>
        </div>
        <div className="warp-modal__actions">
          <button
            type="button"
            className="warp-modal__btn"
            onClick={() => {
              if (original.current) setSmartFilter(layerId, filterId, original.current)
              onClose()
            }}
          >
            취소
          </button>
          <button
            type="button"
            className="warp-modal__btn warp-modal__btn--primary"
            onClick={() => {
              setSmartFilter(
                layerId,
                filterId,
                { opacity: filter.opacity, blendMode: filter.blendMode },
                '스마트 필터 혼합 옵션',
              )
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
