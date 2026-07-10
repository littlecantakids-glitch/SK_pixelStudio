import { useEffect, useRef } from 'react'
import { useOpenStore } from '../store/openStore'

/**
 * 앱 전체(window)에서 파일 드래그를 감지해 Drop 시 열기를 실행한다.
 * dragenter/dragleave 카운터로 오버레이 깜빡임을 방지.
 */
export function useDragOpen() {
  const { setDragging, openFiles } = useOpenStore()
  const depth = useRef(0)

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    function onEnter(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setDragging(true)
    }
    function onOver(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    function onLeave(e: DragEvent) {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    function onDrop(e: DragEvent) {
      if (!e.dataTransfer) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      if (e.dataTransfer.files?.length) void openFiles(e.dataTransfer.files)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [setDragging, openFiles])
}
