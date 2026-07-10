import { useEffect } from 'react'
import type { AdjustmentType } from '../../types'
import { ADJUSTMENT_LABELS, IMPLEMENTED_ADJUSTMENTS } from '../../engine/adjustmentEngine'

const MENU: AdjustmentType[] = [
  'brightnessContrast',
  'levels',
  'curves',
  'exposure',
  'vibrance',
  'hueSaturation',
  'colorBalance',
]

/**
 * Create New Fill or Adjustment Layer 메뉴 (Layer Panel 하단 ◐ 버튼).
 * 현재 명도/대비 · 레벨 · 색조/채도 만 실제 구현 — 나머지는 비활성.
 */
export function AdjustmentMenu({
  anchor,
  onSelect,
  onClose,
}: {
  anchor: DOMRect | null
  onSelect: (type: AdjustmentType) => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!anchor) return
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [anchor, onClose])

  if (!anchor) return null

  return (
    <div
      className="menu-dropdown layer-ctx adj-menu"
      style={{
        position: 'fixed',
        left: anchor.left,
        bottom: window.innerHeight - anchor.top + 4,
        minWidth: 170,
        zIndex: 1200,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {MENU.map((t) => {
        const enabled = IMPLEMENTED_ADJUSTMENTS.includes(t)
        return (
          <button
            key={t}
            className={`menu-dropdown__item${enabled ? '' : ' menu-dropdown__item--disabled'}`}
            disabled={!enabled}
            onClick={() => {
              onSelect(t)
              onClose()
            }}
          >
            <span className="menu-dropdown__label">{ADJUSTMENT_LABELS[t]}...</span>
          </button>
        )
      })}
    </div>
  )
}
