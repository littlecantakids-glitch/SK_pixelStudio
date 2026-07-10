import { useEffect } from 'react'
import type { Layer } from '../../types'

type Props = {
  x: number
  y: number
  layer: Layer
  onClose: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMergeDown: () => void
  onConvertSmartObject: () => void
  onRasterize: () => void
  onAddMask: () => void
  onDeleteMask: () => void
  onToggleMaskEnabled: () => void
  /** Type Layer 전용 — 문자 편집 진입 */
  onEditText?: () => void
  /** Type Layer 전용 — 모양으로 변환 */
  onConvertShape?: () => void
  /** Type Layer 전용 — 작업 패스 만들기 (Convert to Path / Outline) */
  onCreateWorkPath?: () => void
  /** Smart Object 전용 — 내용 편집 / 내용 교체 */
  onEditContents?: () => void
  onReplaceContents?: () => void
}

export function LayerContextMenu({
  x,
  y,
  layer,
  onClose,
  onRename,
  onDuplicate,
  onDelete,
  onMergeDown,
  onConvertSmartObject,
  onRasterize,
  onAddMask,
  onDeleteMask,
  onToggleMaskEnabled,
  onEditText,
  onConvertShape,
  onCreateWorkPath,
  onEditContents,
  onReplaceContents,
}: Props) {
  const isSmart = layer.type === 'smartObject'
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  const isBg = layer.type === 'background'
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
    onClose()
  }

  return (
    <div
      className="menu-dropdown layer-ctx"
      style={{ position: 'fixed', top: y, left: x, minWidth: 200 }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {layer.type === 'text' && onEditText && (
        <>
          <button className="menu-dropdown__item" onClick={run(onEditText)}>
            <span className="menu-dropdown__label">문자 편집</span>
          </button>
          <div className="menu-dropdown__separator" />
        </>
      )}
      {isSmart && (
        <>
          {onEditContents && (
            <button className="menu-dropdown__item" onClick={run(onEditContents)}>
              <span className="menu-dropdown__label">내용 편집</span>
            </button>
          )}
          {onReplaceContents && (
            <button className="menu-dropdown__item" onClick={run(onReplaceContents)}>
              <span className="menu-dropdown__label">내용 교체...</span>
            </button>
          )}
          <button className="menu-dropdown__item menu-dropdown__item--disabled" disabled>
            <span className="menu-dropdown__label">내용 내보내기...</span>
          </button>
          <button className="menu-dropdown__item menu-dropdown__item--disabled" disabled>
            <span className="menu-dropdown__label">레이어로 변환</span>
          </button>
          <div className="menu-dropdown__separator" />
        </>
      )}
      <button className="menu-dropdown__item" onClick={run(onDuplicate)}>
        <span className="menu-dropdown__label">레이어 복제</span>
        <span className="menu-dropdown__shortcut">Ctrl+J</span>
      </button>
      <button className="menu-dropdown__item" onClick={run(onRename)}>
        <span className="menu-dropdown__label">이름 바꾸기</span>
      </button>
      <button
        className={`menu-dropdown__item${isBg || layer.locked ? ' menu-dropdown__item--disabled' : ''}`}
        disabled={isBg || layer.locked}
        onClick={run(onDelete)}
      >
        <span className="menu-dropdown__label">레이어 삭제</span>
      </button>
      <div className="menu-dropdown__separator" />
      {layer.mask ? (
        <>
          <button className="menu-dropdown__item" onClick={run(onToggleMaskEnabled)}>
            <span className="menu-dropdown__label">
              {layer.maskEnabled ? '레이어 마스크 사용 안 함' : '레이어 마스크 사용'}
            </span>
            <span className="menu-dropdown__shortcut">Shift+클릭</span>
          </button>
          <button className="menu-dropdown__item" onClick={run(onDeleteMask)}>
            <span className="menu-dropdown__label">레이어 마스크 삭제</span>
          </button>
        </>
      ) : (
        <button
          className={`menu-dropdown__item${
            isBg || layer.type === 'group' ? ' menu-dropdown__item--disabled' : ''
          }`}
          disabled={isBg || layer.type === 'group'}
          onClick={run(onAddMask)}
        >
          <span className="menu-dropdown__label">레이어 마스크 추가</span>
        </button>
      )}
      <div className="menu-dropdown__separator" />
      <button className="menu-dropdown__item" onClick={run(onMergeDown)}>
        <span className="menu-dropdown__label">아래 레이어와 병합</span>
        <span className="menu-dropdown__shortcut">Ctrl+E</span>
      </button>
      {!isSmart && (
        <button className="menu-dropdown__item" onClick={run(onConvertSmartObject)}>
          <span className="menu-dropdown__label">고급 개체로 변환</span>
        </button>
      )}
      <button
        className={`menu-dropdown__item${layer.type === 'adjustment' ? ' menu-dropdown__item--disabled' : ''}`}
        disabled={layer.type === 'adjustment'}
        onClick={run(onRasterize)}
      >
        <span className="menu-dropdown__label">
          {layer.type === 'text'
            ? '문자 래스터화'
            : layer.type === 'shape'
              ? '모양 래스터화'
              : isSmart
                ? '고급 개체 래스터화'
                : '레이어 래스터화'}
        </span>
      </button>
      {layer.type === 'text' && onConvertShape && (
        <button className="menu-dropdown__item" onClick={run(onConvertShape)}>
          <span className="menu-dropdown__label">모양으로 변환</span>
        </button>
      )}
      {layer.type === 'text' && onCreateWorkPath && (
        <button className="menu-dropdown__item" onClick={run(onCreateWorkPath)}>
          <span className="menu-dropdown__label">작업 패스 만들기</span>
        </button>
      )}
      <div className="menu-dropdown__separator" />
      <button className="menu-dropdown__item menu-dropdown__item--disabled" disabled>
        <span className="menu-dropdown__label">클리핑 마스크 만들기</span>
      </button>
    </div>
  )
}
