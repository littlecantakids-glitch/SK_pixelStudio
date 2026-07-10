import { useEffect } from 'react'
import { useEditorDispatch } from '../state'

/** Ctrl+Z = Undo, Ctrl+Shift+Z / Ctrl+Y = Redo */
export function useHistoryShortcuts() {
  const dispatch = useEditorDispatch()

  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' })
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
