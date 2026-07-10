import { useCallback, useRef } from 'react'
import { useActiveDocument, useEditorDispatch } from '../state'
import { useBrushStore } from '../store/brushStore'
import { useFilterStore } from '../store/filterStore'
import { useOpenStore } from '../store/openStore'
import {
  FILTER_LABELS,
  filterEngine,
  type FilterContext,
  type FilterParams,
  type FilterType,
} from '../engine/filterEngine'
import type { Layer, MaskTarget } from '../types'

// Brush 스트로크 프리뷰 version 과 충돌하지 않는 전역 카운터
let previewSeq = 1_000_000_000

/**
 * Filter 적용 파사드.
 * - Preview: brushStore.preview 치환 메커니즘 재사용 → Layer 는 절대 수정하지 않음
 * - OK: Layer Bitmap 또는 Mask Bitmap 교체 + History 1개 (RenderEngine 이 화면 갱신)
 */
export function useFilters() {
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { setPreview } = useBrushStore()
  const { setLastFilter, setStatus } = useFilterStore()
  const { toast } = useOpenStore()

  const docRef = useRef(doc)
  docRef.current = doc

  /** 현재 적용 대상 (Active Layer + Bitmap/Mask Target) */
  const resolveTarget = useCallback((): {
    layer: Layer
    target: MaskTarget
  } | null => {
    const d = docRef.current
    if (!d) return null
    const layer = d.layers.find((l) => l.id === d.activeLayerId)
    if (!layer) return null
    const target: MaskTarget = d.activeTarget === 'mask' && layer.mask ? 'mask' : 'bitmap'
    return { layer, target }
  }, [])

  /** Filter 적용 가능 여부 — 불가 시 이유 반환 */
  const canApply = useCallback((): { ok: boolean; reason?: string } => {
    const d = docRef.current
    const rt = resolveTarget()
    if (!d || !rt) return { ok: false, reason: '적용할 레이어가 없습니다.' }
    const { layer, target } = rt
    if (!layer.visible) return { ok: false, reason: '숨겨진 레이어에는 적용할 수 없습니다.' }
    if (layer.type === 'group') return { ok: false, reason: '그룹에는 적용할 수 없습니다.' }
    if (layer.type === 'adjustment' && target !== 'mask')
      return { ok: false, reason: '조정 레이어에는 적용할 수 없습니다.' }
    if (layer.locked) return { ok: false, reason: 'Layer is locked.' }
    if (target === 'bitmap') {
      if (layer.type === 'background')
        return { ok: false, reason: 'Layer is locked.' }
      if (!layer.bitmap) return { ok: false, reason: '픽셀이 없는 레이어입니다.' }
    }
    return { ok: true }
  }, [resolveTarget])

  /** 원본 소스 캔버스 (레이어 크기로 정규화) — 원본은 절대 수정하지 않는다 */
  const getSource = useCallback((): {
    source: HTMLCanvasElement
    layer: Layer
    target: MaskTarget
    context: FilterContext
  } | null => {
    const d = docRef.current
    const rt = resolveTarget()
    if (!d || !rt) return null
    const { layer, target } = rt
    let source: HTMLCanvasElement
    let w: number
    let h: number
    if (target === 'mask') {
      w = layer.mask!.bitmap.width
      h = layer.mask!.bitmap.height
      source = document.createElement('canvas')
      source.width = w
      source.height = h
      source.getContext('2d')!.drawImage(layer.mask!.bitmap, 0, 0)
    } else {
      w = Math.max(1, Math.round(layer.width || d.width))
      h = Math.max(1, Math.round(layer.height || d.height))
      source = document.createElement('canvas')
      source.width = w
      source.height = h
      if (layer.bitmap) source.getContext('2d')!.drawImage(layer.bitmap, 0, 0, w, h)
    }
    const context: FilterContext = {
      documentId: d.id,
      layerId: layer.id,
      target,
      selectionMask: d.selection.active ? d.selection.mask : null,
      docWidth: d.width,
      docHeight: d.height,
      layerX: Math.round(layer.x),
      layerY: Math.round(layer.y),
      width: w,
      height: h,
    }
    return { source, layer, target, context }
  }, [resolveTarget])

  /** Filter 계산만 수행 (Layer/Store 미변경) — Dialog 내부 Preview Canvas 용 */
  const computePreview = useCallback(
    (type: FilterType, params: FilterParams) => {
      const src = getSource()
      if (!src) return null
      const canvas = filterEngine.previewFilter(src.source, type, params, src.context)
      return {
        canvas,
        source: src.source,
        layer: src.layer,
        target: src.target,
        hasSelection: !!src.context.selectionMask,
      }
    },
    [getSource],
  )

  /** 계산 결과를 문서 화면 Preview 로 표시 (Layer 는 절대 수정하지 않음) */
  const pushPreview = useCallback(
    (r: NonNullable<ReturnType<typeof computePreview>>, type: FilterType) => {
      previewSeq += 1
      setPreview({
        active: true,
        layerId: r.layer.id,
        target: r.target,
        canvas: r.canvas,
        version: previewSeq,
      })
      setStatus(
        `${FILTER_LABELS[type]} 미리보기 중${r.hasSelection ? ' · 선택 영역 내' : ''}${
          r.target === 'mask' ? ' · 레이어 마스크' : ''
        }`,
      )
    },
    [setPreview, setStatus],
  )

  /** Dialog Preview — 계산 + 화면 표시 */
  const previewFilter = useCallback(
    (type: FilterType, params: FilterParams) => {
      const r = computePreview(type, params)
      if (r) pushPreview(r, type)
      return r
    },
    [computePreview, pushPreview],
  )

  /** Preview 해제 (Cancel / Preview 체크 해제) */
  const clearPreview = useCallback(
    (canceled = false) => {
      previewSeq += 1
      setPreview({ active: false, layerId: null, target: 'bitmap', canvas: null, version: previewSeq })
      if (canceled) setStatus('필터 취소됨')
    },
    [setPreview, setStatus],
  )

  /** OK — 실제 Layer Bitmap/Mask Bitmap 교체 + History 1개 */
  const applyFilter = useCallback(
    (type: FilterType, params: FilterParams): boolean => {
      const d = docRef.current
      const check = canApply()
      if (!check.ok) {
        toast(check.reason ?? '필터를 적용할 수 없습니다.', 'error')
        return false
      }
      const src = getSource()
      if (!d || !src) return false
      setStatus(`${FILTER_LABELS[type]} 적용 중...`)
      const result = filterEngine.applyFilter(src.source, type, params, src.context)
      const committed = result.bitmap
      if (src.target === 'mask') {
        dispatch({
          type: 'APPLY_LAYERS',
          id: d.id,
          layers: d.layers.map((l) =>
            l.id === src.layer.id && l.mask ? { ...l, mask: { ...l.mask, bitmap: committed } } : l,
          ),
          label: FILTER_LABELS[type],
          historyType: 'filter',
        })
      } else {
        dispatch({
          type: 'APPLY_LAYERS',
          id: d.id,
          layers: d.layers.map((l) =>
            l.id === src.layer.id ? { ...l, bitmap: committed } : l,
          ),
          label: FILTER_LABELS[type],
          historyType: 'filter',
        })
      }
      clearPreview()
      setLastFilter({ type, params })
      setStatus(
        `필터 적용됨: ${FILTER_LABELS[type]}${src.context.selectionMask ? ' · 선택 영역 내' : ''}${
          src.target === 'mask' ? ' · 레이어 마스크' : ''
        }`,
      )
      return true
    },
    [canApply, getSource, dispatch, clearPreview, setLastFilter, setStatus, toast],
  )

  return {
    canApply,
    getSource,
    computePreview,
    pushPreview,
    previewFilter,
    clearPreview,
    applyFilter,
    resolveTarget,
  }
}
