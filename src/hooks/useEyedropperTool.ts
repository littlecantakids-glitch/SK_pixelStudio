import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useEyedropperStore } from '../store/eyedropperStore'
import { getActiveEngine } from '../engine/renderEngine'
import { averageColor, readPixels, rgbToHex, type RGBA } from '../engine/samplingEngine'
import type { Layer, OpenDocument } from '../types'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

const HUD_ZOOM = 9
const HUD_GRID = 11 // 11×11 픽셀 확대 미리보기

/**
 * Eyedropper Tool — RenderEngine 과 동일한 Pixel Pipeline 로 Color Sampling.
 * - Click = Foreground / Alt+Click = Background (History 생성 없음)
 * - Sample Size(Point~101×101 평균) / Sample Source(현재/현재 및 아래/모든 레이어)
 * - Mask 편집 중에는 Mask Gray 를 샘플링
 * - Hover 시 HUD 확대 미리보기 + Status Bar 색상 표시 (Zoom/Viewport 와 독립)
 */
export function useEyedropperTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const eye = useEyedropperStore()

  const stateRef = useRef({ activeTool, doc, eye })
  stateRef.current = { activeTool, doc, eye }
  const lastSample = useRef(0)
  const hudRef = useRef<{ root: HTMLDivElement; canvas: HTMLCanvasElement; label: HTMLDivElement; swatch: HTMLSpanElement } | null>(null)

  /** Sample Source 에 따라 레이어를 거른 문서 (RenderEngine 이 동일 파이프라인으로 렌더) */
  const sourceDoc = (d: OpenDocument): OpenDocument => {
    const src = stateRef.current.eye.sampleSource
    if (src === 'all') return d
    const idx = d.layers.findIndex((l) => l.id === d.activeLayerId)
    if (idx < 0) return d
    if (src === 'current')
      return { ...d, background: 'transparent', layers: [d.layers[idx]] }
    // currentBelow — 배열 index 0 = 최상단이므로 현재부터 아래(뒤쪽) 전부
    return { ...d, layers: d.layers.slice(idx) }
  }

  /** Mask 편집 중이면 Mask Gray 를 직접 샘플 (레이어 로컬 좌표) */
  const sampleMask = (layer: Layer, x: number, y: number, size: number): RGBA | null => {
    const mask = layer.mask!
    const mx = Math.round(x - layer.x)
    const my = Math.round(y - layer.y)
    const half = Math.floor(size / 2)
    const rx = Math.max(0, Math.min(mask.bitmap.width - 1, mx - half))
    const ry = Math.max(0, Math.min(mask.bitmap.height - 1, my - half))
    const rw = Math.min(mask.bitmap.width - rx, size)
    const rh = Math.min(mask.bitmap.height - ry, size)
    if (rw <= 0 || rh <= 0) return null
    // 같은 마스크 캔버스를 호버마다 직접 getImageData 하면 willReadFrequently 경고 발생
    const img = readPixels(mask.bitmap, rx, ry, rw, rh)
    if (!img) return null
    const c = averageColor(img)
    if (!c) return null
    const gray = Math.round((c.r + c.g + c.b) / 3)
    return { r: gray, g: gray, b: gray, a: 255 }
  }

  /** 현재 옵션 기준 색 샘플 (문서 픽셀 좌표) */
  const sample = (x: number, y: number, size?: number): RGBA | null => {
    const d = stateRef.current.doc
    const engine = getActiveEngine()
    if (!d || !engine) return null
    if (x < 0 || y < 0 || x >= d.width || y >= d.height) return null
    const sz = size ?? stateRef.current.eye.sampleSize
    const layer = d.layers.find((l) => l.id === d.activeLayerId)
    const masking = d.activeTarget === 'mask' && !!layer?.mask
    stateRef.current.eye.setMaskSampling(masking)
    if (masking && layer) return sampleMask(layer, x, y, sz)
    const img = engine.getSampleImage(sourceDoc(d), x, y, sz)
    return img ? averageColor(img) : null
  }

  // ── HUD (확대 미리보기) — DOM 직접 관리 (React 리렌더 없이 pointermove 갱신) ──
  const ensureHud = (): NonNullable<typeof hudRef.current> | null => {
    const container = vp.containerRef.current
    if (!container) return null
    if (hudRef.current) return hudRef.current
    const root = document.createElement('div')
    root.className = 'eyedrop-hud'
    const canvas = document.createElement('canvas')
    canvas.className = 'eyedrop-hud__mag'
    canvas.width = HUD_GRID * HUD_ZOOM
    canvas.height = HUD_GRID * HUD_ZOOM
    const row = document.createElement('div')
    row.className = 'eyedrop-hud__row'
    const swatch = document.createElement('span')
    swatch.className = 'eyedrop-hud__swatch'
    const label = document.createElement('div')
    label.className = 'eyedrop-hud__label'
    row.appendChild(swatch)
    row.appendChild(label)
    root.appendChild(canvas)
    root.appendChild(row)
    container.appendChild(root)
    hudRef.current = { root, canvas, label, swatch }
    return hudRef.current
  }

  const hideHud = () => {
    if (hudRef.current) hudRef.current.root.style.display = 'none'
  }

  const updateHud = (clientX: number, clientY: number, x: number, y: number, color: RGBA | null) => {
    const { eye: e, doc: d } = stateRef.current
    const container = vp.containerRef.current
    const engine = getActiveEngine()
    if (!e.showHud || !d || !engine || !container) return hideHud()
    const hud = ensureHud()
    if (!hud) return
    const img = d.activeTarget === 'mask' && d.layers.find((l) => l.id === d.activeLayerId)?.mask
      ? null // Mask 편집 중에는 화면 자체가 회색이 아니므로 합성 결과로 대체
      : engine.getSampleImage(sourceDoc(d), x, y, HUD_GRID)
    const ctx = hud.canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#2b2b2b'
    ctx.fillRect(0, 0, hud.canvas.width, hud.canvas.height)
    if (img) {
      // ImageData → 확대 (nearest neighbor)
      const tmp = document.createElement('canvas')
      tmp.width = img.width
      tmp.height = img.height
      tmp.getContext('2d')!.putImageData(img, 0, 0)
      ctx.drawImage(tmp, 0, 0, img.width * HUD_ZOOM, img.height * HUD_ZOOM)
    }
    // 중앙 픽셀 하이라이트
    const c = Math.floor(HUD_GRID / 2) * HUD_ZOOM
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.strokeRect(c - 0.5, c - 0.5, HUD_ZOOM + 1, HUD_ZOOM + 1)
    ctx.strokeStyle = '#000000'
    ctx.strokeRect(c - 1.5, c - 1.5, HUD_ZOOM + 3, HUD_ZOOM + 3)

    const hex = color ? rgbToHex(color) : '--'
    hud.swatch.style.background = color ? hex : 'transparent'
    hud.label.textContent = color ? `${hex}  R${color.r} G${color.g} B${color.b}` : '투명'

    // 커서 우하단에 배치 (컨테이너 기준, 경계 클램프)
    const r = container.getBoundingClientRect()
    const hw = hud.canvas.width + 12
    let left = clientX - r.left + 18
    let top = clientY - r.top + 18
    if (left + hw > r.width) left = clientX - r.left - hw - 6
    if (top + hw + 20 > r.height) top = clientY - r.top - hw - 12
    hud.root.style.display = 'block'
    hud.root.style.left = `${left}px`
    hud.root.style.top = `${top}px`
  }

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function move(e: PointerEvent) {
      const { activeTool: tool, doc: d, eye: ey } = stateRef.current
      if (tool !== 'eyedropper' || !d) return
      const now = performance.now()
      if (now - lastSample.current < 40) return // 샘플링 스로틀 (재렌더 비용)
      lastSample.current = now
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const x = Math.floor(p.x)
      const y = Math.floor(p.y)
      if (x < 0 || y < 0 || x >= d.width || y >= d.height) {
        ey.setHover(null)
        hideHud()
        return
      }
      const color = sample(x, y)
      ey.setHover(color)
      updateHud(e.clientX, e.clientY, x, y, color)
    }

    function down(e: PointerEvent) {
      const { activeTool: tool, doc: d } = stateRef.current
      if (tool !== 'eyedropper' || e.button !== 0 || !d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const color = sample(Math.floor(p.x), Math.floor(p.y))
      if (!color) return
      const hex = rgbToHex(color)
      // Alt+Click = Background / Click = Foreground — History 생성 없음
      if (e.altKey) dispatch({ type: 'SET_BACKGROUND', color: hex })
      else dispatch({ type: 'SET_FOREGROUND', color: hex })
    }

    function leave() {
      stateRef.current.eye.setHover(null)
      hideHud()
    }

    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerleave', leave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch])

  // 도구 전환 시 커서/HUD 정리 + 커서 속성
  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return
    if (activeTool === 'eyedropper') {
      el.dataset.eyedropper = '1'
    } else {
      delete el.dataset.eyedropper
      eye.setHover(null)
      eye.setMaskSampling(false)
      hideHud()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])

  // 언마운트 시 HUD 제거
  useEffect(() => {
    return () => {
      hudRef.current?.root.remove()
      hudRef.current = null
    }
  }, [])

  // I — Eyedropper Tool 선택
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'eyedropper' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
