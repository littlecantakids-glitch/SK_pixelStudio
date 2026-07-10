import { useEffect } from 'react'
import { useClipboard } from './useClipboard'

/**
 * Clipboard 단축키.
 * - Ctrl+C: 복사 / Ctrl+X: 오려두기 / Ctrl+V: 붙여넣기
 * - Ctrl+Shift+C: 복사 병합 / Ctrl+Shift+V: 제자리에 붙여넣기
 * - Ctrl+J: 레이어/선택 복제
 * (Ctrl+A 전체선택·Ctrl+D 해제·Delete 선택삭제는 Selection System 이 담당)
 */
export function useClipboardShortcuts() {
  const { copy, cut, paste, pasteInPlace, copyMerged, duplicate } = useClipboard()

  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      const k = e.key.toLowerCase()
      if (k === 'c') {
        e.preventDefault()
        if (e.shiftKey) copyMerged()
        else copy()
      } else if (k === 'x' && !e.shiftKey) {
        e.preventDefault()
        cut()
      } else if (k === 'v') {
        e.preventDefault()
        if (e.shiftKey) pasteInPlace()
        else paste()
      } else if (k === 'j' && !e.shiftKey) {
        e.preventDefault()
        duplicate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copy, cut, paste, pasteInPlace, copyMerged, duplicate])
}
