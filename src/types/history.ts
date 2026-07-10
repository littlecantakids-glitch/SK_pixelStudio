import type { Layer, SelectionState, VectorPath } from '../types'

export type HistoryType =
  | 'document'
  | 'layer'
  | 'transform'
  | 'brush'
  | 'selection'
  | 'mask'
  | 'adjustment'
  | 'gradient'
  | 'crop'
  | 'text'
  | 'filter'
  | 'path'

/**
 * History 항목 = 해당 액션 직후의 Document 스냅샷(메타데이터).
 * Canvas bitmap 은 저장하지 않고 Layer 메타데이터만 저장한다.
 * 이전 상태(before)는 리스트에서 바로 앞 항목이 된다 (인덱스 기반).
 */
export type HistoryItem = {
  id: string
  name: string
  type: HistoryType
  timestamp: number
  layers: Layer[]
  activeLayerId: string
  selection: SelectionState | null
  /** Vector Path 스냅샷 (Undo/Redo 시 복원) */
  paths?: VectorPath[]
  activePathId?: string | null
}

let seq = 0

export function createHistoryItem(
  name: string,
  type: HistoryType,
  layers: Layer[],
  activeLayerId: string,
  selection: SelectionState | null = null,
  paths: VectorPath[] = [],
  activePathId: string | null = null,
): HistoryItem {
  seq += 1
  return {
    id: `h-${seq}-${Date.now()}`,
    name,
    type,
    timestamp: Date.now(),
    layers,
    activeLayerId,
    selection,
    paths,
    activePathId,
  }
}

export const HISTORY_LIMIT = 50
export const HISTORY_MAX = 100
