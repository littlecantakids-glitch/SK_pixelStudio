import { useEffect } from 'react'

type Props = {
  x: number
  y: number
  onClose: () => void
  onClear: () => void
}

export function HistoryMenu({ x, y, onClose, onClear }: Props) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  return (
    <div
      className="menu-dropdown"
      style={{ position: 'fixed', top: y, left: x, minWidth: 180 }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      <button
        type="button"
        className="menu-dropdown__item"
        onClick={() => {
          onClear()
          onClose()
        }}
      >
        <span className="menu-dropdown__label">작업 내역 지우기</span>
      </button>
    </div>
  )
}
