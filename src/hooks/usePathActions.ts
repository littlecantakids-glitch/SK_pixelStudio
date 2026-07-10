import { useCallback } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useBrushStore } from '../store/brushStore'
import { useOpenStore } from '../store/openStore'
import type { Layer, SelectionState, VectorPath } from '../types'
import { boundsOf } from '../engine/selectionEngine'
import { fillPathOnCanvas, pathToMask, strokePathOnCanvas } from '../engine/pathEngine'
import type { BrushOptions } from '../engine/brushEngine'

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

/** Fill/Stroke 대상이 될 수 있는 레이어인지 */
function paintable(layer: Layer | undefined): boolean {
  return (
    !!layer &&
    layer.type !== 'group' &&
    layer.type !== 'adjustment' &&
    layer.type !== 'background' &&
    !layer.locked
  )
}

/**
 * Path 우클릭/옵션바 동작 — Make Selection / Fill Path / Stroke Path.
 * Selection Engine · Brush Engine 과 연동하고 결과는 History 1개로 기록한다.
 */
export function usePathActions() {
  const doc = useActiveDocument()
  const { foregroundColor } = useEditor()
  const dispatch = useEditorDispatch()
  const brush = useBrushStore()
  const { toast } = useOpenStore()

  const getActive = useCallback((): VectorPath | null => {
    if (!doc?.activePathId) return null
    return (doc.paths ?? []).find((p) => p.id === doc.activePathId) ?? null
  }, [doc])

  const makeSelection = useCallback(() => {
    if (!doc) return
    const path = getActive()
    if (!path || path.points.length < 2) {
      toast('선택 영역을 만들 패스가 없습니다.', 'error')
      return
    }
    const mask = pathToMask(path, doc.width, doc.height)
    const bounds = boundsOf(mask, doc.width, doc.height)
    const selection: SelectionState = {
      active: true,
      mode: 'lasso',
      operation: 'new',
      bounds,
      mask,
      width: doc.width,
      height: doc.height,
      feather: 0,
      antiAlias: true,
    }
    dispatch({ type: 'SET_SELECTION', selection, label: '선택 영역 만들기' })
  }, [doc, getActive, dispatch, toast])

  const fillPath = useCallback(() => {
    if (!doc) return
    const path = getActive()
    if (!path || path.points.length < 2) {
      toast('칠할 패스가 없습니다.', 'error')
      return
    }
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId)
    if (!paintable(layer)) {
      toast('Layer is locked.', 'error')
      return
    }
    const w = Math.max(1, Math.round(layer!.width || doc.width))
    const h = Math.max(1, Math.round(layer!.height || doc.height))
    const base = makeCanvas(w, h)
    const ctx = base.getContext('2d')!
    if (layer!.bitmap) ctx.drawImage(layer!.bitmap, 0, 0, w, h)
    fillPathOnCanvas(ctx, path, foregroundColor, layer!.x, layer!.y)
    dispatch({
      type: 'APPLY_LAYERS',
      id: doc.id,
      layers: doc.layers.map((l) => (l.id === layer!.id ? { ...l, bitmap: base } : l)),
      label: '패스 칠',
      historyType: 'path',
    })
  }, [doc, getActive, foregroundColor, dispatch, toast])

  const strokePath = useCallback(() => {
    if (!doc) return
    const path = getActive()
    if (!path || path.points.length < 2) {
      toast('선을 그릴 패스가 없습니다.', 'error')
      return
    }
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId)
    if (!paintable(layer)) {
      toast('Layer is locked.', 'error')
      return
    }
    const w = Math.max(1, Math.round(layer!.width || doc.width))
    const h = Math.max(1, Math.round(layer!.height || doc.height))
    const base = makeCanvas(w, h)
    const ctx = base.getContext('2d')!
    if (layer!.bitmap) ctx.drawImage(layer!.bitmap, 0, 0, w, h)
    const opts: BrushOptions = {
      size: brush.size,
      hardness: brush.hardness,
      flow: 100,
      color: foregroundColor,
      composite: 'source-over',
      pressure: 1,
    }
    strokePathOnCanvas(ctx, path, opts, layer!.x, layer!.y)
    dispatch({
      type: 'APPLY_LAYERS',
      id: doc.id,
      layers: doc.layers.map((l) => (l.id === layer!.id ? { ...l, bitmap: base } : l)),
      label: '패스 획',
      historyType: 'path',
    })
  }, [doc, getActive, brush.size, brush.hardness, foregroundColor, dispatch, toast])

  const deletePath = useCallback(() => {
    const path = getActive()
    if (!path) return
    dispatch({ type: 'DELETE_PATH', id: path.id })
  }, [getActive, dispatch])

  return { makeSelection, fillPath, strokePath, deletePath, hasActivePath: !!getActive() }
}
