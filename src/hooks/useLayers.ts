import { useCallback } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import type { AdjustmentSettings, AdjustmentType, BlendMode, Layer, MaskTarget } from '../types'
import { rasterizeShape } from '../engine/shapeEngine'
import { rasterizeText } from '../engine/textEngine'
import { textToShapeSpec, textToWorkPaths } from '../engine/textConvert'
import { getSmartComposite } from '../engine/smartEngine'
import { createRasterLayer } from '../engine/layerEngine'
import { createSmartFilter } from '../engine/smartFilterEngine'
import type { SmartFilter, SmartFilterType } from '../types'

/**
 * Layer Store 파사드. React 컴포넌트는 이 훅만 사용하고,
 * 실제 상태 변경은 reducer + layerEngine(순수 로직)에서 처리된다.
 */
export function useLayers() {
  const doc = useActiveDocument()
  const { documents } = useEditor()
  const dispatch = useEditorDispatch()

  const layers: Layer[] = doc?.layers ?? []
  const activeLayerId = doc?.activeLayerId ?? ''
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? null
  const selectedLayers = layers.filter((l) => l.selected)
  /** 활성 레이어에서 편집 중인 대상 — 마스크가 없으면 항상 bitmap */
  const activeTarget: MaskTarget =
    doc?.activeTarget === 'mask' && activeLayer?.mask ? 'mask' : 'bitmap'

  const createLayer = useCallback(() => dispatch({ type: 'NEW_LAYER' }), [dispatch])
  const deleteLayer = useCallback(
    (id?: string) => dispatch({ type: 'DELETE_LAYER', id }),
    [dispatch],
  )
  /**
   * 선택된 모든 Layer 삭제 — Delete 키 / 휴지통 / 컨텍스트 메뉴가 공용으로 쓰는 단일 함수.
   * 대상은 reducer 가 selected 플래그 기준으로 결정한다 (Background/Locked 제외, 그룹 하위 포함).
   */
  const deleteSelectedLayers = useCallback(() => {
    if (import.meta.env.DEV) {
      const selected = doc?.layers.filter((l) => l.selected) ?? []
      // eslint-disable-next-line no-console
      console.log('[deleteSelectedLayers]', {
        activeLayer: doc?.activeLayerId,
        selectedCount: selected.length,
        selectedIds: selected.map((l) => l.id),
      })
    }
    dispatch({ type: 'DELETE_LAYER' })
  }, [dispatch, doc])
  const duplicateLayer = useCallback(
    (id?: string) => dispatch({ type: 'DUPLICATE_LAYER', id }),
    [dispatch],
  )
  const renameLayer = useCallback(
    (id: string, name: string) => dispatch({ type: 'RENAME_LAYER', id, name }),
    [dispatch],
  )
  const moveLayer = useCallback(
    (from: number, to: number) => dispatch({ type: 'REORDER_LAYER', from, to }),
    [dispatch],
  )
  const toggleVisible = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_LAYER_VISIBILITY', id }),
    [dispatch],
  )
  const toggleLock = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_LAYER_LOCK', id }),
    [dispatch],
  )
  const changeOpacity = useCallback(
    (id: string, opacity: number) => dispatch({ type: 'SET_LAYER_OPACITY', id, opacity }),
    [dispatch],
  )
  const changeFill = useCallback(
    (id: string, fill: number) => dispatch({ type: 'SET_LAYER_FILL', id, fill }),
    [dispatch],
  )
  const changeBlendMode = useCallback(
    (id: string, blendMode: BlendMode) => dispatch({ type: 'SET_LAYER_BLEND', id, blendMode }),
    [dispatch],
  )
  const selectLayer = useCallback(
    (id: string, mode: 'single' | 'toggle' | 'range' = 'single') => {
      if (mode === 'toggle') dispatch({ type: 'TOGGLE_SELECT_LAYER', id })
      else if (mode === 'range') dispatch({ type: 'RANGE_SELECT_LAYER', id })
      else dispatch({ type: 'SELECT_LAYER', id })
    },
    [dispatch],
  )
  const selectAll = useCallback(() => dispatch({ type: 'SELECT_ALL_LAYERS' }), [dispatch])
  const groupSelected = useCallback(() => dispatch({ type: 'GROUP_SELECTED' }), [dispatch])
  const toggleCollapse = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_COLLAPSE', id }),
    [dispatch],
  )
  const mergeDown = useCallback(
    (id: string) => dispatch({ type: 'MERGE_DOWN', id }),
    [dispatch],
  )
  const rasterize = useCallback(
    (id: string) => {
      // Shape/Text Layer 는 Vector 를 Bitmap 으로 구워서 일반 Raster 로 변환
      const layer = doc?.layers.find((l) => l.id === id)
      if (doc && layer?.type === 'shape' && layer.shape) {
        const bitmap = rasterizeShape(layer, doc.width, doc.height)
        dispatch({
          type: 'UPDATE_SHAPE',
          id,
          patch: { bitmap, shape: undefined, type: 'raster', x: 0, y: 0, width: doc.width, height: doc.height, rotation: 0 },
          label: '모양 래스터화',
        })
        return
      }
      if (doc && layer?.type === 'text' && layer.text) {
        const bitmap = rasterizeText(layer, doc.width, doc.height)
        dispatch({
          type: 'UPDATE_TEXT',
          id,
          patch: { bitmap, text: undefined, type: 'raster', x: 0, y: 0, width: doc.width, height: doc.height, rotation: 0 },
          label: '문자 래스터화',
        })
        return
      }
      if (doc && layer?.type === 'smartObject' && layer.smartDocId) {
        // Smart Object 렌더 결과를 Bitmap 으로 굽는다 (Transform 반영, 회전 제외)
        const resolve = (docId: string) => documents.find((d) => d.id === docId)
        const sd = resolve(layer.smartDocId)
        if (!sd) return
        const src = getSmartComposite(sd, resolve)
        const out = document.createElement('canvas')
        out.width = doc.width
        out.height = doc.height
        const ctx = out.getContext('2d')
        if (ctx) ctx.drawImage(src, layer.x, layer.y, layer.width || doc.width, layer.height || doc.height)
        dispatch({
          type: 'APPLY_LAYERS',
          id: doc.id,
          layers: doc.layers.map((l) =>
            l.id === id
              ? { ...l, type: 'raster', bitmap: out, smartDocId: undefined, x: 0, y: 0, width: doc.width, height: doc.height, rotation: 0 }
              : l,
          ),
          label: '고급 개체 래스터화',
          historyType: 'layer',
        })
        return
      }
      dispatch({ type: 'SET_LAYER_TYPE', id, layerType: 'raster' })
    },
    [dispatch, doc, documents],
  )
  /** 선택 레이어(들)를 Smart Object 로 변환 */
  const convertToSmartObject = useCallback(
    () => dispatch({ type: 'CONVERT_TO_SMART_OBJECT' }),
    [dispatch],
  )
  // ── Smart Filter ────────────────────────────────────────────
  /** Smart Filter 추가 (반환: 새 filter id) */
  const addSmartFilter = useCallback(
    (layerId: string, type: SmartFilterType) => {
      const filter = createSmartFilter(type)
      dispatch({ type: 'ADD_SMART_FILTER', layerId, filter })
      return filter.id
    },
    [dispatch],
  )
  const setSmartFilter = useCallback(
    (layerId: string, filterId: string, patch: Partial<SmartFilter>, label?: string) =>
      dispatch({ type: 'SET_SMART_FILTER', layerId, filterId, patch, label }),
    [dispatch],
  )
  const deleteSmartFilter = useCallback(
    (layerId: string, filterId: string) => dispatch({ type: 'DELETE_SMART_FILTER', layerId, filterId }),
    [dispatch],
  )
  const reorderSmartFilter = useCallback(
    (layerId: string, from: number, to: number) =>
      dispatch({ type: 'REORDER_SMART_FILTER', layerId, from, to }),
    [dispatch],
  )
  const toggleFiltersExpand = useCallback(
    (layerId: string) => dispatch({ type: 'TOGGLE_FILTERS_EXPAND', layerId }),
    [dispatch],
  )
  /** Smart Object 내용 편집 — SmartDocument 를 탭으로 연다 */
  const editSmartObject = useCallback(
    (id: string) => {
      const layer = doc?.layers.find((l) => l.id === id)
      if (layer?.type === 'smartObject' && layer.smartDocId) {
        dispatch({ type: 'OPEN_SMART_OBJECT', docId: layer.smartDocId })
      }
    },
    [dispatch, doc],
  )
  /** Smart Object 내용 교체 — 파일 선택 → SmartDocument 내용 교체 (Transform 유지) */
  const replaceSmartContents = useCallback(
    (id: string) => {
      const layer = doc?.layers.find((l) => l.id === id)
      if (!doc || layer?.type !== 'smartObject' || !layer.smartDocId) return
      const smartDocId = layer.smartDocId
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const img = new Image()
        img.onload = () => {
          const w = img.naturalWidth || img.width
          const h = img.naturalHeight || img.height
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          canvas.getContext('2d')?.drawImage(img, 0, 0)
          const imgLayer = createRasterLayer(file.name.replace(/\.[^.]+$/, ''), w, h)
          imgLayer.type = 'image'
          imgLayer.bitmap = canvas
          dispatch({
            type: 'REPLACE_SMART_CONTENTS',
            docId: smartDocId,
            layerId: id,
            layers: [imgLayer],
            width: w,
            height: h,
            name: imgLayer.name,
          })
          URL.revokeObjectURL(img.src)
        }
        img.src = URL.createObjectURL(file)
      }
      input.click()
    },
    [dispatch, doc],
  )
  /** Type Layer → Shape Layer (글자 윤곽을 벡터 도형으로) */
  const convertToShape = useCallback(
    (id: string) => {
      const layer = doc?.layers.find((l) => l.id === id)
      if (!doc || layer?.type !== 'text' || !layer.text) return
      const res = textToShapeSpec(layer, doc.width, doc.height)
      if (!res) return
      dispatch({
        type: 'UPDATE_TEXT',
        id,
        patch: {
          type: 'shape',
          text: undefined,
          shape: res.spec,
          x: res.x,
          y: res.y,
          width: res.width,
          height: res.height,
          rotation: 0,
        },
        label: '모양으로 변환',
      })
    },
    [dispatch, doc],
  )
  /** Type Layer → Work Path (Convert to Path / Outline) — Type Layer 는 유지 */
  const createWorkPath = useCallback(
    (id: string) => {
      const layer = doc?.layers.find((l) => l.id === id)
      if (!doc || layer?.type !== 'text' || !layer.text) return
      const paths = textToWorkPaths(layer, doc.width, doc.height)
      if (!paths.length) return
      dispatch({
        type: 'APPLY_PATHS',
        paths: [...(doc.paths ?? []), ...paths],
        activePathId: paths[0].id,
        label: '작업 패스 만들기',
      })
    },
    [dispatch, doc],
  )
  const addLayerMask = useCallback(
    (id?: string) => dispatch({ type: 'ADD_LAYER_MASK', id }),
    [dispatch],
  )
  const deleteLayerMask = useCallback(
    (id?: string) => dispatch({ type: 'DELETE_LAYER_MASK', id }),
    [dispatch],
  )
  const toggleMaskEnabled = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_MASK_ENABLED', id }),
    [dispatch],
  )
  const toggleMaskLink = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_MASK_LINK', id }),
    [dispatch],
  )
  const setActiveTarget = useCallback(
    (target: MaskTarget) => dispatch({ type: 'SET_ACTIVE_TARGET', target }),
    [dispatch],
  )
  const toggleMaskSolo = useCallback(() => dispatch({ type: 'TOGGLE_MASK_SOLO' }), [dispatch])
  const addAdjustmentLayer = useCallback(
    (adjustment: AdjustmentType) => dispatch({ type: 'ADD_ADJUSTMENT_LAYER', adjustment }),
    [dispatch],
  )
  const setAdjustmentSettings = useCallback(
    (id: string, settings: AdjustmentSettings) =>
      dispatch({ type: 'SET_ADJUSTMENT_SETTINGS', id, settings }),
    [dispatch],
  )
  const commitAdjustment = useCallback(
    (label: string) => dispatch({ type: 'COMMIT_ADJUSTMENT', label }),
    [dispatch],
  )

  return {
    layers,
    activeLayerId,
    activeLayer,
    selectedLayers,
    activeTarget,
    createLayer,
    deleteLayer,
    deleteSelectedLayers,
    duplicateLayer,
    renameLayer,
    moveLayer,
    toggleVisible,
    toggleLock,
    changeOpacity,
    changeFill,
    changeBlendMode,
    selectLayer,
    selectAll,
    groupSelected,
    toggleCollapse,
    mergeDown,
    rasterize,
    convertToSmartObject,
    editSmartObject,
    replaceSmartContents,
    addSmartFilter,
    setSmartFilter,
    deleteSmartFilter,
    reorderSmartFilter,
    toggleFiltersExpand,
    convertToShape,
    createWorkPath,
    addLayerMask,
    deleteLayerMask,
    toggleMaskEnabled,
    toggleMaskLink,
    setActiveTarget,
    toggleMaskSolo,
    addAdjustmentLayer,
    setAdjustmentSettings,
    commitAdjustment,
  }
}
