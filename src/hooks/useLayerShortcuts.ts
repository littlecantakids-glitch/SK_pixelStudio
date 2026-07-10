import { useEffect } from 'react'
import { useLayers } from './useLayers'
import { useActiveDocument, useEditorDispatch } from '../state'

/**
 * 레이어 단축키:
 * - Ctrl+Shift+N : 새 레이어
 * - Delete       : Mask 가 Active 이면 레이어 마스크 삭제, 아니면 레이어 삭제
 *                  (단, 선택 영역이 있으면 Selection 도구가 처리)
 * - \            : 마스크 빨간 Overlay Preview 토글 (Quick Mask 스타일)
 *
 * Ctrl+A(모두 선택)은 Selection System, Ctrl+J(복제)는 Clipboard System 이 담당한다.
 */
export function useLayerShortcuts() {
  const { createLayer, deleteSelectedLayers, deleteLayerMask, activeLayer, activeTarget } = useLayers()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()

  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }

    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        createLayer()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Mask 가 선택돼 있으면 마스크만 삭제 (Bitmap 은 보존)
        // 단, Adjustment Layer 는 마스크가 본체에 내장된 개념이므로 레이어 자체를 삭제
        if (activeTarget === 'mask' && activeLayer?.mask && activeLayer.type !== 'adjustment') {
          e.preventDefault()
          deleteLayerMask()
          return
        }
        // 선택 영역이 있으면 픽셀 삭제(Selection 도구)에 위임
        if (doc?.selection.active) return
        // 선택된 모든 Layer 삭제 (Background/Locked 는 reducer 가 제외). 활성 레이어 종류와 무관.
        e.preventDefault()
        deleteSelectedLayers()
      } else if (e.key === '\\' && !ctrl) {
        // \ 키 — 마스크 Rubylith Overlay 토글
        if (activeLayer?.mask) {
          e.preventDefault()
          dispatch({ type: 'TOGGLE_MASK_OVERLAY' })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createLayer, deleteSelectedLayers, deleteLayerMask, activeLayer, activeTarget, doc, dispatch])
}
