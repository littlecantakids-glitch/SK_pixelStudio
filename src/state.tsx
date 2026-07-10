import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import type {
  AdjustmentSettings,
  AdjustmentType,
  BlendMode,
  EditorState,
  Layer,
  MaskTarget,
  MenuId,
  OpenDocument,
  Rect,
  RightPanelTab,
  SelectionState,
  SmartFilter,
  ToolId,
  VectorPath,
} from './types'
import { emptySelection } from './types'
import { buildCroppedLayers } from './engine/cropEngine'
import {
  createAdjustmentLayer,
  createGroup,
  createRasterLayer,
  duplicateLayer as engineDuplicate,
  genId,
  nextLayerName,
  pinBackground,
  reorder as engineReorder,
} from './engine/layerEngine'
import { createLayerMask, MASK_DEFAULTS } from './engine/maskEngine'
import { ADJUSTMENT_LABELS } from './engine/adjustmentEngine'
import {
  createHistoryItem,
  HISTORY_LIMIT,
  type HistoryType,
} from './types/history'

/** 초기 문서용 대략적 Fit To Screen 배율 */
function initFitZoom(w: number, h: number): number {
  if (typeof window === 'undefined') return 50
  const availW = Math.max(320, window.innerWidth - 62 - 260 - 40)
  const availH = Math.max(240, window.innerHeight - 30 - 28 - 150 - 70)
  const z = Math.min(availW / w, availH / h, 1) * 100
  return Math.max(5, Math.round(z * 100) / 100)
}

function backgroundLayer(): Layer {
  return {
    id: 'layer-bg',
    name: '배경',
    type: 'background',
    visible: true,
    locked: true,
    selected: true,
    opacity: 100,
    fill: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    ...MASK_DEFAULTS,
  }
}

const defaultDocument: OpenDocument = {
  id: 'doc-default',
  name: '제목 없음-1',
  width: 1920,
  height: 1080,
  resolution: 72,
  colorMode: 'RGB',
  bitDepth: 8,
  background: '#ffffff',
  fileHandle: null,
  dirty: true,
  zoom: initFitZoom(1920, 1080),
  layers: [backgroundLayer()],
  activeLayerId: 'layer-bg',
  selection: emptySelection(1920, 1080),
  paths: [],
  activePathId: null,
  history: [
    createHistoryItem('새 문서', 'document', [backgroundLayer()], 'layer-bg', null),
  ],
  historyIndex: 0,
}

const initialState: EditorState = {
  activeMenu: null, // 초기에는 모든 메뉴 닫힘 (클릭 시에만 열림)
  activeTool: 'marquee',
  foregroundColor: '#3fb34f',
  backgroundColor: '#ffffff',
  activeRightPanel: 'properties',
  timelineEnabled: false,
  isPlaying: false,
  maskSolo: false,
  maskOverlay: false,
  documents: [defaultDocument],
  activeDocumentId: defaultDocument.id,
}

type Action =
  | { type: 'SET_MENU'; menu: MenuId | null }
  | { type: 'TOGGLE_MENU'; menu: MenuId }
  | { type: 'SET_TOOL'; tool: ToolId }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'SET_FOREGROUND'; color: string }
  | { type: 'SET_BACKGROUND'; color: string }
  | { type: 'SWAP_COLORS' }
  | { type: 'SET_RIGHT_PANEL'; tab: RightPanelTab }
  | { type: 'SELECT_LAYER'; id: string }
  | { type: 'TOGGLE_SELECT_LAYER'; id: string }
  | { type: 'RANGE_SELECT_LAYER'; id: string }
  | { type: 'SELECT_ALL_LAYERS' }
  | { type: 'TOGGLE_LAYER_VISIBILITY'; id: string }
  | { type: 'TOGGLE_LAYER_LOCK'; id: string }
  | { type: 'TOGGLE_LOCK_TRANSPARENT'; id: string }
  | { type: 'SET_LAYER_OPACITY'; id: string; opacity: number }
  | { type: 'SET_LAYER_FILL'; id: string; fill: number }
  | { type: 'SET_LAYER_BLEND'; id: string; blendMode: BlendMode }
  | { type: 'NEW_LAYER' }
  | { type: 'INSERT_LAYER'; layer: Layer; label: string }
  | { type: 'INSERT_SHAPE'; layer: Layer }
  | { type: 'UPDATE_SHAPE'; id: string; patch: Partial<Layer>; label?: string }
  | { type: 'INSERT_TEXT'; layer: Layer }
  | { type: 'UPDATE_TEXT'; id: string; patch: Partial<Layer>; label?: string }
  | { type: 'REMOVE_DRAFT'; id: string }
  | { type: 'DELETE_LAYER'; id?: string; label?: string; only?: boolean }
  | { type: 'DUPLICATE_LAYER'; id?: string }
  | { type: 'RENAME_LAYER'; id: string; name: string }
  | { type: 'REORDER_LAYER'; from: number; to: number }
  | { type: 'GROUP_SELECTED' }
  | { type: 'TOGGLE_COLLAPSE'; id: string }
  | { type: 'MERGE_DOWN'; id: string }
  | { type: 'SET_LAYER_TYPE'; id: string; layerType: Layer['type'] }
  | { type: 'CROP'; box: Rect; angle: number; deleteCropped: boolean }
  | { type: 'CONVERT_TO_SMART_OBJECT'; filter?: SmartFilter }
  | { type: 'OPEN_SMART_OBJECT'; docId: string }
  | { type: 'CLOSE_SMART_TAB'; docId: string }
  | { type: 'REPLACE_SMART_CONTENTS'; docId: string; layerId: string; layers: Layer[]; width?: number; height?: number; name?: string }
  | { type: 'ADD_SMART_FILTER'; layerId: string; filter: SmartFilter }
  | { type: 'SET_SMART_FILTER'; layerId: string; filterId: string; patch: Partial<SmartFilter>; label?: string }
  | { type: 'DELETE_SMART_FILTER'; layerId: string; filterId: string }
  | { type: 'REORDER_SMART_FILTER'; layerId: string; from: number; to: number }
  | { type: 'TOGGLE_FILTERS_EXPAND'; layerId: string }
  | { type: 'MOVE_ACTIVE'; dx: number; dy: number }
  | { type: 'COMMIT_MOVE' }
  | { type: 'APPLY_LAYERS'; id: string; layers: Layer[]; label: string; historyType?: HistoryType }
  | { type: 'ADD_ADJUSTMENT_LAYER'; adjustment: AdjustmentType }
  | { type: 'SET_ADJUSTMENT_SETTINGS'; id: string; settings: AdjustmentSettings }
  | { type: 'COMMIT_ADJUSTMENT'; label: string }
  | { type: 'ADD_LAYER_MASK'; id?: string }
  | { type: 'DELETE_LAYER_MASK'; id?: string }
  | { type: 'TOGGLE_MASK_ENABLED'; id: string }
  | { type: 'TOGGLE_MASK_LINK'; id: string }
  | { type: 'SET_ACTIVE_TARGET'; target: MaskTarget }
  | { type: 'TOGGLE_MASK_SOLO' }
  | { type: 'TOGGLE_MASK_OVERLAY' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'GO_HISTORY'; index: number }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'SET_SELECTION'; selection: SelectionState; label: string }
  | { type: 'MOVE_SELECTION'; selection: SelectionState }
  | { type: 'COMMIT_SELECTION'; label: string }
  | { type: 'TOGGLE_TIMELINE' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PATHS'; paths: VectorPath[]; activePathId?: string | null }
  | { type: 'COMMIT_PATHS'; label: string }
  | { type: 'APPLY_PATHS'; paths: VectorPath[]; activePathId?: string | null; label: string }
  | { type: 'SELECT_PATH'; id: string | null }
  | { type: 'DELETE_PATH'; id: string }
  | { type: 'RENAME_PATH'; id: string; name: string }
  | { type: 'TOGGLE_PATH_VISIBILITY'; id: string }
  | { type: 'ADD_DOCUMENT'; document: OpenDocument }
  | { type: 'SET_ACTIVE_DOCUMENT'; id: string }
  | { type: 'CLOSE_DOCUMENT'; id: string }
  | { type: 'UPDATE_DOCUMENT'; id: string; patch: Partial<OpenDocument> }
  | { type: 'ADD_HISTORY'; entry: string }

/** 활성 문서에만 변경을 적용하는 헬퍼 */
function mapActive(
  state: EditorState,
  fn: (doc: OpenDocument) => OpenDocument,
): EditorState {
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.id === state.activeDocumentId ? fn(d) : d,
    ),
  }
}

/** 액션 직후 상태를 History에 push (분기: 현재 인덱스 이후 잘라내고 추가, 최대 개수 제한) */
function pushHistory(d: OpenDocument, name: string, type: HistoryType): OpenDocument {
  const truncated = d.history.slice(0, d.historyIndex + 1)
  let items = [
    ...truncated,
    createHistoryItem(
      name,
      type,
      d.layers,
      d.activeLayerId,
      d.selection,
      d.paths ?? [],
      d.activePathId ?? null,
    ),
  ]
  if (items.length > HISTORY_LIMIT) items = items.slice(items.length - HISTORY_LIMIT)
  // version 증가 — Smart Object Cache 무효화 + 모든 Instance 갱신
  return { ...d, history: items, historyIndex: items.length - 1, version: (d.version ?? 0) + 1 }
}

/** 활성 문서의 레이어를 편집 + dirty + (선택적) history 기록 */
function editActive(
  state: EditorState,
  fn: (doc: OpenDocument) => Partial<OpenDocument>,
  name?: string,
  type: HistoryType = 'layer',
): EditorState {
  return mapActive(state, (d) => {
    const patch = fn(d)
    const merged: OpenDocument = { ...d, ...patch, dirty: true }
    return name ? pushHistory(merged, name, type) : merged
  })
}

function isMovable(layer: Layer): boolean {
  return layer.type !== 'background' && !layer.locked
}

/** id 집합에 그룹 하위(자식/후손) 레이어를 모두 포함 (그룹 삭제 시 내용도 함께 삭제) */
function expandWithChildren(layers: Layer[], ids: Iterable<string>): Set<string> {
  const set = new Set(ids)
  let changed = true
  while (changed) {
    changed = false
    for (const l of layers) {
      if (l.parentId && set.has(l.parentId) && !set.has(l.id)) {
        set.add(l.id)
        changed = true
      }
    }
  }
  return set
}

/** 삭제 후 새 Active — 삭제된 최상단 위치의 바로 아래 레이어, 없으면 위, 둘 다 없으면 '' */
function pickActiveAfterDelete(original: Layer[], removed: Set<string>, firstIdx: number): string {
  for (let i = firstIdx; i < original.length; i++) if (!removed.has(original[i].id)) return original[i].id
  for (let i = firstIdx - 1; i >= 0; i--) if (!removed.has(original[i].id)) return original[i].id
  return ''
}

/** 참조되지 않는 SmartDocument 정리 (GC). 편집 중(smartOpen)이거나 어떤 레이어가 참조하면 유지 */
function gcSmartDocs(docs: OpenDocument[]): OpenDocument[] {
  const referenced = new Set<string>()
  for (const d of docs) {
    for (const l of d.layers) {
      if (l.type === 'smartObject' && l.smartDocId) referenced.add(l.smartDocId)
    }
  }
  return docs.filter((d) => !d.smart || d.smartOpen || referenced.has(d.id))
}

/** History 스냅샷(index)으로 레이어/활성/선택 복원 */
function restoreSnapshot(d: OpenDocument, i: number): OpenDocument {
  const s = d.history[i]
  return {
    ...d,
    layers: s.layers,
    activeLayerId: s.activeLayerId,
    selection: s.selection ?? emptySelection(d.width, d.height),
    paths: s.paths ?? d.paths ?? [],
    activePathId: s.activePathId ?? null,
    historyIndex: i,
    dirty: true,
    // Undo/Redo 시에도 version 을 올려 Smart Cache 를 갱신한다
    version: (d.version ?? 0) + 1,
  }
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_MENU':
      return { ...state, activeMenu: action.menu }
    case 'TOGGLE_MENU':
      return {
        ...state,
        activeMenu: state.activeMenu === action.menu ? null : action.menu,
      }
    case 'SET_TOOL':
      return { ...state, activeTool: action.tool }
    case 'SET_ZOOM':
      return mapActive(state, (d) => ({
        ...d,
        zoom: Math.min(3200, Math.max(1, action.zoom)),
      }))
    case 'SET_FOREGROUND':
      return { ...state, foregroundColor: action.color }
    case 'SET_BACKGROUND':
      return { ...state, backgroundColor: action.color }
    case 'SWAP_COLORS':
      return {
        ...state,
        foregroundColor: state.backgroundColor,
        backgroundColor: state.foregroundColor,
      }
    case 'SET_RIGHT_PANEL':
      return { ...state, activeRightPanel: action.tab }
    case 'SELECT_LAYER': {
      // 다른 레이어를 선택하면 편집 대상은 Bitmap 으로, Mask Solo 보기는 해제
      const next = mapActive(state, (d) => ({
        ...d,
        activeLayerId: action.id,
        activeTarget: d.activeLayerId === action.id ? d.activeTarget : 'bitmap',
        layers: d.layers.map((l) => ({ ...l, selected: l.id === action.id })),
      }))
      const doc = state.documents.find((d) => d.id === state.activeDocumentId)
      const changed = doc ? doc.activeLayerId !== action.id : false
      return changed ? { ...next, maskSolo: false } : next
    }
    case 'TOGGLE_SELECT_LAYER':
      return mapActive(state, (d) => ({
        ...d,
        activeLayerId: action.id,
        layers: d.layers.map((l) =>
          l.id === action.id ? { ...l, selected: !l.selected } : l,
        ),
      }))
    case 'RANGE_SELECT_LAYER':
      return mapActive(state, (d) => {
        const from = d.layers.findIndex((l) => l.id === d.activeLayerId)
        const to = d.layers.findIndex((l) => l.id === action.id)
        if (from < 0 || to < 0) return d
        const [lo, hi] = from < to ? [from, to] : [to, from]
        return {
          ...d,
          activeLayerId: action.id,
          layers: d.layers.map((l, i) => ({ ...l, selected: i >= lo && i <= hi })),
        }
      })
    case 'SELECT_ALL_LAYERS':
      return mapActive(state, (d) => ({
        ...d,
        layers: d.layers.map((l) => ({ ...l, selected: true })),
      }))
    case 'TOGGLE_LAYER_VISIBILITY':
      return editActive(state, (d) => ({
        layers: d.layers.map((l) =>
          l.id === action.id ? { ...l, visible: !l.visible } : l,
        ),
      }))
    case 'TOGGLE_LOCK_TRANSPARENT':
      // 투명 픽셀 잠그기 — ON 이면 투명 영역 Fill/페인트 금지
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) =>
            l.id === action.id ? { ...l, lockTransparent: !l.lockTransparent } : l,
          ),
        }),
        '투명 픽셀 잠그기',
      )
    case 'TOGGLE_LAYER_LOCK':
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) => {
            if (l.id !== action.id) return l
            // 배경 레이어의 잠금 해제 → 이동 가능한 일반 레이어로 변환 (Photoshop 동작)
            if (l.type === 'background' && l.locked) {
              return {
                ...l,
                locked: false,
                type: l.bitmap ? 'image' : 'raster',
                name: '레이어 0',
              }
            }
            return { ...l, locked: !l.locked }
          }),
        }),
        '레이어 잠금',
      )
    case 'SET_LAYER_OPACITY':
      return editActive(state, (d) => ({
        layers: d.layers.map((l) =>
          l.id === action.id ? { ...l, opacity: action.opacity } : l,
        ),
      }))
    case 'SET_LAYER_FILL':
      return editActive(state, (d) => ({
        layers: d.layers.map((l) =>
          l.id === action.id ? { ...l, fill: action.fill } : l,
        ),
      }))
    case 'SET_LAYER_BLEND':
      return editActive(state, (d) => ({
        layers: d.layers.map((l) =>
          l.id === action.id ? { ...l, blendMode: action.blendMode } : l,
        ),
      }))
    case 'NEW_LAYER':
      return editActive(
        state,
        (d) => {
          const layer = createRasterLayer(nextLayerName(d.layers), d.width, d.height)
          const activeIdx = d.layers.findIndex((l) => l.id === d.activeLayerId)
          const insertAt = activeIdx < 0 ? 0 : activeIdx
          const layers = [...d.layers]
          layers.splice(insertAt, 0, layer)
          return {
            layers: pinBackground(layers).map((l) => ({
              ...l,
              selected: l.id === layer.id,
            })),
            activeLayerId: layer.id,
          }
        },
        '새 레이어',
      )
    case 'INSERT_LAYER':
      // Clipboard Paste / Duplicate — 활성 레이어 위에 삽입하고 새 레이어를 활성화
      return editActive(
        state,
        (d) => {
          const activeIdx = d.layers.findIndex((l) => l.id === d.activeLayerId)
          const insertAt = activeIdx < 0 ? 0 : activeIdx
          const layers = [...d.layers]
          layers.splice(insertAt, 0, action.layer)
          return {
            layers: pinBackground(layers).map((l) => ({ ...l, selected: l.id === action.layer.id })),
            activeLayerId: action.layer.id,
            activeTarget: 'bitmap' as MaskTarget,
          }
        },
        action.label,
        'layer',
      )
    case 'INSERT_SHAPE':
      // Shape Tool Drag 시작 — 활성 레이어 위에 Draft Shape Layer 삽입 (History 미기록)
      return mapActive(state, (d) => {
        const activeIdx = d.layers.findIndex((l) => l.id === d.activeLayerId)
        const insertAt = activeIdx < 0 ? 0 : activeIdx
        const layers = [...d.layers]
        layers.splice(insertAt, 0, action.layer)
        return {
          ...d,
          dirty: true,
          layers: pinBackground(layers).map((l) => ({ ...l, selected: l.id === action.layer.id })),
          activeLayerId: action.layer.id,
          activeTarget: 'bitmap' as MaskTarget,
        }
      })
    case 'UPDATE_SHAPE': {
      // Drag 중 실시간 갱신(label 없음) 또는 확정/속성 변경(label → History 1개)
      const apply = (d: OpenDocument): Partial<OpenDocument> => ({
        layers: d.layers.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)),
      })
      return action.label
        ? editActive(state, apply, action.label, 'layer')
        : mapActive(state, (d) => ({ ...d, dirty: true, ...apply(d) }))
    }
    case 'INSERT_TEXT':
      // Text Tool Click — 활성 레이어 위에 Draft Type Layer 삽입 (History 미기록)
      return mapActive(state, (d) => {
        const activeIdx = d.layers.findIndex((l) => l.id === d.activeLayerId)
        const insertAt = activeIdx < 0 ? 0 : activeIdx
        const layers = [...d.layers]
        layers.splice(insertAt, 0, action.layer)
        return {
          ...d,
          dirty: true,
          layers: pinBackground(layers).map((l) => ({ ...l, selected: l.id === action.layer.id })),
          activeLayerId: action.layer.id,
          activeTarget: 'bitmap' as MaskTarget,
        }
      })
    case 'UPDATE_TEXT': {
      // 입력 중 실시간 갱신(label 없음) 또는 확정/속성 변경(label → History 1개)
      const apply = (d: OpenDocument): Partial<OpenDocument> => ({
        layers: d.layers.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)),
      })
      return action.label
        ? editActive(state, apply, action.label, 'text')
        : mapActive(state, (d) => ({ ...d, dirty: true, ...apply(d) }))
    }
    case 'REMOVE_DRAFT':
      // 너무 작은 Draft Shape 취소 — History 미기록
      return mapActive(state, (d) => {
        const layers = d.layers.filter((l) => l.id !== action.id)
        if (layers.length === d.layers.length) return d
        const newActive = layers.some((l) => l.id === d.activeLayerId)
          ? d.activeLayerId
          : (layers[0]?.id ?? d.activeLayerId)
        return {
          ...d,
          dirty: true,
          layers: layers.map((l) => ({ ...l, selected: l.id === newActive })),
          activeLayerId: newActive,
        }
      })
    case 'DELETE_LAYER': {
      // 여러 Layer 동시 삭제 (Delete 키 / 휴지통 / 컨텍스트 메뉴 공용).
      // 대상: action.id 가 선택돼 있으면 선택 전체, 아니면 그 레이어; id 없으면 선택 전체.
      const active = state.documents.find((d) => d.id === state.activeDocumentId)
      if (!active) return state
      const selectedIds = active.layers.filter((l) => l.selected).map((l) => l.id)
      const base = action.only && action.id
        ? [action.id] // 단일 대상 강제 (예: 레이어 오려두기)
        : action.id
          ? active.layers.find((l) => l.id === action.id)?.selected
            ? selectedIds
            : [action.id]
          : selectedIds
      // 그룹 하위까지 확장 → Locked / Background 만 제외 (Raster/Shape/Text/SmartObject/Adjustment/Group 모두 삭제)
      const expanded = expandWithChildren(active.layers, base)
      const removable = new Set(
        active.layers
          .filter((l) => expanded.has(l.id) && !l.locked && l.type !== 'background')
          .map((l) => l.id),
      )
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.log('[DELETE_LAYER]', { base, deleteIds: [...removable] })
      }
      if (removable.size === 0) return state
      const layers = active.layers.filter((l) => !removable.has(l.id))
      if (!layers.length) return state
      const firstIdx = active.layers.findIndex((l) => removable.has(l.id))
      const removedActive = removable.has(active.activeLayerId) || !layers.some((l) => l.id === active.activeLayerId)
      const newActive = removedActive
        ? pickActiveAfterDelete(active.layers, removable, firstIdx)
        : active.activeLayerId
      const count = removable.size
      const label = action.label ?? (count > 1 ? `${count}개 레이어 삭제` : '레이어 삭제')
      const patched = pushHistory(
        {
          ...active,
          dirty: true,
          activeLayerId: newActive,
          layers: layers.map((l) => ({ ...l, selected: l.id === newActive })),
        },
        label,
        'layer',
      )
      // SmartDocument GC — 참조 없는 고급 개체 문서 정리
      return {
        ...state,
        documents: gcSmartDocs(state.documents.map((d) => (d.id === active.id ? patched : d))),
      }
    }
    case 'DUPLICATE_LAYER':
      return editActive(
        state,
        (d) => {
          const src = d.layers.find((l) => l.id === (action.id ?? d.activeLayerId))
          if (!src) return {}
          const copy = engineDuplicate(src)
          const idx = d.layers.findIndex((l) => l.id === src.id)
          const layers = [...d.layers]
          layers.splice(idx, 0, copy)
          return {
            layers: pinBackground(layers).map((l) => ({
              ...l,
              selected: l.id === copy.id,
            })),
            activeLayerId: copy.id,
          }
        },
        '레이어 복제',
      )
    case 'RENAME_LAYER':
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) =>
            l.id === action.id ? { ...l, name: action.name || l.name } : l,
          ),
        }),
        '레이어 이름 변경',
      )
    case 'REORDER_LAYER':
      return editActive(
        state,
        (d) => ({ layers: engineReorder(d.layers, action.from, action.to) }),
        '레이어 순서 변경',
      )
    case 'GROUP_SELECTED':
      return editActive(
        state,
        (d) => {
          const selected = d.layers.filter((l) => l.selected && l.type !== 'background')
          if (selected.length === 0) return {}
          const group = createGroup('그룹 1')
          group.children = selected.map((l) => l.id)
          const firstIdx = d.layers.findIndex((l) => l.id === selected[0].id)
          const rest = d.layers.filter((l) => !selected.some((s) => s.id === l.id))
          const grouped = selected.map((l) => ({ ...l, parentId: group.id, selected: false }))
          const insertAt = Math.max(0, Math.min(firstIdx, rest.length))
          const layers = [...rest]
          layers.splice(insertAt, 0, group, ...grouped)
          return {
            layers: pinBackground(layers),
            activeLayerId: group.id,
          }
        },
        '레이어 그룹화',
      )
    case 'TOGGLE_COLLAPSE':
      return mapActive(state, (d) => ({
        ...d,
        layers: d.layers.map((l) =>
          l.id === action.id ? { ...l, collapsed: !l.collapsed } : l,
        ),
      }))
    case 'MERGE_DOWN':
      return editActive(
        state,
        (d) => {
          const idx = d.layers.findIndex((l) => l.id === action.id)
          if (idx < 0 || idx >= d.layers.length - 1) return {}
          const below = d.layers[idx + 1]
          if (below.type === 'background') return {} // 배경 위 레이어 병합은 배경 유지
          // 최소 구현: 위 레이어를 제거하고 아래 레이어를 활성화 (실제 픽셀 병합은 렌더에서 합성)
          const layers = d.layers.filter((_, i) => i !== idx)
          return {
            layers: layers.map((l) => ({ ...l, selected: l.id === below.id })),
            activeLayerId: below.id,
          }
        },
        '아래 레이어와 병합',
      )
    case 'SET_LAYER_TYPE':
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) =>
            l.id === action.id ? { ...l, type: action.layerType } : l,
          ),
        }),
        action.layerType === 'smartObject' ? '고급 개체로 변환' : '레이어 래스터화',
      )
    case 'CROP':
      return editActive(
        state,
        (d) => {
          const nw = Math.max(1, Math.round(action.box.width))
          const nh = Math.max(1, Math.round(action.box.height))
          return {
            layers: buildCroppedLayers(d.layers, action.box, action.angle, action.deleteCropped),
            width: nw,
            height: nh,
            selection: emptySelection(nw, nh),
          }
        },
        action.angle ? '자르기 및 회전' : '자르기',
        'crop',
      )
    case 'CONVERT_TO_SMART_OBJECT': {
      const active = state.documents.find((d) => d.id === state.activeDocumentId)
      if (!active) return state
      const selected = active.layers.filter((l) => l.selected)
      const targets = selected.length
        ? selected
        : active.layers.filter((l) => l.id === active.activeLayerId)
      if (!targets.length) return state
      const ids = new Set(targets.map((l) => l.id))
      // SmartDocument 생성 (내부 Layer = 대상 복사본, 자체 History)
      const smartId = genId('smartdoc')
      const smartLayers = targets.map((l, i) => ({
        ...l,
        parentId: undefined,
        selected: i === 0,
      }))
      const smartName = targets.length === 1 ? targets[0].name : '고급 개체'
      const smartDoc: OpenDocument = {
        id: smartId,
        name: smartName,
        width: active.width,
        height: active.height,
        resolution: active.resolution,
        colorMode: active.colorMode,
        bitDepth: active.bitDepth,
        background: 'transparent',
        fileHandle: null,
        dirty: false,
        zoom: 100,
        layers: smartLayers,
        activeLayerId: smartLayers[0].id,
        selection: emptySelection(active.width, active.height),
        paths: [],
        activePathId: null,
        history: [createHistoryItem('고급 개체', 'document', smartLayers, smartLayers[0].id, null)],
        historyIndex: 0,
        smart: true,
        smartOpen: false,
        version: 0,
      }
      // Parent: 대상들을 SmartObject Layer 하나로 교체
      const soLayer: Layer = {
        id: genId('so'),
        name: smartName,
        type: 'smartObject',
        smartDocId: smartId,
        linked: false,
        visible: true,
        locked: false,
        selected: true,
        opacity: 100,
        fill: 100,
        blendMode: 'normal',
        x: 0,
        y: 0,
        width: active.width,
        height: active.height,
        rotation: 0,
        ...MASK_DEFAULTS,
        // Convert for Smart Filters — 변환과 동시에 스마트 필터를 붙일 수 있다
        ...(action.filter ? { smartFilters: [action.filter], filtersExpanded: true } : {}),
      }
      const replaced: Layer[] = []
      let inserted = false
      for (const l of active.layers) {
        if (ids.has(l.id)) {
          if (!inserted) {
            replaced.push(soLayer)
            inserted = true
          }
          continue
        }
        replaced.push(l)
      }
      const parent = pushHistory(
        {
          ...active,
          dirty: true,
          layers: pinBackground(replaced).map((l) => ({ ...l, selected: l.id === soLayer.id })),
          activeLayerId: soLayer.id,
        },
        '고급 개체로 변환',
        'layer',
      )
      if (import.meta.env?.DEV) {
        const first = smartDoc.layers[0]
        const bmp = first?.bitmap as (HTMLCanvasElement & HTMLImageElement) | undefined
        // eslint-disable-next-line no-console
        console.log('[CONVERT_TO_SMART_OBJECT]', {
          smartDocId: smartId,
          layersLength: smartDoc.layers.length,
          firstType: first?.type,
          hasBitmap: !!bmp,
          bitmapW: bmp?.naturalWidth || bmp?.width,
          bitmapH: bmp?.naturalHeight || bmp?.height,
        })
      }
      return {
        ...state,
        documents: [...state.documents.map((d) => (d.id === active.id ? parent : d)), smartDoc],
      }
    }
    case 'OPEN_SMART_OBJECT':
      return {
        ...state,
        activeDocumentId: action.docId,
        documents: state.documents.map((d) =>
          d.id === action.docId ? { ...d, smartOpen: true } : d,
        ),
      }
    case 'CLOSE_SMART_TAB': {
      const docs = state.documents.map((d) =>
        d.id === action.docId ? { ...d, smartOpen: false } : d,
      )
      let activeId = state.activeDocumentId
      if (activeId === action.docId) {
        const visible = docs.filter((d) => !d.smart || d.smartOpen)
        activeId = visible[visible.length - 1]?.id ?? null
      }
      return { ...state, documents: docs, activeDocumentId: activeId }
    }
    case 'REPLACE_SMART_CONTENTS': {
      // SmartDocument 내용 교체 (+version) 후 Parent History 기록(+레이어 이름)
      const docs = state.documents.map((d) =>
        d.id === action.docId
          ? {
              ...d,
              layers: action.layers,
              activeLayerId: action.layers[0]?.id ?? d.activeLayerId,
              width: action.width ?? d.width,
              height: action.height ?? d.height,
              version: (d.version ?? 0) + 1,
              history: [
                createHistoryItem('Replace Contents', 'document', action.layers, action.layers[0]?.id ?? '', null),
              ],
              historyIndex: 0,
            }
          : d,
      )
      return {
        ...state,
        documents: docs.map((d) =>
          d.id === state.activeDocumentId
            ? pushHistory(
                {
                  ...d,
                  dirty: true,
                  layers: d.layers.map((l) =>
                    l.id === action.layerId && action.name ? { ...l, name: action.name } : l,
                  ),
                },
                '고급 개체 교체',
                'layer',
              )
            : d,
        ),
      }
    }
    case 'ADD_SMART_FILTER':
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) =>
            l.id === action.layerId
              ? // 최근 적용 필터를 맨 위(index 0)에 — Photoshop 스택 순서
                { ...l, smartFilters: [action.filter, ...(l.smartFilters ?? [])], filtersExpanded: true }
              : l,
          ),
        }),
        `${action.filter.name} 추가`,
        'filter',
      )
    case 'SET_SMART_FILTER': {
      // 파라미터/opacity/blend/enable 변경 — label 있으면 History, 없으면 실시간(슬라이더)
      const apply = (d: OpenDocument): Partial<OpenDocument> => ({
        layers: d.layers.map((l) =>
          l.id === action.layerId
            ? {
                ...l,
                smartFilters: (l.smartFilters ?? []).map((f) =>
                  f.id === action.filterId ? { ...f, ...action.patch } : f,
                ),
              }
            : l,
        ),
      })
      return action.label
        ? editActive(state, apply, action.label, 'filter')
        : mapActive(state, (d) => ({ ...d, dirty: true, ...apply(d) }))
    }
    case 'DELETE_SMART_FILTER':
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) =>
            l.id === action.layerId
              ? { ...l, smartFilters: (l.smartFilters ?? []).filter((f) => f.id !== action.filterId) }
              : l,
          ),
        }),
        '스마트 필터 삭제',
        'filter',
      )
    case 'REORDER_SMART_FILTER':
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) => {
            if (l.id !== action.layerId) return l
            const list = [...(l.smartFilters ?? [])]
            if (action.from < 0 || action.from >= list.length) return l
            const [moved] = list.splice(action.from, 1)
            list.splice(Math.max(0, Math.min(list.length, action.to)), 0, moved)
            return { ...l, smartFilters: list }
          }),
        }),
        '스마트 필터 순서 변경',
        'filter',
      )
    case 'TOGGLE_FILTERS_EXPAND':
      return mapActive(state, (d) => ({
        ...d,
        layers: d.layers.map((l) =>
          l.id === action.layerId ? { ...l, filtersExpanded: !l.filtersExpanded } : l,
        ),
      }))
    case 'MOVE_ACTIVE': {
      // 드래그 중 실시간 이동 (히스토리 미기록). 선택된 이동 가능 레이어들 대상.
      return mapActive(state, (d) => {
        const selectedMovable = d.layers.filter((l) => l.selected && isMovable(l))
        const targets =
          selectedMovable.length > 0
            ? new Set(selectedMovable.map((l) => l.id))
            : (() => {
                const a = d.layers.find((l) => l.id === d.activeLayerId)
                return a && isMovable(a) ? new Set([a.id]) : new Set<string>()
              })()
        if (targets.size === 0) return d
        return {
          ...d,
          dirty: true,
          layers: d.layers.map((l) =>
            targets.has(l.id) ? { ...l, x: l.x + action.dx, y: l.y + action.dy } : l,
          ),
        }
      })
    }
    case 'APPLY_LAYERS':
      // 변형/브러시/마스크 페인트 커밋: 새 레이어로 교체 후 History 1개 기록
      return {
        ...state,
        documents: state.documents.map((d) =>
          d.id === action.id
            ? pushHistory(
                { ...d, layers: action.layers, dirty: true },
                action.label,
                action.historyType ?? 'transform',
              )
            : d,
        ),
      }
    case 'ADD_ADJUSTMENT_LAYER':
      return editActive(
        state,
        (d) => {
          const layer = createAdjustmentLayer(action.adjustment, d.layers, d.width, d.height)
          const activeIdx = d.layers.findIndex((l) => l.id === d.activeLayerId)
          const insertAt = activeIdx < 0 ? 0 : activeIdx
          const layers = [...d.layers]
          layers.splice(insertAt, 0, layer)
          return {
            layers: pinBackground(layers).map((l) => ({
              ...l,
              selected: l.id === layer.id,
            })),
            activeLayerId: layer.id,
            // Photoshop처럼 생성 직후 Mask 가 선택된다
            activeTarget: 'mask' as MaskTarget,
          }
        },
        `${ADJUSTMENT_LABELS[action.adjustment]} 레이어 추가`,
        'adjustment',
      )
    case 'SET_ADJUSTMENT_SETTINGS':
      // Slider Drag 중 실시간 Preview — History 미기록
      return mapActive(state, (d) => ({
        ...d,
        dirty: true,
        layers: d.layers.map((l) =>
          l.id === action.id
            ? { ...l, adjustmentSettings: { ...l.adjustmentSettings, ...action.settings } }
            : l,
        ),
      }))
    case 'COMMIT_ADJUSTMENT':
      // mouseup 시 현재 상태를 History 1개로 기록
      return editActive(state, () => ({}), action.label, 'adjustment')
    case 'ADD_LAYER_MASK':
      return editActive(
        state,
        (d) => {
          const id = action.id ?? d.activeLayerId
          const target = d.layers.find((l) => l.id === id)
          if (!target || target.mask || target.type === 'group' || target.type === 'background')
            return {}
          const w = Math.max(1, Math.round(target.width || d.width))
          const h = Math.max(1, Math.round(target.height || d.height))
          return {
            layers: d.layers.map((l) =>
              l.id === id
                ? { ...l, mask: createLayerMask(w, h), ...MASK_DEFAULTS }
                : l,
            ),
            activeLayerId: id,
            activeTarget: 'mask' as MaskTarget,
          }
        },
        '레이어 마스크 추가',
        'mask',
      )
    case 'DELETE_LAYER_MASK':
      return editActive(
        state,
        (d) => {
          const id = action.id ?? d.activeLayerId
          const target = d.layers.find((l) => l.id === id)
          if (!target?.mask) return {}
          return {
            layers: d.layers.map((l) => (l.id === id ? { ...l, mask: undefined } : l)),
            activeTarget: 'bitmap' as MaskTarget,
          }
        },
        '레이어 마스크 삭제',
        'mask',
      )
    case 'TOGGLE_MASK_ENABLED': {
      const doc = state.documents.find((d) => d.id === state.activeDocumentId)
      const layer = doc?.layers.find((l) => l.id === action.id)
      if (!layer?.mask) return state
      const enabling = !layer.maskEnabled
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) =>
            l.id === action.id && l.mask
              ? { ...l, maskEnabled: enabling, mask: { ...l.mask, enabled: enabling } }
              : l,
          ),
        }),
        enabling ? '레이어 마스크 사용' : '레이어 마스크 사용 안 함',
        'mask',
      )
    }
    case 'TOGGLE_MASK_LINK':
      return editActive(
        state,
        (d) => ({
          layers: d.layers.map((l) =>
            l.id === action.id && l.mask ? { ...l, maskLinked: !l.maskLinked } : l,
          ),
        }),
        '레이어 마스크 연결 전환',
        'mask',
      )
    case 'SET_ACTIVE_TARGET':
      // Bitmap 썸네일로 돌아오면 Mask Solo 보기도 해제 (편집 대상 전환은 History 미기록)
      return {
        ...mapActive(state, (d) => ({ ...d, activeTarget: action.target })),
        maskSolo: action.target === 'bitmap' ? false : state.maskSolo,
      }
    case 'TOGGLE_MASK_SOLO':
      return { ...state, maskSolo: !state.maskSolo }
    case 'TOGGLE_MASK_OVERLAY':
      return { ...state, maskOverlay: !state.maskOverlay }
    case 'COMMIT_MOVE':
      // 드래그/화살표 이동 종료 시 현재(이동 후) 상태를 History 1개로 기록
      return editActive(state, () => ({}), '레이어 이동', 'layer')
    case 'UNDO':
      return mapActive(state, (d) => {
        if (d.historyIndex <= 0) return d
        const i = d.historyIndex - 1
        return restoreSnapshot(d, i)
      })
    case 'REDO':
      return mapActive(state, (d) => {
        if (d.historyIndex >= d.history.length - 1) return d
        return restoreSnapshot(d, d.historyIndex + 1)
      })
    case 'GO_HISTORY':
      return mapActive(state, (d) =>
        restoreSnapshot(d, Math.min(d.history.length - 1, Math.max(0, action.index))),
      )
    case 'CLEAR_HISTORY':
      return mapActive(state, (d) => {
        const cur = d.history[d.historyIndex]
        return cur ? { ...d, history: [cur], historyIndex: 0 } : d
      })
    case 'SET_SELECTION':
      // 선택 확정 (생성/전체/반전/해제) → History 1개 기록
      return editActive(state, () => ({ selection: action.selection }), action.label, 'selection')
    case 'MOVE_SELECTION':
      // 드래그 중 실시간 이동 (History 미기록)
      return mapActive(state, (d) => ({ ...d, selection: action.selection }))
    case 'COMMIT_SELECTION':
      return editActive(state, () => ({}), action.label, 'selection')
    case 'TOGGLE_TIMELINE':
      return { ...state, timelineEnabled: !state.timelineEnabled }
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying }
    case 'SET_PATHS':
      // Path 편집 실시간 반영 (드래그/빌드 중) — History 미기록
      return mapActive(state, (d) => ({
        ...d,
        dirty: true,
        paths: action.paths,
        activePathId:
          action.activePathId !== undefined ? action.activePathId : d.activePathId ?? null,
      }))
    case 'COMMIT_PATHS':
      // 제스처 종료 시 현재 Path 상태를 History 1개로 기록
      return editActive(state, () => ({}), action.label, 'path')
    case 'APPLY_PATHS':
      // Path 변경 + History 1개 (Create/Delete Anchor/Convert/Close 등 이산 동작)
      return editActive(
        state,
        (d) => ({
          paths: action.paths,
          activePathId:
            action.activePathId !== undefined ? action.activePathId : d.activePathId ?? null,
        }),
        action.label,
        'path',
      )
    case 'SELECT_PATH':
      return mapActive(state, (d) => ({ ...d, activePathId: action.id }))
    case 'DELETE_PATH':
      return editActive(
        state,
        (d) => {
          const paths = (d.paths ?? []).filter((p) => p.id !== action.id)
          return {
            paths,
            activePathId: d.activePathId === action.id ? null : d.activePathId ?? null,
          }
        },
        '패스 삭제',
        'path',
      )
    case 'RENAME_PATH':
      return editActive(
        state,
        (d) => ({
          paths: (d.paths ?? []).map((p) =>
            p.id === action.id ? { ...p, name: action.name || p.name } : p,
          ),
        }),
        '패스 이름 변경',
        'path',
      )
    case 'TOGGLE_PATH_VISIBILITY':
      return mapActive(state, (d) => ({
        ...d,
        paths: (d.paths ?? []).map((p) =>
          p.id === action.id ? { ...p, visible: !p.visible } : p,
        ),
      }))
    case 'ADD_DOCUMENT':
      return {
        ...state,
        documents: [...state.documents, action.document],
        activeDocumentId: action.document.id,
      }
    case 'SET_ACTIVE_DOCUMENT':
      return { ...state, activeDocumentId: action.id }
    case 'CLOSE_DOCUMENT': {
      const remaining = state.documents.filter((d) => d.id !== action.id)
      const activeId =
        state.activeDocumentId === action.id
          ? (remaining[remaining.length - 1]?.id ?? null)
          : state.activeDocumentId
      return { ...state, documents: remaining, activeDocumentId: activeId }
    }
    case 'UPDATE_DOCUMENT':
      return {
        ...state,
        documents: state.documents.map((d) =>
          d.id === action.id ? { ...d, ...action.patch } : d,
        ),
      }
    case 'ADD_HISTORY':
      return editActive(state, () => ({}), action.entry, 'document')
    default:
      return state
  }
}

const StateContext = createContext<EditorState | null>(null)
const DispatchContext = createContext<Dispatch<Action> | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useEditor(): EditorState {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}

export function useActiveDocument(): OpenDocument | null {
  const state = useEditor()
  return state.documents.find((d) => d.id === state.activeDocumentId) ?? null
}

export function useEditorDispatch(): Dispatch<Action> {
  const ctx = useContext(DispatchContext)
  if (!ctx) throw new Error('useEditorDispatch must be used within EditorProvider')
  return ctx
}
