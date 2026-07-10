import { useCallback } from 'react'
import { useActiveDocument, useEditorDispatch } from '../state'
import type { HistoryItem } from '../types/history'

/**
 * History Store 파사드. 활성 문서의 History 스택을 읽고 조작한다.
 * (각 Document는 독립적인 History를 가지며, 문서 전환 시 자동으로 바뀐다.)
 */
export function useHistory() {
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()

  const items: HistoryItem[] = doc?.history ?? []
  const currentIndex = doc?.historyIndex ?? 0

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [dispatch])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [dispatch])
  const go = useCallback(
    (index: number) => dispatch({ type: 'GO_HISTORY', index }),
    [dispatch],
  )
  const clear = useCallback(() => dispatch({ type: 'CLEAR_HISTORY' }), [dispatch])

  return {
    items,
    currentIndex,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < items.length - 1,
    undo,
    redo,
    go,
    clear,
  }
}
