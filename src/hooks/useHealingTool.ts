import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useBrushStore } from '../store/brushStore'
import { useHealingStore } from '../store/healingStore'
import { useOpenStore } from '../store/openStore'
import type { Layer, OpenDocument } from '../types'
import { BRUSH_MODE_OP, type BrushOptions, type Point } from '../engine/brushEngine'
import { buildSampleCanvas, docToBitmapLocal } from '../engine/cloneEngine'
import { CloneRenderer } from '../engine/cloneRenderer'
import { buildHealed, healingBlurRadius, healingEdgeHardness } from '../engine/healingEngine'
import { getActiveEngine } from '../engine/renderEngine'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

/** Healing Source Overlay 색상 (Clone 과 구분되는 녹색) */
const HEAL_COLOR: [number, number, number] = [40, 200, 90]

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

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

function paintBlocked(doc: OpenDocument, layer: Layer | undefined): 'mask' | 'locked' | null {
  if (!layer || layer.type === 'group') return 'locked'
  if (doc.activeTarget === 'mask' && layer.mask) return 'mask'
  if (layer.locked || layer.type === 'background' || layer.type === 'adjustment') return 'locked'
  return null
}

/**
 * Healing Brush Tool.
 * Clone Stamp 와 동일한 Source/Aligned/Sample 구조지만, Source 를 그대로 복사하지 않고
 * healed = blur(target) + (source - blur(source)) 로 계산해 Target 주변의 색/톤/밝기에
 * 자동으로 맞춘 뒤 Brush Dab / Diffusion / Selection 으로 자연스럽게 블렌드한다.
 * healed 는 Stroke 시작 시 1회 계산해 CloneRenderer 파이프라인에 Source 로 투입한다.
 */
export function useHealingTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const brush = useBrushStore()
  const heal = useHealingStore()
  const { toast } = useOpenStore()

  const docRef = useRef<OpenDocument | null>(doc)
  const toolRef = useRef(activeTool)
  const brushRef = useRef(brush)
  const healRef = useRef(heal)
  docRef.current = doc
  toolRef.current = activeTool
  brushRef.current = brush
  healRef.current = heal

  const alignedOffset = useRef<{ x: number; y: number } | null>(null)
  const lastHover = useRef<{ x: number; y: number } | null>(null)
  const spaceRef = useRef(false)
  const altRef = useRef(false)
  const versionRef = useRef(0)

  const stroke = useRef<{
    active: boolean
    renderer: CloneRenderer | null
    layer: Layer | null
    offset: { x: number; y: number }
    hardness: number
    last: Point
  }>({ active: false, renderer: null, layer: null, offset: { x: 0, y: 0 }, hardness: 100, last: { x: 0, y: 0 } })

  const dabOpts = (hardness: number): BrushOptions => ({
    size: brushRef.current.size,
    hardness,
    flow: 100,
    color: '#ffffff',
    composite: 'source-over',
    pressure: 1,
  })

  const blendOp = (): GlobalCompositeOperation => BRUSH_MODE_OP[brushRef.current.mode] ?? 'source-over'

  const pushPreview = (layerId: string, canvas: HTMLCanvasElement) => {
    versionRef.current += 1
    brushRef.current.setPreview({ active: true, layerId, target: 'bitmap', canvas, version: versionRef.current })
  }

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

  const updateMarker = (targetDoc: Point, offset: { x: number; y: number } | null) => {
    const engine = getActiveEngine()
    const h = healRef.current
    if (!engine) return
    if (!h.sourcePoint || h.sourceDocId !== docRef.current?.id) {
      engine.setCloneSource(null)
      return
    }
    const srcPt = offset ? { x: targetDoc.x - offset.x, y: targetDoc.y - offset.y } : h.sourcePoint
    engine.setCloneSource({
      x: srcPt.x,
      y: srcPt.y,
      screenScale: vp.getScale(),
      radius: brushRef.current.size / 2,
      color: HEAL_COLOR,
      opacity: 0.85,
    })
  }

  const hover = (clientX: number, clientY: number) => {
    const engine = getActiveEngine()
    const d = docRef.current
    if (toolRef.current !== 'healing' || !d || !engine) {
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
    const h = healRef.current
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
    const hasSource = !!h.sourcePoint && h.sourceDocId === d.id
    const offset =
      alignedOffset.current ?? (hasSource ? { x: p.x - h.sourcePoint!.x, y: p.y - h.sourcePoint!.y } : null)
    setCursorAttr('none')
    engine.setBrushCursor({
      x: p.x,
      y: p.y,
      size: brushRef.current.size,
      hardness: brushRef.current.hardness,
      screenScale: vp.getScale(),
    })
    updateMarker(p, offset)
  }

  const refreshCursor = () => {
    const pos = lastHover.current
    if (pos) hover(pos.x, pos.y)
  }

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

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function begin(e: PointerEvent) {
      if (toolRef.current !== 'healing' || e.button !== 0 || spaceRef.current) return
      const d = docRef.current
      if (!d) return
      const layer = d.layers.find((l) => l.id === d.activeLayerId)
      const h = healRef.current
      const p = vp.screenToCanvas(e.clientX, e.clientY)

      // Alt + Click → Source 지정 (History 미기록)
      if (e.altKey) {
        if (d.activeTarget === 'mask' && layer?.mask) {
          toast('Healing Brush cannot be used on layer masks.', 'error')
          return
        }
        h.setSourcePoint({ x: p.x, y: p.y }, d.id)
        alignedOffset.current = null
        return
      }

      const block = paintBlocked(d, layer)
      if (block === 'mask') {
        toast('Healing Brush cannot be used on layer masks.', 'error')
        return
      }
      if (!h.sourcePoint || h.sourceDocId !== d.id) {
        toast('Alt-click to define a source point', 'info')
        return
      }
      if (block === 'locked' || !layer) {
        toast('Layer is locked.', 'error')
        return
      }
      if (h.source === 'pattern') {
        toast('패턴 소스는 준비 중입니다.', 'info')
        return
      }

      const w = Math.max(1, Math.round(layer.width || d.width))
      const hh = Math.max(1, Math.round(layer.height || d.height))

      let offset: { x: number; y: number }
      if (h.aligned && alignedOffset.current) offset = alignedOffset.current
      else {
        offset = { x: p.x - h.sourcePoint.x, y: p.y - h.sourcePoint.y }
        alignedOffset.current = offset
      }

      // Source Composite Cache (Stroke 1회) → healed 계산 (target 색/톤 매칭)
      const sample = buildSampleCanvas(d, layer.id, h.sampleMode)
      const healed = buildHealed({
        width: w,
        height: hh,
        base: layer.bitmap ?? null,
        sample,
        offset,
        origin: { x: layer.x, y: layer.y },
        blurRadius: healingBlurRadius(brushRef.current.size, h.diffusion),
      })

      const renderer = new CloneRenderer()
      renderer.init({
        width: w,
        height: hh,
        base: layer.bitmap ?? null,
        sample: healed, // 이미 레이어 로컬 정렬됨 → offset/origin 0
        offset: { x: 0, y: 0 },
        origin: { x: 0, y: 0 },
        selection: buildLocalMask(d, layer, w, hh),
      })

      const hardness = healingEdgeHardness(brushRef.current.hardness, h.diffusion)
      const local = docToBitmapLocal(p.x, p.y, layer)
      const rect = renderer.firstDab(local, dabOpts(hardness))
      renderer.composite(rect, 1, blendOp())

      const s = stroke.current
      s.active = true
      s.renderer = renderer
      s.layer = layer
      s.offset = offset
      s.hardness = hardness
      s.last = local

      const canvas = renderer.workingCanvas
      if (canvas) pushPreview(layer.id, canvas)
      updateMarker({ x: p.x, y: p.y }, offset)
      el!.setPointerCapture(e.pointerId)
    }

    function drag(e: PointerEvent) {
      const s = stroke.current
      if (!s.active || !s.renderer || !s.layer) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const raw = docToBitmapLocal(p.x, p.y, s.layer)
      const k = 1 - Math.max(0, Math.min(0.92, (brushRef.current.smoothing / 100) * 0.92))
      const local: Point = { x: s.last.x + (raw.x - s.last.x) * k, y: s.last.y + (raw.y - s.last.y) * k }
      const spacingRatio = Math.max(0.02, brushRef.current.spacing / 100)
      const rect = s.renderer.stampSegment(s.last, local, dabOpts(s.hardness), spacingRatio)
      s.renderer.composite(rect, 1, blendOp())
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
          label: '복구 브러시',
          historyType: 'brush',
        })
      }
      brushRef.current.setPreview({ active: false, layerId: null, target: 'bitmap', canvas: null, version: versionRef.current })
      s.renderer?.dispose()
      s.renderer = null
      if (!healRef.current.aligned) alignedOffset.current = null
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

  // Source/도구 변화 시 커서/마커 갱신
  useEffect(() => {
    const engine = getActiveEngine()
    if (activeTool !== 'healing') {
      engine?.setCloneSource(null)
      engine?.setBrushCursor(null)
      setCursorAttr(null)
      return
    }
    refreshCursor()
    if (!stroke.current.active) {
      if (heal.sourcePoint && heal.sourceDocId === doc?.id) {
        const pos = lastHover.current
        const p = pos ? vp.screenToCanvas(pos.x, pos.y) : heal.sourcePoint
        updateMarker(p, alignedOffset.current)
      } else {
        engine?.setCloneSource(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, heal.sourcePoint, heal.sourceDocId, brush.size, doc?.id])

  useEffect(() => {
    if (heal.sourceDocId && heal.sourceDocId !== doc?.id) alignedOffset.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // J 단축키 → Healing Brush
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'healing' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
