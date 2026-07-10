import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useBrushStore } from '../store/brushStore'
import { OVERLAY_RGB, useCloneStore } from '../store/cloneStore'
import { useOpenStore } from '../store/openStore'
import type { Layer, OpenDocument } from '../types'
import { BRUSH_MODE_OP, type BrushOptions, type Point } from '../engine/brushEngine'
import { buildSampleCanvas, docToBitmapLocal } from '../engine/cloneEngine'
import { CloneRenderer } from '../engine/cloneRenderer'
import { getActiveEngine } from '../engine/renderEngine'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

/** doc 좌표 선택 마스크 → 레이어 로컬 알파 캔버스 (Selection 내부만 페인팅) */
function buildLocalMask(doc: OpenDocument, layer: Layer, w: number, h: number): HTMLCanvasElement | null {
  const sel = doc.selection
  if (!sel.active || !sel.mask) return null
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(w, h)
  const ox = Math.round(layer.x)
  const oy = Math.round(layer.y)
  for (let y = 0; y < h; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= doc.height) continue
    for (let x = 0; x < w; x++) {
      const dx = x + ox
      if (dx < 0 || dx >= doc.width) continue
      if (sel.mask[dy * doc.width + dx]) img.data[(y * w + x) * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** 클론 대상으로 유효한 레이어인지 (Bitmap 페인팅 가능 여부) */
function paintBlocked(doc: OpenDocument, layer: Layer | undefined): 'mask' | 'locked' | null {
  if (!layer || layer.type === 'group') return 'locked'
  if (doc.activeTarget === 'mask' && layer.mask) return 'mask'
  if (layer.locked || layer.type === 'background' || layer.type === 'adjustment') return 'locked'
  return null
}

/**
 * Clone Stamp Tool — Photoshop 수준 품질.
 * - Brush Engine 의 Dab/Spacing/Hardness/Flow 를 그대로 재사용 (Brush Tool 과 동일 품질)
 * - Flow 누적 · Opacity 상한 · Blend Mode 완전 지원 · Tablet Pressure(Size/Opacity/Flow)
 * - Source Composite Cache · Dirty Rect 부분 합성 · Bilinear 샘플링
 * - 브러시 내부 실시간 Source Preview + Source Circle/연결선 Overlay
 * 렌더 파이프라인은 CloneRenderer(엔진)에 위임하고, 이 훅은 입력 수집/오버레이만 담당한다.
 */
export function useCloneTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const brush = useBrushStore()
  const clone = useCloneStore()
  const { toast } = useOpenStore()

  const docRef = useRef<OpenDocument | null>(doc)
  const toolRef = useRef(activeTool)
  const brushRef = useRef(brush)
  const cloneRef = useRef(clone)
  docRef.current = doc
  toolRef.current = activeTool
  brushRef.current = brush
  cloneRef.current = clone

  /** Aligned ON 일 때 Stroke 간 유지되는 Source Offset (targetStart - sourceStart, 문서 좌표) */
  const alignedOffset = useRef<{ x: number; y: number } | null>(null)
  /** Hover Source Preview 용 Composite Cache (문서 크기) */
  const previewSample = useRef<HTMLCanvasElement | null>(null)
  const lastHover = useRef<{ x: number; y: number } | null>(null)
  const spaceRef = useRef(false)
  const altRef = useRef(false)
  const versionRef = useRef(0)

  const stroke = useRef<{
    active: boolean
    renderer: CloneRenderer | null
    layer: Layer | null
    offset: { x: number; y: number }
    last: Point
    pressure: number
  }>({ active: false, renderer: null, layer: null, offset: { x: 0, y: 0 }, last: { x: 0, y: 0 }, pressure: 1 })

  const effPressure = (e: PointerEvent) =>
    e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1

  /** 압력 반영 Dab 옵션 (색은 무관 — 알파 커버리지만 사용) */
  const dabOpts = (pressure: number): BrushOptions => {
    const b = brushRef.current
    const c = cloneRef.current
    return {
      size: c.sizePressure ? Math.max(1, b.size * pressure) : b.size,
      hardness: b.hardness,
      flow: b.flow,
      color: '#ffffff',
      composite: 'source-over',
      pressure: c.flowPressure ? pressure : 1,
    }
  }

  const strokeOpacity = (pressure: number) => {
    const b = brushRef.current
    const c = cloneRef.current
    return Math.max(0, Math.min(1, (b.opacity / 100) * (c.opacityPressure ? pressure : 1)))
  }

  const blendOp = (): GlobalCompositeOperation => BRUSH_MODE_OP[brushRef.current.mode] ?? 'source-over'

  const pushPreview = (layerId: string, canvas: HTMLCanvasElement) => {
    versionRef.current += 1
    brushRef.current.setPreview({ active: true, layerId, target: 'bitmap', canvas, version: versionRef.current })
  }

  /** Hover Source Preview Composite 재생성 (Source Cache — 매 Dab 재생성하지 않음) */
  const rebuildPreviewSample = () => {
    const d = docRef.current
    const c = cloneRef.current
    if (!d || !c.source || c.sourceDocId !== d.id) {
      previewSample.current = null
      return
    }
    previewSample.current = buildSampleCanvas(d, d.activeLayerId, c.sampleMode)
  }

  /** Source 표식 Overlay 갱신 (idle/hover/stroke 공용). targetDoc = 브러시 중심(문서 좌표) */
  const updateMarker = (targetDoc: Point, offset: { x: number; y: number } | null) => {
    const engine = getActiveEngine()
    const c = cloneRef.current
    if (!engine) return
    if (!c.source || c.sourceDocId !== docRef.current?.id) {
      engine.setCloneSource(null)
      return
    }
    const srcPt = offset ? { x: targetDoc.x - offset.x, y: targetDoc.y - offset.y } : c.source
    engine.setCloneSource({
      x: srcPt.x,
      y: srcPt.y,
      screenScale: vp.getScale(),
      radius: c.showOverlay ? brushRef.current.size / 2 : 0,
      color: OVERLAY_RGB[c.overlayColor],
      opacity: Math.max(0.45, c.overlayOpacity / 100),
      targetX: c.showConnection ? targetDoc.x : undefined,
      targetY: c.showConnection ? targetDoc.y : undefined,
    })
  }

  // ── Space / Alt 추적 ─────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true
      if (e.key === 'Alt' && !altRef.current) {
        altRef.current = true
        refreshCursor()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
      if (e.key === 'Alt') {
        altRef.current = false
        refreshCursor()
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 커서 / 오버레이 (Hover) ───────────────────────────────────
  const setCursorAttr = (v: 'none' | 'locked' | 'crosshair' | null) => {
    const el = vp.containerRef.current
    if (!el) return
    if (v) el.dataset.brushCursor = v
    else delete el.dataset.brushCursor
  }

  const hideCursor = () => {
    lastHover.current = null
    setCursorAttr(null)
    getActiveEngine()?.setBrushCursor(null)
  }

  /** Hover 상태에서 브러시 커서 + Source Preview + Source 마커 갱신 */
  const hover = (clientX: number, clientY: number) => {
    const engine = getActiveEngine()
    const d = docRef.current
    if (toolRef.current !== 'stamp' || !d || !engine) {
      hideCursor()
      return
    }
    const p = vp.screenToCanvas(clientX, clientY)
    lastHover.current = { x: clientX, y: clientY }
    const inside = p.x >= 0 && p.y >= 0 && p.x <= d.width && p.y <= d.height
    if (!inside) {
      setCursorAttr(null)
      engine.setBrushCursor(null)
      updateMarker(p, alignedOffset.current)
      return
    }
    const c = cloneRef.current
    const hasSource = !!c.source && c.sourceDocId === d.id

    // Alt = Source 지정 모드 → 십자 커서, 원형/미리보기 숨김
    if (altRef.current) {
      setCursorAttr('crosshair')
      engine.setBrushCursor(null)
      updateMarker(p, alignedOffset.current)
      return
    }

    const layer = d.layers.find((l) => l.id === d.activeLayerId)
    if (paintBlocked(d, layer)) {
      setCursorAttr('locked')
      engine.setBrushCursor(null)
      updateMarker(p, alignedOffset.current)
      return
    }

    // 정렬 offset — 잠긴 offset(Aligned) 우선, 없으면 Source 기준(hover 시 Source 고정)
    const offset =
      alignedOffset.current ?? (hasSource ? { x: p.x - c.source!.x, y: p.y - c.source!.y } : null)

    setCursorAttr('none')
    engine.setBrushCursor({
      x: p.x,
      y: p.y,
      size: brushRef.current.size,
      hardness: brushRef.current.hardness,
      screenScale: vp.getScale(),
      cloneSample: hasSource && c.showOverlay ? previewSample.current : null,
      cloneOffsetX: offset?.x,
      cloneOffsetY: offset?.y,
      cloneOverlayOpacity: c.overlayOpacity / 100,
    })
    updateMarker(p, offset)
  }

  const refreshCursor = () => {
    const pos = lastHover.current
    if (pos) hover(pos.x, pos.y)
  }

  // ── Pointer 이벤트 (Stroke) ───────────────────────────────────
  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function begin(e: PointerEvent) {
      if (toolRef.current !== 'stamp' || e.button !== 0 || spaceRef.current) return
      const d = docRef.current
      if (!d) return
      const layer = d.layers.find((l) => l.id === d.activeLayerId)
      const c = cloneRef.current
      const p = vp.screenToCanvas(e.clientX, e.clientY)

      // Alt + Click → Source 지정 (History 미기록). 새 Source 는 Aligned Offset 리셋.
      if (e.altKey) {
        if (d.activeTarget === 'mask' && layer?.mask) {
          toast('Clone Stamp cannot be used on layer masks.', 'error')
          return
        }
        c.setSource({ x: p.x, y: p.y }, d.id)
        alignedOffset.current = null
        rebuildPreviewSample()
        return
      }

      const block = paintBlocked(d, layer)
      if (block === 'mask') {
        toast('Clone Stamp cannot be used on layer masks.', 'error')
        return
      }
      if (!c.source || c.sourceDocId !== d.id) {
        toast('Alt-click to define a source point', 'info')
        return
      }
      if (block === 'locked' || !layer) {
        toast('Layer is locked.', 'error')
        return
      }

      const w = Math.max(1, Math.round(layer.width || d.width))
      const h = Math.max(1, Math.round(layer.height || d.height))

      // Source Offset — Aligned 유지 vs 매 Stroke 리셋
      let offset: { x: number; y: number }
      if (c.aligned && alignedOffset.current) {
        offset = alignedOffset.current
      } else {
        offset = { x: p.x - c.source.x, y: p.y - c.source.y }
        alignedOffset.current = offset
      }

      // Source Cache — Stroke 시작 시 1회 Composite Snapshot (자기 참조 번짐 방지)
      const sample = buildSampleCanvas(d, layer.id, c.sampleMode)
      const renderer = new CloneRenderer()
      renderer.init({
        width: w,
        height: h,
        base: layer.bitmap ?? null,
        sample,
        offset,
        origin: { x: layer.x, y: layer.y },
        selection: buildLocalMask(d, layer, w, h),
      })

      const pressure = effPressure(e)
      const local = docToBitmapLocal(p.x, p.y, layer)
      const rect = renderer.firstDab(local, dabOpts(pressure))
      renderer.composite(rect, strokeOpacity(pressure), blendOp())

      const s = stroke.current
      s.active = true
      s.renderer = renderer
      s.layer = layer
      s.offset = offset
      s.last = local
      s.pressure = pressure

      const canvas = renderer.workingCanvas
      if (canvas) pushPreview(layer.id, canvas)
      updateMarker({ x: p.x, y: p.y }, offset)
      el!.setPointerCapture(e.pointerId)
    }

    function drag(e: PointerEvent) {
      const s = stroke.current
      if (!s.active || !s.renderer || !s.layer) return
      const pressure = effPressure(e)
      s.pressure = pressure
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const raw = docToBitmapLocal(p.x, p.y, s.layer)
      const k = 1 - Math.max(0, Math.min(0.92, (brushRef.current.smoothing / 100) * 0.92))
      const local: Point = {
        x: s.last.x + (raw.x - s.last.x) * k,
        y: s.last.y + (raw.y - s.last.y) * k,
      }
      const spacingRatio = Math.max(0.02, brushRef.current.spacing / 100)
      const rect = s.renderer.stampSegment(s.last, local, dabOpts(pressure), spacingRatio)
      s.renderer.composite(rect, strokeOpacity(pressure), blendOp())
      s.last = local
      const canvas = s.renderer.workingCanvas
      if (canvas) pushPreview(s.layer.id, canvas)
      updateMarker({ x: p.x, y: p.y }, s.offset)
    }

    function end(e: PointerEvent) {
      const s = stroke.current
      if (!s.active) return
      s.active = false
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      const d = docRef.current
      const canvas = s.renderer?.workingCanvas
      if (d && s.layer && canvas) {
        dispatch({
          type: 'APPLY_LAYERS',
          id: d.id,
          layers: d.layers.map((l) =>
            l.id === s.layer!.id
              ? { ...l, bitmap: canvas, type: l.type === 'background' ? 'raster' : l.type }
              : l,
          ),
          label: '복제 도장',
          historyType: 'brush',
        })
      }
      brushRef.current.setPreview({ active: false, layerId: null, target: 'bitmap', canvas: null, version: versionRef.current })
      s.renderer?.dispose()
      s.renderer = null
      // Aligned OFF → 다음 Stroke 는 Source Start 부터 다시
      if (!cloneRef.current.aligned) alignedOffset.current = null
      rebuildPreviewSample()
      refreshCursor()
    }

    function onHover(e: PointerEvent) {
      if (stroke.current.active) return
      hover(e.clientX, e.clientY)
    }
    function onLeave() {
      if (!stroke.current.active) hideCursor()
    }

    el.addEventListener('pointerdown', begin)
    el.addEventListener('pointermove', onHover)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', end)
    return () => {
      el.removeEventListener('pointerdown', begin)
      el.removeEventListener('pointermove', onHover)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointermove', drag)
      window.removeEventListener('pointerup', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch, toast])

  // Source/Sample/도구 변화 시 Preview Cache 재생성 + 커서 갱신
  useEffect(() => {
    const engine = getActiveEngine()
    if (activeTool !== 'stamp') {
      engine?.setCloneSource(null)
      engine?.setBrushCursor(null)
      setCursorAttr(null)
      return
    }
    rebuildPreviewSample()
    refreshCursor()
    if (!stroke.current.active) {
      if (clone.source && clone.sourceDocId === doc?.id) {
        const pos = lastHover.current
        const p = pos ? vp.screenToCanvas(pos.x, pos.y) : clone.source
        updateMarker(p, alignedOffset.current)
      } else {
        engine?.setCloneSource(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTool,
    clone.source,
    clone.sourceDocId,
    clone.sampleMode,
    clone.showOverlay,
    clone.overlayOpacity,
    clone.overlayColor,
    clone.showConnection,
    brush.size,
    brush.hardness,
    doc?.id,
  ])

  // 문서 전환 시 Aligned Offset 무효화
  useEffect(() => {
    if (clone.sourceDocId && clone.sourceDocId !== doc?.id) alignedOffset.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // S 단축키 → Clone Stamp
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'stamp' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
