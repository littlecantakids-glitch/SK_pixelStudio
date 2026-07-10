import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useBrushStore } from '../store/brushStore'
import { useGradientStore } from '../store/gradientStore'
import { useOpenStore } from '../store/openStore'
import { getActiveEngine } from '../engine/renderEngine'
import { BRUSH_MODE_OP } from '../engine/brushEngine'
import { docToLayerLocal } from '../engine/brushEngine'
import {
  renderGradientToCanvas,
  resolveColor,
  GRADIENT_TYPE_LABELS,
} from '../engine/gradientEngine'
import type { Gradient, GradientGeom, Layer, MaskTarget, OpenDocument } from '../types'

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

/** doc 좌표 선택 마스크 → 레이어 로컬 알파 캔버스 */
function buildLocalMask(
  doc: OpenDocument,
  layer: Layer,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const sel = doc.selection
  if (!sel.active || !sel.mask) return null
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const ox = Math.round(layer.x)
  const oy = Math.round(layer.y)
  for (let y = 0; y < h; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= doc.height) continue
    for (let x = 0; x < w; x++) {
      const dx = x + ox
      if (dx < 0 || dx >= doc.width) continue
      img.data[(y * w + x) * 4 + 3] = sel.mask[dy * doc.width + dx]
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// Brush 프리뷰 version 과 충돌 방지용 카운터
let gradSeq = 2_000_000_000

/**
 * Gradient Tool — Canvas Drag → 실시간 Preview → Commit.
 * - Raster/Image Layer: 픽셀 Gradient (Preview Layer 사용, Bitmap 직접 수정 금지)
 * - Layer Mask: Mask Bitmap 에 Gradient (Black→White 마스크 생성)
 * - Shape Layer: fill.gradient 설정 (Vector, Non-Destructive)
 * - Type Layer: text.fillGradient 설정 (Vector, Non-Destructive)
 * - Selection: 선택 영역 내부에만 적용
 */
export function useGradientTool(vp: ViewportApi) {
  const { activeTool, foregroundColor, backgroundColor } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { setPreview } = useBrushStore()
  const grad = useGradientStore()
  const { toast } = useOpenStore()

  const stateRef = useRef({ activeTool, doc, grad, fg: foregroundColor, bg: backgroundColor })
  stateRef.current = { activeTool, doc, grad, fg: foregroundColor, bg: backgroundColor }

  const drag = useRef<{
    active: boolean
    layer: Layer | null
    /** raster/mask = 픽셀 커밋, shape/text = Vector fill 커밋 */
    kind: 'raster' | 'mask' | 'shape' | 'text'
    target: MaskTarget
    w: number
    h: number
    base: HTMLCanvasElement | null
    localMask: HTMLCanvasElement | null
    start: { x: number; y: number }
    end: { x: number; y: number }
    version: number
  }>({
    active: false,
    layer: null,
    kind: 'raster',
    target: 'bitmap',
    w: 0,
    h: 0,
    base: null,
    localMask: null,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    version: 0,
  })
  const spaceRef = useRef(false)

  /** 현재 옵션으로 Gradient 캔버스 생성 (레이어 로컬 지오메트리) */
  const buildGradient = (w: number, h: number, geom: GradientGeom): HTMLCanvasElement => {
    const g = stateRef.current.grad
    const gradient: Gradient = { ...g.gradient, type: g.gradientType }
    return renderGradientToCanvas(w, h, gradient, geom, {
      fg: stateRef.current.fg,
      bg: stateRef.current.bg,
      reverse: g.reverse,
      dither: g.dither,
      transparency: g.transparency,
    })
  }

  /** Raster/Mask 대상 — base 위에 Gradient 를 blend/opacity 로 합성한 working 생성 */
  const composeWorking = (): HTMLCanvasElement | null => {
    const s = drag.current
    if (!s.base) return null
    const g = stateRef.current.grad
    const geom: GradientGeom = { x0: s.start.x, y0: s.start.y, x1: s.end.x, y1: s.end.y }
    const gc = buildGradient(s.w, s.h, geom)
    if (s.localMask) {
      const ctx = gc.getContext('2d')!
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(s.localMask, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }
    const working = makeCanvas(s.w, s.h)
    const wctx = working.getContext('2d')!
    wctx.drawImage(s.base, 0, 0)
    wctx.globalAlpha = Math.max(0, Math.min(1, g.opacity / 100))
    wctx.globalCompositeOperation =
      s.target === 'mask'
        ? 'source-over'
        : (BRUSH_MODE_OP as Record<string, GlobalCompositeOperation>)[g.blendMode] ?? 'source-over'
    wctx.drawImage(gc, 0, 0)
    wctx.globalCompositeOperation = 'source-over'
    wctx.globalAlpha = 1
    return working
  }

  /** Shape/Text 커밋용 — sentinel(전경/배경) 색을 현재 색으로 해석해 저장 */
  const resolvedGradient = (): Gradient => {
    const g = stateRef.current.grad
    return {
      ...g.gradient,
      type: g.gradientType,
      stops: g.gradient.stops.map((st) => ({
        ...st,
        color: resolveColor(st.color, stateRef.current.fg, stateRef.current.bg),
      })),
    }
  }

  const renderPreview = () => {
    const s = drag.current
    if (!s.active || !s.layer) return
    const d = stateRef.current.doc
    if (!d) return
    const geom: GradientGeom = { x0: s.start.x, y0: s.start.y, x1: s.end.x, y1: s.end.y }
    if (s.kind === 'shape') {
      dispatch({
        type: 'UPDATE_SHAPE',
        id: s.layer.id,
        patch: {
          shape: {
            ...s.layer.shape!,
            fill: {
              ...s.layer.shape!.fill,
              type: 'gradient',
              enabled: true,
              gradient: resolvedGradient(),
              gradientGeom: geom,
            },
          },
        },
      })
      return
    }
    if (s.kind === 'text') {
      dispatch({
        type: 'UPDATE_TEXT',
        id: s.layer.id,
        patch: {
          text: {
            ...s.layer.text!,
            fillGradient: { gradient: resolvedGradient(), geom },
          },
        },
      })
      return
    }
    const working = composeWorking()
    if (!working) return
    gradSeq += 1
    s.version = gradSeq
    setPreview({
      active: true,
      layerId: s.layer.id,
      target: s.target,
      canvas: working,
      version: gradSeq,
    })
  }

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    const onSpace = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = e.type === 'keydown'
    }

    function begin(e: PointerEvent) {
      if (stateRef.current.activeTool !== 'gradient' || e.button !== 0 || spaceRef.current) return
      const d = stateRef.current.doc
      if (!d) return
      const layer = d.layers.find((l) => l.id === d.activeLayerId)
      if (!layer || layer.type === 'group') return

      const target: MaskTarget =
        (d.activeTarget === 'mask' || layer.type === 'adjustment') && layer.mask ? 'mask' : 'bitmap'
      let kind: 'raster' | 'mask' | 'shape' | 'text'
      if (target === 'mask') kind = 'mask'
      else if (layer.type === 'shape' && layer.shape) kind = 'shape'
      else if (layer.type === 'text' && layer.text) kind = 'text'
      else kind = 'raster'

      if (layer.locked || (kind === 'raster' && layer.type === 'background')) {
        toast('Layer is locked.', 'error')
        return
      }
      if (kind === 'raster' && (layer.type === 'smartObject' || layer.adjustment)) {
        toast('스마트 오브젝트/조정 레이어에는 마스크에만 그라디언트를 적용할 수 있습니다.', 'error')
        return
      }

      const s = drag.current
      s.active = true
      s.layer = layer
      s.kind = kind
      s.target = target
      const w = (s.w =
        target === 'mask'
          ? layer.mask!.bitmap.width
          : Math.max(1, Math.round(layer.width || d.width)))
      const h = (s.h =
        target === 'mask'
          ? layer.mask!.bitmap.height
          : Math.max(1, Math.round(layer.height || d.height)))
      if (kind === 'raster' || kind === 'mask') {
        const base = makeCanvas(w, h)
        const bctx = base.getContext('2d')!
        if (target === 'mask') bctx.drawImage(layer.mask!.bitmap, 0, 0, w, h)
        else if (layer.bitmap) bctx.drawImage(layer.bitmap, 0, 0, w, h)
        s.base = base
        s.localMask = buildLocalMask(d, layer, w, h)
      } else {
        s.base = null
        s.localMask = null
      }
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const local = docToLayerLocal(p.x, p.y, layer)
      s.start = local
      s.end = local
      el!.setPointerCapture(e.pointerId)
    }

    function move(e: PointerEvent) {
      const s = drag.current
      if (!s.active || !s.layer) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      let local = docToLayerLocal(p.x, p.y, s.layer)
      // Shift — 45° 각도 스냅 (Photoshop)
      if (e.shiftKey) {
        const dx = local.x - s.start.x
        const dy = local.y - s.start.y
        const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
        const len = Math.hypot(dx, dy)
        local = { x: s.start.x + Math.cos(ang) * len, y: s.start.y + Math.sin(ang) * len }
      }
      s.end = local
      // 드래그 라인 오버레이 (doc 좌표)
      getActiveEngine()?.setGradientOverlay({
        x0: s.start.x + s.layer.x,
        y0: s.start.y + s.layer.y,
        x1: s.end.x + s.layer.x,
        y1: s.end.y + s.layer.y,
        screenScale: vp.getScale(),
      })
      renderPreview()
    }

    function end(e: PointerEvent) {
      const s = drag.current
      if (!s.active) return
      s.active = false
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      getActiveEngine()?.setGradientOverlay(null)
      const d = stateRef.current.doc
      const g = stateRef.current.grad
      const dist = Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y)
      const label = `그라디언트 적용 (${GRADIENT_TYPE_LABELS[g.gradientType]})`

      // 클릭만 한 경우(드래그 거의 없음) — 취소
      if (dist < 2) {
        gradSeq += 1
        setPreview({ active: false, layerId: null, target: 'bitmap', canvas: null, version: gradSeq })
        return
      }

      if (!d || !s.layer) return
      if (s.kind === 'shape') {
        // 드래그 중 이미 live patch — 마지막에 History 1개
        dispatch({ type: 'UPDATE_SHAPE', id: s.layer.id, patch: {}, label })
        g.setStatus(`${label} · 모양 칠`)
        return
      }
      if (s.kind === 'text') {
        dispatch({ type: 'UPDATE_TEXT', id: s.layer.id, patch: {}, label })
        g.setStatus(`${label} · 텍스트 칠`)
        return
      }
      const working = composeWorking()
      gradSeq += 1
      setPreview({ active: false, layerId: null, target: 'bitmap', canvas: null, version: gradSeq })
      if (!working) return
      if (s.target === 'mask') {
        dispatch({
          type: 'APPLY_LAYERS',
          id: d.id,
          layers: d.layers.map((l) =>
            l.id === s.layer!.id && l.mask ? { ...l, mask: { ...l.mask, bitmap: working } } : l,
          ),
          label,
          historyType: 'gradient',
        })
        g.setStatus(`${label} · 레이어 마스크${d.selection.active ? ' · 선택 영역 내' : ''}`)
      } else {
        dispatch({
          type: 'APPLY_LAYERS',
          id: d.id,
          layers: d.layers.map((l) => (l.id === s.layer!.id ? { ...l, bitmap: working } : l)),
          label,
          historyType: 'gradient',
        })
        g.setStatus(`${label}${d.selection.active ? ' · 선택 영역 내' : ''}`)
      }
    }

    function onKeyCancel(e: KeyboardEvent) {
      if (e.key !== 'Escape' || !drag.current.active) return
      drag.current.active = false
      getActiveEngine()?.setGradientOverlay(null)
      gradSeq += 1
      setPreview({ active: false, layerId: null, target: 'bitmap', canvas: null, version: gradSeq })
    }

    el.addEventListener('pointerdown', begin)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('keydown', onSpace)
    window.addEventListener('keyup', onSpace)
    window.addEventListener('keydown', onKeyCancel)
    return () => {
      el.removeEventListener('pointerdown', begin)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('keydown', onSpace)
      window.removeEventListener('keyup', onSpace)
      window.removeEventListener('keydown', onKeyCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch, toast])

  // G — Gradient/Paint Bucket 그룹 선택, Shift+G = 그룹 내 순환 (Photoshop)
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        const cur = stateRef.current.activeTool
        if (e.shiftKey) {
          dispatch({ type: 'SET_TOOL', tool: cur === 'gradient' ? 'bucket' : 'gradient' })
        } else if (cur !== 'gradient' && cur !== 'bucket') {
          dispatch({ type: 'SET_TOOL', tool: 'gradient' })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
