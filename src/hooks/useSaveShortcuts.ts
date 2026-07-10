import { useEffect } from 'react'
import { useSaveDocument } from './useSaveDocument'

/** Ctrl+S = Save, Ctrl+Shift+S = Save As. 브라우저 기본 저장 차단. */
export function useSaveShortcuts() {
  const { save, saveAs } = useSaveDocument()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        if (e.shiftKey) saveAs()
        else void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, saveAs])
}
