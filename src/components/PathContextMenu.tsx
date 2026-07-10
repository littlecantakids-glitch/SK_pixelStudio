import { useEffect } from 'react'
import { usePathActions } from '../hooks/usePathActions'

/** 펜 도구 캔버스 우클릭 컨텍스트 메뉴 — Make Selection / Stroke / Fill / Delete */
export function PathContextMenu({
  pos,
  onClose,
}: {
  pos: { x: number; y: number } | null
  onClose: () => void
}) {
  const { makeSelection, fillPath, strokePath, deletePath, hasActivePath } = usePathActions()

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

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const item = (label: string, fn: () => void, disabled = false) => (
    <button
      className={`menu-dropdown__item${disabled ? ' menu-dropdown__item--disabled' : ''}`}
      disabled={disabled}
      onClick={run(fn)}
    >
      <span className="menu-dropdown__label">{label}</span>
    </button>
  )

  return (
    <div
      className="menu-dropdown layer-ctx"
      style={{ position: 'fixed', top: pos.y, left: pos.x, minWidth: 200, zIndex: 1200 }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {item('선택 영역 만들기...', makeSelection, !hasActivePath)}
      {item('패스 획...', strokePath, !hasActivePath)}
      {item('패스 칠...', fillPath, !hasActivePath)}
      <div className="menu-dropdown__separator" />
      {item('패스 삭제', deletePath, !hasActivePath)}
    </div>
  )
}
