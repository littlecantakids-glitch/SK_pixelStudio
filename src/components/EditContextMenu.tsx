import { useEffect } from 'react'
import { useClipboard } from '../hooks/useClipboard'

/** 선택/이동 도구 캔버스 우클릭 — Cut/Copy/Paste/Paste In Place/Clear/Fill/Stroke */
export function EditContextMenu({
  pos,
  onClose,
}: {
  pos: { x: number; y: number } | null
  onClose: () => void
}) {
  const c = useClipboard()

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

  const run = (fn: () => void, disabled?: boolean) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    fn()
    onClose()
  }
  const item = (label: string, shortcut: string, fn: () => void, disabled = false) => (
    <button
      className={`menu-dropdown__item${disabled ? ' menu-dropdown__item--disabled' : ''}`}
      disabled={disabled}
      onClick={run(fn, disabled)}
    >
      <span className="menu-dropdown__label">{label}</span>
      {shortcut && <span className="menu-dropdown__shortcut">{shortcut}</span>}
    </button>
  )

  return (
    <div
      className="menu-dropdown layer-ctx"
      style={{ position: 'fixed', top: pos.y, left: pos.x, minWidth: 210, zIndex: 1200 }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {item('오려두기', 'Ctrl+X', c.cut, !c.canCut)}
      {item('복사', 'Ctrl+C', c.copy, !c.canCopy)}
      {item('복사 병합', 'Shift+Ctrl+C', c.copyMerged, !c.canCopy)}
      {item('붙여넣기', 'Ctrl+V', c.paste, !c.canPaste)}
      {item('제자리에 붙여넣기', 'Shift+Ctrl+V', c.pasteInPlace, !c.canPaste)}
      <div className="menu-dropdown__separator" />
      {item('지우기', '', c.clear, !c.canClear)}
      {item('칠...', 'Shift+F5', c.fill)}
      {item('획...', '', c.stroke)}
    </div>
  )
}
