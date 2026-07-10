import { useEffect } from 'react'
import { useBrushStore } from '../../store/brushStore'

/**
 * Eraser/Brush 캔버스 우클릭 컨텍스트 메뉴 (Photoshop Tool Context Menu).
 * Reset Tool 은 팁 파라미터를 기본값으로 되돌린다. Brush Settings 는 UI 준비.
 */
export function ToolContextMenu({
  pos,
  onClose,
}: {
  pos: { x: number; y: number } | null
  onClose: () => void
}) {
  const brush = useBrushStore()

  useEffect(() => {
    if (!pos) return
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [pos, onClose])

  if (!pos) return null

  const resetTool = () => {
    brush.setSize(30)
    brush.setHardness(80)
    brush.setOpacity(100)
    brush.setFlow(100)
    brush.setSmoothing(10)
    brush.setSpacing(15)
    brush.setAngle(0)
    brush.setRoundness(100)
    brush.setMode('normal')
    brush.setEraserMode('brush')
    brush.setProtectAlpha(false)
    onClose()
  }

  return (
    <div
      className="menu-dropdown layer-ctx"
      style={{ position: 'fixed', top: pos.y, left: pos.x, minWidth: 180, zIndex: 1200 }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <button className="menu-dropdown__item" onClick={resetTool}>
        <span className="menu-dropdown__label">도구 재설정</span>
      </button>
      <button className="menu-dropdown__item" onClick={resetTool}>
        <span className="menu-dropdown__label">모든 도구 재설정</span>
      </button>
      <div className="menu-dropdown__separator" />
      <button className="menu-dropdown__item menu-dropdown__item--disabled" disabled>
        <span className="menu-dropdown__label">브러시 설정...</span>
      </button>
    </div>
  )
}
