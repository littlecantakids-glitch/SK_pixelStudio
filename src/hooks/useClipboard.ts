import { useCallback } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useClipboardStore, type ClipboardData } from '../store/clipboardStore'
import { useOpenStore } from '../store/openStore'
import type { Layer, OpenDocument, Rect } from '../types'
import {
  eraseSelectionPixels,
  extractComposite,
  extractLayer,
  extractMask,
  extractSelection,
  type Extracted,
} from '../engine/clipboardEngine'
import { boundsOf, boundaryContours } from '../engine/selectionEngine'
import { createRasterLayer, genId, nextLayerName } from '../engine/layerEngine'

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  c.getContext('2d')!.drawImage(src, 0, 0)
  return c
}

function activeLayerOf(doc: OpenDocument): Layer | undefined {
  return doc.layers.find((l) => l.id === doc.activeLayerId)
}

/** Bitmap 편집(칠/획/삭제) 가능한 레이어인지 */
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
 * Clipboard & Pixel Editing — Copy/Cut/Paste/Copy Merged/Paste In Place/Duplicate/Clear/Fill/Stroke.
 * 설계 원칙: Clipboard 는 Document 와 독립 · Copy 는 History 없음 · Paste 는 항상 새 Raster Layer ·
 * Tool 은 Canvas 직접 수정 금지(LayerStore 만 수정, RenderEngine 이 갱신).
 */
export function useClipboard() {
  const doc = useActiveDocument()
  const { foregroundColor } = useEditor()
  const dispatch = useEditorDispatch()
  const clip = useClipboardStore()
  const { toast } = useOpenStore()

  const maskTarget = (d: OpenDocument, layer: Layer | undefined) =>
    d.activeTarget === 'mask' && !!layer?.mask

  const store = useCallback(
    (ex: Extracted, d: OpenDocument, fromMask: boolean) => {
      const data: ClipboardData = {
        type: 'pixels',
        bitmap: ex.canvas,
        bounds: ex.bounds,
        width: ex.bounds.width,
        height: ex.bounds.height,
        fromMask,
        sourceDocumentId: d.id,
        timestamp: Date.now(),
      }
      clip.setData(data)
    },
    [clip],
  )

  /** 복사할 픽셀 추출 (Selection/전체/Mask/Composite fallback) */
  const grab = useCallback(
    (d: OpenDocument, layer: Layer): Extracted | null => {
      const sel = d.selection.active && d.selection.mask ? d.selection.mask : null
      if (maskTarget(d, layer)) return extractMask(d, layer, sel)
      if (sel) return extractSelection(d, layer, sel) ?? extractComposite(d, sel)
      return extractLayer(layer) ?? extractComposite(d, null)
    },
    [],
  )

  // ── Copy ──────────────────────────────────────────────────────
  const copy = useCallback(() => {
    if (!doc) return
    const layer = activeLayerOf(doc)
    if (!layer) return
    if (!layer.visible) {
      toast('숨겨진 레이어는 복사할 수 없습니다.', 'error')
      return
    }
    const sel = doc.selection.active && doc.selection.mask ? doc.selection.mask : null
    if (sel) {
      const b = boundsOf(sel, doc.width, doc.height)
      if (b.width <= 0 || b.height <= 0) {
        toast('선택 영역이 비어 있어 복사할 수 없습니다.', 'error')
        return
      }
    }
    // Vector(Type/Shape) / Smart Object Layer 는 선택 영역이 없으면 레이어 자체(참조)를 복사
    // (Smart Object 는 Bitmap 복사 금지 — 같은 SmartDocument 를 참조하는 새 Instance 로 붙여넣는다)
    if (
      !sel &&
      ((layer.type === 'text' && layer.text) ||
        (layer.type === 'shape' && layer.shape) ||
        (layer.type === 'smartObject' && layer.smartDocId))
    ) {
      clip.setData({
        type: 'layer',
        layers: [layer],
        width: Math.round(layer.width),
        height: Math.round(layer.height),
        sourceDocumentId: doc.id,
        timestamp: Date.now(),
      })
      const kindLabel =
        layer.type === 'text' ? '텍스트 레이어 복사' : layer.type === 'shape' ? '모양 레이어 복사' : '고급 개체 복사'
      toast(kindLabel, 'success')
      clip.setStatus(kindLabel)
      return
    }
    const ex = grab(doc, layer)
    if (!ex) {
      toast('복사할 픽셀이 없습니다.', 'error')
      return
    }
    store(ex, doc, maskTarget(doc, layer))
    toast('복사됨', 'success')
    clip.setStatus(`복사됨  ${ex.bounds.width} × ${ex.bounds.height} 픽셀`)
  }, [doc, grab, store, clip, toast])

  // ── Copy Merged (Ctrl+Shift+C) ────────────────────────────────
  const copyMerged = useCallback(() => {
    if (!doc) return
    const sel = doc.selection.active && doc.selection.mask ? doc.selection.mask : null
    const ex = extractComposite(doc, sel)
    if (!ex) {
      toast('복사할 픽셀이 없습니다.', 'error')
      return
    }
    store(ex, doc, false)
    toast('복사 병합', 'success')
    clip.setStatus(`복사 병합  ${ex.bounds.width} × ${ex.bounds.height} 픽셀`)
  }, [doc, store, clip, toast])

  // ── Cut (Ctrl+X) ──────────────────────────────────────────────
  const cut = useCallback(() => {
    if (!doc) return
    const layer = activeLayerOf(doc)
    if (!layer) return
    if (!layer.visible) {
      toast('숨겨진 레이어는 잘라낼 수 없습니다.', 'error')
      return
    }
    const sel = doc.selection.active && doc.selection.mask ? doc.selection.mask : null

    if (sel) {
      if (!paintable(layer) || !layer.bitmap) {
        toast('Layer is locked.', 'error')
        return
      }
      const ex = extractSelection(doc, layer, sel)
      if (!ex) {
        toast('선택 영역이 비어 있습니다.', 'error')
        return
      }
      store(ex, doc, false)
      const erased = eraseSelectionPixels(layer, sel, doc.width, doc.height)
      if (erased) {
        dispatch({
          type: 'APPLY_LAYERS',
          id: doc.id,
          layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, bitmap: erased } : l)),
          label: '오려두기',
        })
      }
      clip.setStatus(`오려두기  ${ex.bounds.width} × ${ex.bounds.height} 픽셀`)
      toast('오려두기', 'success')
      return
    }

    // 선택 없음 → Layer 전체 오려두기
    if (layer.type === 'background' || layer.locked) {
      toast('Layer is locked.', 'error')
      return
    }
    const ex = extractLayer(layer) ?? extractComposite(doc, null)
    if (ex) store(ex, doc, false)
    dispatch({ type: 'DELETE_LAYER', id: layer.id, label: '레이어 오려두기', only: true })
    clip.setStatus('레이어 오려두기')
    toast('레이어 오려두기', 'success')
  }, [doc, dispatch, store, clip, toast])

  // ── Paste / Paste In Place ────────────────────────────────────
  const doPaste = useCallback(
    (inPlace: boolean) => {
      if (!doc) {
        toast('붙여넣을 문서가 없습니다.', 'error')
        return
      }
      const data = clip.data
      if (!clip.hasPasteable || !data) {
        toast('클립보드가 비어 있습니다.', 'info')
        clip.setStatus('클립보드 비어 있음')
        return
      }
      // Vector(Type/Shape) Layer 붙여넣기 — 새 Type/Shape Layer 로 복원
      if (data.type === 'layer' && data.layers?.length && !data.bitmap) {
        const src = data.layers[0]
        const off = inPlace ? 0 : 12
        const nl: Layer = {
          ...src,
          id: genId(src.type),
          name: src.name,
          selected: true,
          x: src.x + off,
          y: src.y + off,
          text: src.text ? { ...src.text } : undefined,
          shape: src.shape ? { ...src.shape } : undefined,
        }
        const action = src.type === 'text' ? 'INSERT_TEXT' : src.type === 'shape' ? 'INSERT_SHAPE' : 'INSERT_LAYER'
        if (action === 'INSERT_LAYER') dispatch({ type: 'INSERT_LAYER', layer: nl, label: '붙여넣기' })
        else dispatch({ type: action, layer: nl } as { type: 'INSERT_TEXT' | 'INSERT_SHAPE'; layer: Layer })
        // Draft(무기록) 삽입이므로 즉시 History 커밋
        const commit = src.type === 'text' ? 'UPDATE_TEXT' : src.type === 'shape' ? 'UPDATE_SHAPE' : null
        if (commit) dispatch({ type: commit, id: nl.id, patch: {}, label: '붙여넣기' } as { type: 'UPDATE_TEXT' | 'UPDATE_SHAPE'; id: string; patch: Partial<Layer>; label: string })
        dispatch({ type: 'SET_TOOL', tool: 'move' })
        clip.triggerFlash({ x: nl.x, y: nl.y, width: nl.width, height: nl.height })
        clip.setStatus('붙여넣기')
        toast('붙여넣기', 'success')
        return
      }
      if (!data.bitmap) {
        toast('클립보드가 비어 있습니다.', 'info')
        return
      }
      const w = data.width
      const h = data.height
      // 위치: 원래 Bounds 유지, 없으면 캔버스 중앙
      let x = data.bounds?.x ?? Math.round((doc.width - w) / 2)
      let y = data.bounds?.y ?? Math.round((doc.height - h) / 2)
      if (!inPlace && !data.bounds) {
        x = Math.round((doc.width - w) / 2)
        y = Math.round((doc.height - h) / 2)
      }
      const layer = createRasterLayer(nextLayerName(doc.layers), w, h)
      layer.x = x
      layer.y = y
      layer.bitmap = cloneCanvas(data.bitmap)
      const label = inPlace ? '제자리에 붙여넣기' : '붙여넣기'
      dispatch({ type: 'INSERT_LAYER', layer, label })
      dispatch({ type: 'SET_TOOL', tool: 'move' })
      const bounds: Rect = { x, y, width: w, height: h }
      clip.triggerFlash(bounds)
      clip.setStatus(label)
      toast(label, 'success')
    },
    [doc, clip, dispatch, toast],
  )

  const paste = useCallback(() => doPaste(false), [doPaste])
  const pasteInPlace = useCallback(() => doPaste(true), [doPaste])

  // ── Duplicate (Ctrl+J) ────────────────────────────────────────
  const duplicate = useCallback(() => {
    if (!doc) return
    const layer = activeLayerOf(doc)
    if (!layer) return
    const sel = doc.selection.active && doc.selection.mask ? doc.selection.mask : null
    if (sel && layer.bitmap && paintable(layer)) {
      const ex = extractSelection(doc, layer, sel)
      if (ex) {
        const nl = createRasterLayer(nextLayerName(doc.layers), ex.bounds.width, ex.bounds.height)
        nl.x = ex.bounds.x
        nl.y = ex.bounds.y
        nl.bitmap = ex.canvas
        dispatch({ type: 'INSERT_LAYER', layer: nl, label: '레이어 복제' })
        clip.setStatus('선택 영역 복제')
        return
      }
    }
    dispatch({ type: 'DUPLICATE_LAYER', id: layer.id })
    clip.setStatus('레이어 복제')
  }, [doc, dispatch, clip])

  // ── Clear (Edit → Clear) — Clipboard 유지 ─────────────────────
  const clear = useCallback(() => {
    if (!doc) return
    const layer = activeLayerOf(doc)
    const sel = doc.selection.active && doc.selection.mask ? doc.selection.mask : null
    if (!sel || !layer || !paintable(layer) || !layer.bitmap) {
      toast('지울 선택 영역이 없습니다.', 'info')
      return
    }
    const erased = eraseSelectionPixels(layer, sel, doc.width, doc.height)
    if (erased) {
      dispatch({
        type: 'APPLY_LAYERS',
        id: doc.id,
        layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, bitmap: erased } : l)),
        label: '지우기',
      })
      clip.setStatus('지우기')
    }
  }, [doc, dispatch, clip, toast])

  // ── Fill (전경색) ─────────────────────────────────────────────
  const fill = useCallback(() => {
    if (!doc) return
    const layer = activeLayerOf(doc)
    if (!paintable(layer) || !layer) {
      toast('Layer is locked.', 'error')
      return
    }
    const w = Math.max(1, Math.round(layer.width || doc.width))
    const h = Math.max(1, Math.round(layer.height || doc.height))
    const base = document.createElement('canvas')
    base.width = w
    base.height = h
    const ctx = base.getContext('2d')!
    if (layer.bitmap) ctx.drawImage(layer.bitmap, 0, 0, w, h)
    const sel = doc.selection.active && doc.selection.mask ? doc.selection.mask : null
    if (sel) {
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = h
      const tctx = tmp.getContext('2d')!
      tctx.fillStyle = foregroundColor
      tctx.fillRect(0, 0, w, h)
      const sc = document.createElement('canvas')
      sc.width = w
      sc.height = h
      const sctx = sc.getContext('2d')!
      const img = sctx.createImageData(w, h)
      const ox = Math.round(layer.x)
      const oy = Math.round(layer.y)
      for (let yy = 0; yy < h; yy++) {
        const dy = yy + oy
        if (dy < 0 || dy >= doc.height) continue
        for (let xx = 0; xx < w; xx++) {
          const dx = xx + ox
          if (dx < 0 || dx >= doc.width) continue
          const v = sel[dy * doc.width + dx]
          if (v) img.data[(yy * w + xx) * 4 + 3] = v
        }
      }
      sctx.putImageData(img, 0, 0)
      tctx.globalCompositeOperation = 'destination-in'
      tctx.drawImage(sc, 0, 0)
      ctx.drawImage(tmp, 0, 0)
    } else {
      ctx.fillStyle = foregroundColor
      ctx.fillRect(0, 0, w, h)
    }
    dispatch({
      type: 'APPLY_LAYERS',
      id: doc.id,
      layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, bitmap: base } : l)),
      label: '칠',
    })
    clip.setStatus('칠')
  }, [doc, foregroundColor, dispatch, clip, toast])

  // ── Stroke (선택 경계 · 전경색) ───────────────────────────────
  const stroke = useCallback(() => {
    if (!doc) return
    const layer = activeLayerOf(doc)
    if (!paintable(layer) || !layer) {
      toast('Layer is locked.', 'error')
      return
    }
    const sel = doc.selection.active && doc.selection.mask ? doc.selection.mask : null
    if (!sel) {
      toast('획을 그릴 선택 영역이 없습니다.', 'info')
      return
    }
    const w = Math.max(1, Math.round(layer.width || doc.width))
    const h = Math.max(1, Math.round(layer.height || doc.height))
    const base = document.createElement('canvas')
    base.width = w
    base.height = h
    const ctx = base.getContext('2d')!
    if (layer.bitmap) ctx.drawImage(layer.bitmap, 0, 0, w, h)
    const contours = boundaryContours(sel, doc.width, doc.height)
    const path = new Path2D()
    for (const c of contours) {
      path.moveTo(c[0] - layer.x, c[1] - layer.y)
      for (let i = 2; i < c.length; i += 2) path.lineTo(c[i] - layer.x, c[i + 1] - layer.y)
      path.closePath()
    }
    ctx.strokeStyle = foregroundColor
    ctx.lineWidth = 2
    ctx.stroke(path)
    dispatch({
      type: 'APPLY_LAYERS',
      id: doc.id,
      layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, bitmap: base } : l)),
      label: '획',
    })
    clip.setStatus('획')
  }, [doc, foregroundColor, dispatch, clip, toast])

  // ── 메뉴/컨텍스트 활성화 상태 ─────────────────────────────────
  const layer = doc ? activeLayerOf(doc) : undefined
  const hasSelection = !!doc?.selection.active && !!doc.selection.mask
  const canCopy = !!doc && !!layer && layer.visible
  const canCut = canCopy && (hasSelection ? paintable(layer) : !!layer && layer.type !== 'background' && !layer.locked)
  const canPaste = !!doc && clip.hasPasteable
  const canClear = !!doc && hasSelection && paintable(layer)

  return {
    copy,
    cut,
    paste,
    pasteInPlace,
    copyMerged,
    duplicate,
    clear,
    fill,
    stroke,
    canCopy,
    canCut,
    canPaste,
    canClear,
    hasSelection,
    maskTargetActive: doc?.activeTarget === 'mask',
  }
}
