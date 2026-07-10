import { useEffect } from 'react'
import { useEditor } from '../state'

/** 저장되지 않은 변경이 있으면 창 닫기/새로고침 시 브라우저 경고. */
export function useUnsavedChanges() {
  const { documents } = useEditor()

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (documents.some((d) => d.dirty)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [documents])
}
