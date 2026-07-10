import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useBrushStore } from '../store/brushStore'
import { useOpenStore } from '../store/openStore'
import type { Layer, MaskTarget, OpenDocument } from '../types'
import { BRUSH_MODE_OP, docToLayerLocal, drawSegment, stampDab, type BrushOptions, type Point } from '../engine/brushEngine'
import { toMaskGray } from '../engine/maskEngine'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** doc 좌표 선택 마스크 → 레이어 로컬 알파 캔버스 (회전 0 기준) */
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

export function useBrushTool(vp: ViewportApi) {
  const { activeTool, foregroundColor } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const brush = useBrushStore()
  const { toast } = useOpenStore()

  const docRef = useRef<OpenDocument | null>(doc)
  const toolRef = useRef(activeTool)
  const fgRef = useRef(foregroundColor)
  const brushRef = useRef(brush)
  docRef.current = doc
  toolRef.current = activeTool
  fgRef.current = foregroundColor
  brushRef.current = brush

  const stroke = useRef<{
    active: boolean
    layer: Layer | null
    /** 그리는 대상 — Mask 가 Active 이면 Bitmap 대신 Mask 에 그린다 */
    target: MaskTarget
    /** Eraser Tool 스트로크 여부 — Brush Engine 재사용, Composite 만 다르다 */
    erasing: boolean
    /** 필압 0~1 (마우스 = 1) */
    pressure: number
    w: number
    h: number
    base: HTMLCanvasElement | null
    buffer: HTMLCanvasElement | null
    bufferCtx: CanvasRenderingContext2D | null
    masked: HTMLCanvasElement | null
    working: HTMLCanvasElement | null
    workingCtx: CanvasRenderingContext2D | null
    localMask: HTMLCanvasElement | null
    last: Point
    version: number
  }>({
    active: false,
    layer: null,
    target: 'bitmap',
    erasing: false,
    pressure: 1,
    w: 0,
    h: 0,
    base: null,
    buffer: null,
    bufferCtx: null,
    masked: null,
    working: null,
    workingCtx: null,
    localMask: null,
    last: { x: 0, y: 0 },
    version: 0,
  })
  const spaceRef = useRef(false)

  const opts = (): BrushOptions => {
    const s = stroke.current
    // Eraser: Mask 대상이면 검정(=숨김) 페인트, Bitmap 대상이면 색은 무관(알파만 사용)
    // Brush: Mask 페인트는 Grayscale — 검정=숨김, 흰색=복원, 회색=반투명
    const color = s.erasing
      ? '#000000'
      : s.target === 'mask'
        ? toMaskGray(fgRef.current)
        : fgRef.current
    return {
      size: brushRef.current.size,
      hardness: brushRef.current.hardness,
      flow: brushRef.current.flow,
      color,
      composite: 'source-over', // dab 은 항상 버퍼에 누적, 합성은 render() 에서
      pressure: s.pressure,
    }
  }

  /** 스트로크 버퍼를 레이어(base) 위에 합성할 때의 연산 */
  const strokeComposite = (): GlobalCompositeOperation => {
    const s = stroke.current
    // Mask 는 grayscale 채널이므로 항상 표준 합성 (Eraser 도 검정 페인트)
    if (s.target === 'mask') return 'source-over'
    // Eraser: Bitmap Alpha 만 제거 (RGB 유지)
    if (s.erasing) return 'destination-out'
    return BRUSH_MODE_OP[brushRef.current.mode] ?? 'source-over'
  }

  const render = () => {
    const s = stroke.current
    if (!s.workingCtx || !s.working || !s.base || !s.buffer) return
    const ctx = s.workingCtx
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, s.w, s.h)
    ctx.drawImage(s.base, 0, 0)

    let src: HTMLCanvasElement = s.buffer
    if (s.localMask && s.masked) {
      const mc = s.masked.getContext('2d')!
      mc.globalCompositeOperation = 'source-over'
      mc.globalAlpha = 1
      mc.clearRect(0, 0, s.w, s.h)
      mc.drawImage(s.buffer, 0, 0)
      mc.globalCompositeOperation = 'destination-in'
      mc.drawImage(s.localMask, 0, 0)
      mc.globalCompositeOperation = 'source-over'
      src = s.masked
    }
    ctx.globalAlpha = Math.max(0, Math.min(1, brushRef.current.opacity / 100))
    // Brush Mode(곱하기/스크린/오버레이/지우기) 또는 Eraser(destination-out) 합성
    ctx.globalCompositeOperation = strokeComposite()
    ctx.drawImage(src, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    s.version += 1
    brushRef.current.setPreview({
      active: true,
      layerId: s.layer!.id,
      target: s.target,
      canvas: s.working,
      version: s.version,
    })
  }

  useEffect(() => {
    const spaceDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true
    }
    const spaceUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', spaceDown)
    window.addEventListener('keyup', spaceUp)
    return () => {
      window.removeEventListener('keydown', spaceDown)
      window.removeEventListener('keyup', spaceUp)
    }
  }, [])

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function begin(e: PointerEvent) {
      const tool = toolRef.current
      if ((tool !== 'brush' && tool !== 'eraser') || e.button !== 0 || spaceRef.current) return
      const d = docRef.current
      if (!d) return
      const layer = d.layers.find((l) => l.id === d.activeLayerId)
      if (!layer || layer.type === 'group') return
      // Mask 가 Active 이면 Bitmap 이 아니라 Mask 에 그린다 (Non-Destructive)
      // Adjustment Layer 는 Bitmap 이 없으므로 항상 Mask 에 그린다 (Photoshop 동작)
      const target: MaskTarget =
        (d.activeTarget === 'mask' || layer.type === 'adjustment') && layer.mask
          ? 'mask'
          : 'bitmap'
      if (layer.type === 'adjustment' && target !== 'mask') return
      // Eraser 의 Bitmap 지우기는 잠긴/배경 레이어 불가 (Unlock 이후 가능)
      if (layer.locked || (target === 'bitmap' && layer.type === 'background')) {
        toast('Layer is locked.', 'error')
        return
      }
      const w =
        target === 'mask'
          ? layer.mask!.bitmap.width
          : Math.max(1, Math.round(layer.width || d.width))
      const h =
        target === 'mask'
          ? layer.mask!.bitmap.height
          : Math.max(1, Math.round(layer.height || d.height))
      const base = makeCanvas(w, h)
      const bctx = base.getContext('2d')
      if (bctx) {
        if (target === 'mask') bctx.drawImage(layer.mask!.bitmap, 0, 0, w, h)
        else if (layer.bitmap) bctx.drawImage(layer.bitmap, 0, 0, w, h)
      }
      const buffer = makeCanvas(w, h)
      const working = makeCanvas(w, h)
      const s = stroke.current
      s.active = true
      s.layer = layer
      s.target = target
      s.erasing = tool === 'eraser'
      // 필압: 펜 태블릿은 e.pressure(0~1), 마우스는 1
      s.pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1
      s.w = w
      s.h = h
      s.base = base
      s.buffer = buffer
      s.bufferCtx = buffer.getContext('2d')
      s.working = working
      s.workingCtx = working.getContext('2d')
      s.localMask = buildLocalMask(d, layer, w, h)
      s.masked = s.localMask ? makeCanvas(w, h) : null
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      s.last = docToLayerLocal(p.x, p.y, layer)
      if (s.bufferCtx) stampDab(s.bufferCtx, s.last.x, s.last.y, opts())
      render()
      el!.setPointerCapture(e.pointerId)
    }

    function move(e: PointerEvent) {
      const s = stroke.current
      if (!s.active || !s.bufferCtx || !s.layer) return
      s.pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 1
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const raw = docToLayerLocal(p.x, p.y, s.layer)
      // Smoothing(보정): 포인터를 곧장 따라가지 않고 이전 위치에서 부드럽게 당겨온다
      const k = 1 - Math.max(0, Math.min(0.92, (brushRef.current.smoothing / 100) * 0.92))
      const local: Point = {
        x: s.last.x + (raw.x - s.last.x) * k,
        y: s.last.y + (raw.y - s.last.y) * k,
      }
      // Spacing: 브러시 크기 대비 dab 간격 비율
      const spacingRatio = Math.max(0.02, brushRef.current.spacing / 100)
      drawSegment(s.bufferCtx, s.last, local, opts(), spacingRatio)
      s.last = local
      render()
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
      if (d && s.layer && s.working) {
        const committed = s.working
        if (s.target === 'mask') {
          // Bitmap 은 절대 수정하지 않는다 — Mask 캔버스만 새로 교체
          dispatch({
            type: 'APPLY_LAYERS',
            id: d.id,
            layers: d.layers.map((l) =>
              l.id === s.layer!.id && l.mask
                ? { ...l, mask: { ...l.mask, bitmap: committed } }
                : l,
            ),
            label: s.erasing ? '레이어 마스크 지우기' : '마스크 페인트',
            historyType: 'mask',
          })
        } else {
          dispatch({
            type: 'APPLY_LAYERS',
            id: d.id,
            layers: d.layers.map((l) =>
              l.id === s.layer!.id ? { ...l, bitmap: committed, type: l.type === 'background' ? 'raster' : l.type } : l,
            ),
            label: s.erasing ? '지우개' : '브러시',
            historyType: 'brush',
          })
        }
      }
      brushRef.current.setPreview({ active: false, layerId: null, target: 'bitmap', canvas: null, version: s.version })
    }

    el.addEventListener('pointerdown', begin)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    return () => {
      el.removeEventListener('pointerdown', begin)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch, toast])

  // 키보드: B(브러시), [/] 크기, Shift+[/] 경도, 숫자 불투명도, Shift+숫자 흐름, ESC 팝업 닫기
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    /** [ / ] 한 스텝 — Photoshop처럼 크기에 비례해 증가 */
    function sizeStep(size: number) {
      if (size < 10) return 1
      if (size < 50) return 5
      if (size < 100) return 10
      if (size < 300) return 25
      return 50
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey) return
      const b = brushRef.current
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'brush' })
        return
      }
      if (e.key === 'e' || e.key === 'E') {
        // Shift+E 는 Background/Magic Eraser 순환 (현재 UI 만) — 도구는 Eraser 유지
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'eraser' })
        return
      }
      if (e.key === 'Escape' && (b.popupOpen || b.flyoutTool)) {
        e.preventDefault()
        b.setPopupOpen(false)
        b.setFlyoutTool(null)
        return
      }
      if (e.code === 'BracketLeft') {
        e.preventDefault()
        if (e.shiftKey) b.setHardness(b.hardness - 25)
        else b.setSize(b.size - sizeStep(b.size))
        return
      }
      if (e.code === 'BracketRight') {
        e.preventDefault()
        if (e.shiftKey) b.setHardness(b.hardness + 25)
        else b.setSize(b.size + sizeStep(b.size))
        return
      }
      // 숫자키 = 불투명도 10~100%, Shift+숫자 = 흐름 (Brush/Eraser Tool 활성 시)
      const t = toolRef.current
      if ((t === 'brush' || t === 'eraser') && /^Digit[0-9]$/.test(e.code)) {
        const d = Number(e.code.slice(5))
        const v = d === 0 ? 100 : d * 10
        if (e.shiftKey) b.setFlow(v)
        else b.setOpacity(v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
