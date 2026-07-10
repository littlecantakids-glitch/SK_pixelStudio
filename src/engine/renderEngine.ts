// Render Engine — Photoshop식 렌더 파이프라인.
// Layer Bitmap → Layer Mask → Opacity → Blend Mode → Composite 순서로 합성한다.
// Tool 은 Layer 를 수정하고 invalidate() 만 호출한다. 화면 출력은 RenderEngine 이 전담한다.
// requestAnimationFrame + dirty flag 로 한 프레임에 한 번만 렌더한다. Layer 는 캐시된다.
import type { Layer, OpenDocument } from '../types'
import { isMaskActive, maskAlphaCanvas, maskOverlayCanvas } from './maskEngine'
import { applyAdjustmentLayer } from './adjustmentEngine'
import { drawShapeOnCanvas, shapeSignature } from './shapeEngine'
import { drawTextOnCanvas, textSignature, getTextBitmap, clearTextCaches } from './textEngine'
import { renderGradientToCanvas } from './gradientEngine'
import { readPixels } from './samplingEngine'
import { onFontsChanged } from './fontManager'
import { flattenPath } from './pathEngine'
import { getSmartComposite, effectiveVersion, type ResolveSmart } from './smartEngine'
import { applyFilterStack, filterStackSignature } from './smartFilterEngine'
import type { Vec2 } from '../types'

import { BLEND_OP } from './blendModes'

// 비트맵 식별자 (캐시 키에 사용)
let bitmapSeq = 0
const bitmapIds = new WeakMap<object, number>()
function bitmapId(src: CanvasImageSource | undefined): number {
  if (!src) return 0
  const key = src as object
  let id = bitmapIds.get(key)
  if (id == null) {
    bitmapSeq += 1
    id = bitmapSeq
    bitmapIds.set(key, id)
  }
  return id
}

export type RenderStats = {
  fps: number
  renderTime: number
  layerCount: number
  overlayCount: number
  dirty: boolean
}

type CacheEntry = { sig: string; canvas: HTMLCanvasElement }

/** Mask 보기 모드 — solo: Alt+Click(마스크만 크게), overlay: \ 키(빨간 Rubylith) */
export type MaskViewState = { solo: boolean; overlay: boolean }

/**
 * Brush Cursor Overlay — Layer 가 아니라 RenderEngine 의 Overlay Renderer 가 그린다.
 * 좌표/크기는 Document 픽셀 기준이므로 Zoom/Pan 과 무관하게 항상 정확하다.
 * screenScale 은 선 두께를 화면 1px 로 유지하기 위한 카메라 배율.
 */
export type BrushCursorState = {
  x: number
  y: number
  size: number
  hardness: number
  screenScale: number
  /** Clone Stamp — 브러시 내부에 그릴 Source Composite Snapshot (없으면 일반 브러시 커서) */
  cloneSample?: HTMLCanvasElement | null
  /** Source 정렬 offset (targetStart - sourceStart, 문서 좌표) */
  cloneOffsetX?: number
  cloneOffsetY?: number
  /** 레이어 원점 대신 브러시 중심의 문서 좌표를 그대로 사용하므로 offset 만 있으면 된다 */
  cloneOverlayOpacity?: number
}

/**
 * Clone Stamp Source 표식 Overlay — Alt-Click 으로 지정한(또는 드래그 중 이동한) 복제 기준점.
 * Photoshop 처럼 십자(+) + Source Circle + (옵션)연결선을 문서 좌표로 그린다.
 * Zoom/Pan/DPI 와 무관하게 항상 선명하다 (선 두께는 화면 기준 px 로 환산).
 */
export type CloneSourceState = {
  x: number
  y: number
  screenScale: number
  /** Source Circle 반지름 (문서 픽셀 = 브러시 반지름). 0 이면 원 생략 */
  radius: number
  /** 마커 색상 rgb */
  color: [number, number, number]
  /** 마커/원 투명도 0~1 */
  opacity: number
  /** Target(브러시 중심) 연결선 끝점 (문서 좌표). 없으면 선 생략 */
  targetX?: number
  targetY?: number
}

/** Path Overlay — Anchor/Handle 뷰 (문서 좌표) */
export type PathAnchorView = {
  ax: number
  ay: number
  inx: number
  iny: number
  hasIn: boolean
  outx: number
  outy: number
  hasOut: boolean
  showHandles: boolean
  selected: boolean
  hover: boolean
}

/**
 * Pen Tool / Vector Path Overlay 상태 — RenderEngine 이 문서 좌표로 렌더한다.
 * Bezier Outline + Anchor(사각형) + Handle(선/원) + Hover + 고무줄 미리보기.
 * 선 두께/마커 크기는 화면(screenScale) 기준 px 로 환산해 Zoom/DPI 와 무관하게 선명하다.
 */
export type PathOverlayState = {
  screenScale: number
  /** 보이는 모든 Path 의 Bezier Outline */
  outlines: Path2D[]
  /** 활성 Path Outline (강조) */
  activeOutline: Path2D | null
  /** 활성 Path 의 Anchor/Handle */
  anchors: PathAnchorView[]
  /** 고무줄(마지막 Anchor → 커서) 미리보기 곡선 */
  rubber: { p2d: Path2D } | null
}

/** Gradient Tool 드래그 라인 오버레이 (doc 좌표) */
export type GradientOverlayState = {
  x0: number
  y0: number
  x1: number
  y1: number
  screenScale: number
}

/** 현재 화면에 마운트된 엔진 (DebugStats 가 참조) */
let activeEngine: RenderEngine | null = null
export function getActiveEngine(): RenderEngine | null {
  return activeEngine
}

export class RenderEngine {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private doc: OpenDocument | null = null
  private dirty = false
  private frameRequested = false
  private raf = 0
  private layerCache = new Map<string, CacheEntry>()
  private lastFrameTime = 0
  overlayCount = 0
  stats: RenderStats = { fps: 0, renderTime: 0, layerCount: 0, overlayCount: 0, dirty: false }

  private unsubFonts: (() => void) | null = null
  private resolveSmart: ResolveSmart | null = null

  /** Smart Object 렌더용 SmartDocument 조회자 주입 (LayerCanvas 가 documents 로부터 제공) */
  setSmartResolver(resolve: ResolveSmart | null) {
    this.resolveSmart = resolve
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    activeEngine = this
    // 폰트 로드/활성화 완료 시 텍스트 캐시 무효화 + 재렌더 (Missing Font → 실제 글꼴 반영)
    this.unsubFonts = onFontsChanged(() => {
      clearTextCaches()
      this.clearCache()
      this.invalidate()
    })
  }

  private maskView: MaskViewState = { solo: false, overlay: false }
  private brushCursor: BrushCursorState | null = null
  private cloneSource: CloneSourceState | null = null
  private pathOverlay: PathOverlayState | null = null
  private gradientOverlay: GradientOverlayState | null = null

  setScene(doc: OpenDocument) {
    this.doc = doc
  }

  setMaskView(view: MaskViewState) {
    this.maskView = view
  }

  /** 브러시 원형 커서 갱신 (null = 숨김). 호출 측에서 invalidate 필요 없음 — 여기서 예약한다. */
  setBrushCursor(cursor: BrushCursorState | null) {
    const prev = this.brushCursor
    if (!prev && !cursor) return
    this.brushCursor = cursor
    this.invalidate()
  }

  /** Clone Stamp Source 표식 갱신 (null = 숨김). 호출 측에서 invalidate 불필요 — 여기서 예약. */
  setCloneSource(source: CloneSourceState | null) {
    const prev = this.cloneSource
    if (!prev && !source) return
    this.cloneSource = source
    this.invalidate()
  }

  /** Pen Tool / Vector Path Overlay 갱신 (null = 숨김). 호출 측 invalidate 불필요. */
  setPathOverlay(overlay: PathOverlayState | null) {
    const prev = this.pathOverlay
    if (!prev && !overlay) return
    this.pathOverlay = overlay
    this.invalidate()
  }

  /** Gradient Tool 드래그 라인 오버레이 갱신 (null = 숨김). */
  setGradientOverlay(overlay: GradientOverlayState | null) {
    const prev = this.gradientOverlay
    if (!prev && !overlay) return
    this.gradientOverlay = overlay
    this.invalidate()
  }

  /** 레이어 캐시 전체 무효화 (브러시/마스크 페인트 프리뷰처럼 같은 캔버스가 제자리 갱신될 때) */
  clearCache() {
    this.layerCache.clear()
  }

  /** Sampling 중 여부 — renderDocument 가 오버레이/캐시 정리를 건너뛴다 */
  private sampling = false

  /**
   * Eyedropper 등 Color Tool 용 픽셀 샘플 — RenderEngine 과 완전히 동일한 Pixel Pipeline.
   * Layer 직접 접근 없이, 주어진 문서(Sample Source 에 따라 레이어가 걸러진 문서)를
   * 같은 파이프라인으로 렌더한 결과에서 size×size 블록을 읽는다.
   * Zoom/Rotate/Viewport 와 무관하게 문서 픽셀 좌표 기준으로 동일한 결과를 반환한다.
   */
  getSampleImage(doc: OpenDocument, x: number, y: number, size: number): ImageData | null {
    const w = this.canvas.width
    const h = this.canvas.height
    const half = Math.floor(size / 2)
    const rx = Math.max(0, Math.min(w - 1, Math.round(x) - half))
    const ry = Math.max(0, Math.min(h - 1, Math.round(y) - half))
    const rw = Math.min(w - rx, size)
    const rh = Math.min(h - ry, size)
    if (rw <= 0 || rh <= 0) return null

    const prevDoc = this.doc
    this.sampling = true
    try {
      // Sample Source 문서를 동일 파이프라인으로 렌더 (오버레이 제외)
      this.renderDocument(doc)
      // 화면 캔버스 직접 getImageData 반복 호출은 willReadFrequently 경고/성능 저하 유발
      // → 판독 전용 캔버스를 경유해 읽는다
      return readPixels(this.canvas, rx, ry, rw, rh)
    } catch {
      return null
    } finally {
      this.sampling = false
      // 원래 문서 복원 렌더 (같은 프레임 안에서 복원되므로 화면 깜박임 없음)
      if (prevDoc) {
        this.doc = prevDoc
        this.renderDocument(prevDoc)
      }
    }
  }

  /** 렌더 요청 — dirty 표시 후 rAF 예약 (여러 번 호출해도 프레임당 1회) */
  invalidate() {
    this.dirty = true
    this.stats.dirty = true
    if (this.frameRequested) return
    this.frameRequested = true
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (t: number) => {
    this.frameRequested = false
    if (!this.dirty) return
    this.render(t)
  }

  render(t = performance.now()) {
    const doc = this.doc
    if (!doc) return
    const start = performance.now()

    if (this.canvas.width !== doc.width || this.canvas.height !== doc.height) {
      this.canvas.width = doc.width
      this.canvas.height = doc.height
    }
    this.renderDocument(doc)

    // 통계
    const now = performance.now()
    this.stats.renderTime = Math.round((now - start) * 100) / 100
    if (this.lastFrameTime) {
      const delta = t - this.lastFrameTime
      if (delta > 0) this.stats.fps = Math.round(1000 / delta)
    }
    this.lastFrameTime = t
    this.stats.layerCount = doc.layers.length
    this.stats.overlayCount = this.overlayCount
    this.dirty = false
    this.stats.dirty = false
  }

  // 1) Document → Background → Layer Stack
  private renderDocument(doc: OpenDocument) {
    const ctx = this.ctx
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Mask Solo — Alt+Mask Click: 활성 레이어의 마스크만 Grayscale 로 표시
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId)
    if (!this.sampling && this.maskView.solo && activeLayer?.mask) {
      this.renderMaskSolo(activeLayer)
      if (this.brushCursor) this.renderBrushCursor(this.brushCursor)
      this.pruneCache(doc)
      return
    }

    const fillBg = doc.background !== 'transparent' && doc.background !== 'image'
    if (fillBg) {
      let color = '#ffffff'
      if (doc.background === 'black') color = '#000000'
      else if (doc.background?.startsWith('#')) color = doc.background
      ctx.fillStyle = color
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }

    this.renderLayerStack(doc)

    // Sampling 렌더 — UI 오버레이/캐시 정리 없이 순수 합성 결과만
    if (this.sampling) return

    // Mask Overlay — \ 키: 마스크가 숨기는 영역을 빨간 Rubylith 로 표시
    if (this.maskView.overlay && activeLayer?.mask && activeLayer.maskEnabled !== false) {
      this.renderMaskOverlay(activeLayer)
    }

    // Vector Path Overlay (Pen Tool)
    if (this.pathOverlay) this.renderPathOverlay(this.pathOverlay)

    // Clone Stamp Source 표식 — 브러시 커서 아래에 그린다
    if (this.cloneSource) this.renderCloneSource(this.cloneSource)

    // Gradient Tool 드래그 라인
    if (this.gradientOverlay) this.renderGradientOverlay(this.gradientOverlay)

    // Brush Cursor Overlay — 항상 최상단
    if (this.brushCursor) this.renderBrushCursor(this.brushCursor)

    this.pruneCache(doc)
  }

  /** Gradient 드래그 라인 — 흰 밑선 + 검은 본선 + 시작/끝 핸들 (Photoshop 스타일) */
  private renderGradientOverlay(o: GradientOverlayState) {
    const ctx = this.ctx
    const s = Math.max(0.01, o.screenScale)
    const lw = 1 / s
    const r = 3.5 / s
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    // 라인
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = lw * 2.5
    ctx.beginPath()
    ctx.moveTo(o.x0, o.y0)
    ctx.lineTo(o.x1, o.y1)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(o.x0, o.y0)
    ctx.lineTo(o.x1, o.y1)
    ctx.stroke()
    // 핸들 — 시작(원) / 끝(사각)
    const handle = (x: number, y: number, square: boolean) => {
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.lineWidth = lw
      ctx.beginPath()
      if (square) ctx.rect(x - r, y - r, r * 2, r * 2)
      else ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    handle(o.x0, o.y0, false)
    handle(o.x1, o.y1, true)
    ctx.restore()
  }

  /** Pen Tool Vector Path Overlay — Bezier + Anchor + Handle + Hover + 고무줄 */
  private renderPathOverlay(o: PathOverlayState) {
    const ctx = this.ctx
    const s = Math.max(0.01, o.screenScale)
    const lw = 1 / s
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // 1) Outline (모든 보이는 Path) — 흰 밑선 + 파란 본선으로 가시성 확보
    const strokeOutline = (p: Path2D, active: boolean) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = lw * 2
      ctx.stroke(p)
      ctx.strokeStyle = active ? 'rgba(20,120,235,0.95)' : 'rgba(120,120,120,0.9)'
      ctx.lineWidth = lw
      ctx.stroke(p)
    }
    for (const p of o.outlines) strokeOutline(p, false)
    if (o.activeOutline) strokeOutline(o.activeOutline, true)

    // 2) 고무줄 미리보기 (마지막 Anchor → 커서)
    if (o.rubber) {
      ctx.setLineDash([4 / s, 3 / s])
      ctx.strokeStyle = 'rgba(20,120,235,0.8)'
      ctx.lineWidth = lw
      ctx.stroke(o.rubber.p2d)
      ctx.setLineDash([])
    }

    // 3) Handle (선 + 원형 제어점)
    const hr = 3 / s
    for (const a of o.anchors) {
      if (!a.showHandles) continue
      ctx.strokeStyle = 'rgba(20,120,235,0.85)'
      ctx.lineWidth = lw
      if (a.hasIn) {
        ctx.beginPath()
        ctx.moveTo(a.ax, a.ay)
        ctx.lineTo(a.inx, a.iny)
        ctx.stroke()
        this.dot(a.inx, a.iny, hr, '#ffffff', 'rgba(20,120,235,0.95)', lw)
      }
      if (a.hasOut) {
        ctx.beginPath()
        ctx.moveTo(a.ax, a.ay)
        ctx.lineTo(a.outx, a.outy)
        ctx.stroke()
        this.dot(a.outx, a.outy, hr, '#ffffff', 'rgba(20,120,235,0.95)', lw)
      }
    }

    // 4) Anchor (사각형) — selected 채움, hover 강조
    const half = 3.2 / s
    for (const a of o.anchors) {
      const size = half * 2
      ctx.lineWidth = lw
      ctx.strokeStyle = 'rgba(10,90,200,0.95)'
      ctx.fillStyle = a.selected ? 'rgba(20,120,235,0.95)' : '#ffffff'
      ctx.beginPath()
      ctx.rect(a.ax - half, a.ay - half, size, size)
      ctx.fill()
      ctx.stroke()
      if (a.hover) {
        ctx.strokeStyle = 'rgba(20,120,235,0.9)'
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.rect(a.ax - half * 1.9, a.ay - half * 1.9, size * 1.9, size * 1.9)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  private dot(x: number, y: number, r: number, fill: string, stroke: string, lw: number) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.lineWidth = lw
    ctx.strokeStyle = stroke
    ctx.stroke()
  }

  /** Clone Stamp Source 표식 — 십자(+) + Source Circle(반지름) + (옵션)Target 연결선 */
  private renderCloneSource(c: CloneSourceState) {
    const ctx = this.ctx
    const s = Math.max(0.01, c.screenScale)
    const arm = 9 / s // 화면 기준 9px 길이의 팔
    const gap = 2.5 / s
    const lw = 1 / s
    const [cr, cg, cb] = c.color
    const a = Math.max(0, Math.min(1, c.opacity))
    const col = `rgba(${cr},${cg},${cb},${a})`
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    // Target 연결선 (Source → 브러시 중심)
    if (c.targetX != null && c.targetY != null) {
      ctx.setLineDash([5 / s, 4 / s])
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = lw * 2
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(c.targetX, c.targetY)
      ctx.stroke()
      ctx.strokeStyle = col
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(c.targetX, c.targetY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Source Circle (브러시 반지름)
    if (c.radius > 0.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = lw * 2
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = col
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 중앙 십자(+)
    const stroke = (color: string, width: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(c.x - arm, c.y)
      ctx.lineTo(c.x - gap, c.y)
      ctx.moveTo(c.x + gap, c.y)
      ctx.lineTo(c.x + arm, c.y)
      ctx.moveTo(c.x, c.y - arm)
      ctx.lineTo(c.x, c.y - gap)
      ctx.moveTo(c.x, c.y + gap)
      ctx.lineTo(c.x, c.y + arm)
      ctx.stroke()
    }
    stroke('rgba(255,255,255,0.9)', lw * 3)
    stroke(col, lw)
    // 중심 작은 점
    ctx.beginPath()
    ctx.arc(c.x, c.y, 1.5 / s, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.fill()
    ctx.restore()
  }

  /** Photoshop식 원형 브러시 커서 — 어두운 원 + 밝은 테두리, 경도에 따라 내부 원 표시 */
  private renderBrushCursor(c: BrushCursorState) {
    const ctx = this.ctx
    const r = Math.max(0.5, c.size / 2)
    const lw = 1 / Math.max(0.01, c.screenScale) // 화면 기준 1px

    // Clone Stamp — 브러시 내부에 Source Composite 실시간 미리보기 (원으로 클립)
    if (c.cloneSample && c.cloneOffsetX != null && c.cloneOffsetY != null) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.globalAlpha = Math.max(0, Math.min(1, c.cloneOverlayOpacity ?? 0.5))
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // 브러시 중심 T 에 대응하는 Source = T - offset. Source 를 offset 만큼 이동시켜 그린다.
      const sx = c.x - r - c.cloneOffsetX
      const sy = c.y - r - c.cloneOffsetY
      const d = r * 2
      try {
        ctx.drawImage(c.cloneSample, sx, sy, d, d, c.x - r, c.y - r, d, d)
      } catch {
        /* noop */
      }
      ctx.restore()
    }

    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    // 밝은 외곽 (어두운 이미지 위 가시성)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = lw * 2
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.stroke()
    // 어두운 본선
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.stroke()
    // 경도 < 100% 이면 실제 단단한 영역을 안쪽 원으로 표시
    if (c.hardness < 100 && r > 3) {
      const ir = r * Math.max(0.05, c.hardness / 100)
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'
      ctx.setLineDash([lw * 3, lw * 3])
      ctx.beginPath()
      ctx.arc(c.x, c.y, ir, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // 매우 작은 브러시는 십자 표시
    if (r * c.screenScale < 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(c.x - 5 / c.screenScale, c.y)
      ctx.lineTo(c.x + 5 / c.screenScale, c.y)
      ctx.moveTo(c.x, c.y - 5 / c.screenScale)
      ctx.lineTo(c.x, c.y + 5 / c.screenScale)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** 레이어 지오메트리(위치/회전) 변환을 ctx 에 적용 */
  private applyLayerTransform(ctx: CanvasRenderingContext2D, layer: Layer, lw: number, lh: number) {
    if (!layer.rotation) return
    const px = layer.pivotX ?? layer.x + lw / 2
    const py = layer.pivotY ?? layer.y + lh / 2
    ctx.translate(px, py)
    ctx.rotate((layer.rotation * Math.PI) / 180)
    ctx.translate(-px, -py)
  }

  /** Mask 만 크게 보기 — 문서 전체를 흰색으로 채우고 마스크 Grayscale 을 그린다 */
  private renderMaskSolo(layer: Layer) {
    const ctx = this.ctx
    const lw = layer.width || this.canvas.width
    const lh = layer.height || this.canvas.height
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.save()
    this.applyLayerTransform(ctx, layer, lw, lh)
    try {
      ctx.drawImage(layer.mask!.bitmap, layer.x, layer.y, lw, lh)
    } catch {
      /* noop */
    }
    ctx.restore()
  }

  /** Rubylith Overlay — 합성 결과 위에 마스크 숨김 영역을 반투명 빨강으로 */
  private renderMaskOverlay(layer: Layer) {
    const ctx = this.ctx
    const lw = layer.width || this.canvas.width
    const lh = layer.height || this.canvas.height
    ctx.save()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    this.applyLayerTransform(ctx, layer, lw, lh)
    try {
      ctx.drawImage(maskOverlayCanvas(layer.mask!), layer.x, layer.y, lw, lh)
    } catch {
      /* noop */
    }
    ctx.restore()
  }

  // 2) Layer Stack — 배열 index 0 = 최상단이므로 아래(마지막)부터 합성.
  //    Adjustment Layer 는 아래 합성 결과에 실시간 계산만 적용한다 (Bitmap 수정 없음).
  private renderLayerStack(doc: OpenDocument) {
    const byId = new Map(doc.layers.map((l) => [l.id, l]))
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const layer = doc.layers[i]
      if (!this.isVisible(layer, byId)) continue
      if (layer.type === 'adjustment') {
        // Bitmap → Adjustment → Mask → Blend → Opacity → Composite
        applyAdjustmentLayer(
          this.ctx,
          this.canvas.width,
          this.canvas.height,
          layer,
          BLEND_OP[layer.blendMode] ?? 'source-over',
        )
        continue
      }
      if (layer.type === 'shape' && layer.shape) {
        // Shape Layer — Bitmap 대신 Vector 를 실시간 렌더 (Rasterize 없음)
        const shapeCanvas = this.renderVectorLayer(
          layer,
          `shape:${shapeSignature(layer)}`,
          (ctx) => drawShapeOnCanvas(ctx, layer.shape!),
        )
        if (shapeCanvas) this.composite(layer, shapeCanvas)
        continue
      }
      if (layer.type === 'text' && layer.text) {
        // Type Layer — Bitmap 대신 Text 를 실시간 렌더 (Rasterize 없음)
        // Text on Path: pathId 가 있으면 Document Path 를 평탄화해 로컬 좌표 폴리라인으로 전달
        let poly: Vec2[] | undefined
        let pathSig = ''
        if (layer.text.pathId) {
          const vp = doc.paths?.find((p) => p.id === layer.text!.pathId)
          if (vp) {
            poly = flattenPath(vp).map((pt) => ({ x: pt.x - layer.x, y: pt.y - layer.y }))
            pathSig = `:path${vp.points.length}:${poly.length}:${poly[0]?.x.toFixed(0)},${poly[0]?.y.toFixed(0)}:${poly[poly.length - 1]?.x.toFixed(0)}`
          }
        }
        const baseDraw = poly
          ? // Text on Path — 글자가 패스를 따라 임의 위치에 놓이므로 직접 렌더(캐시 제외)
            (ctx: CanvasRenderingContext2D) => drawTextOnCanvas(ctx, layer.text!, poly)
          : // 일반/단락/세로/Warp — Glyph Bitmap Cache 재사용 후 drawImage 합성
            (ctx: CanvasRenderingContext2D) => {
              const b = getTextBitmap(layer.text!)
              ctx.drawImage(b.canvas, b.dx, b.dy)
            }
        // Text Fill Gradient — 렌더된 글리프 알파에 Gradient Engine 결과를 source-in 합성
        const fg = layer.text.fillGradient
        const draw = fg
          ? (ctx: CanvasRenderingContext2D) => {
              baseDraw(ctx)
              const pad = 128
              const gw = Math.max(1, Math.ceil(layer.width || 64)) + pad * 2
              const gh = Math.max(1, Math.ceil(layer.height || 64)) + pad * 2
              const gc = renderGradientToCanvas(
                gw,
                gh,
                fg.gradient,
                {
                  x0: fg.geom.x0 + pad,
                  y0: fg.geom.y0 + pad,
                  x1: fg.geom.x1 + pad,
                  y1: fg.geom.y1 + pad,
                },
                { fg: '#000000', bg: '#ffffff', transparency: true },
              )
              ctx.save()
              ctx.globalCompositeOperation = 'source-in'
              ctx.drawImage(gc, -pad, -pad)
              ctx.restore()
            }
          : baseDraw
        const textCanvas = this.renderVectorLayer(layer, `text:${textSignature(layer)}${pathSig}`, draw)
        if (textCanvas) this.composite(layer, textCanvas)
        continue
      }
      if (layer.type === 'smartObject' && layer.smartDocId && this.resolveSmart) {
        // Smart Object — SmartDocument 합성 결과(캐시)를 Transform 시점에만 배치 (Bitmap 비파괴)
        const sd = this.resolveSmart(layer.smartDocId)
        if (sd) {
          const base = getSmartComposite(sd, this.resolveSmart)
          const ver = effectiveVersion(sd, this.resolveSmart)
          // Smart Filter Stack — 비파괴 적용 (원본 미수정). Cache 는 입력 버전으로 무효화.
          const filters = layer.smartFilters ?? []
          const src = filters.length
            ? applyFilterStack(base, filters, `${sd.id}:${ver}`)
            : base
          const fsig = filters.length ? filterStackSignature(filters) : ''
          const smartCanvas = this.renderVectorLayer(
            layer,
            `smart:${layer.smartDocId}:v${ver}:${sd.width}x${sd.height}:f${fsig}`,
            (ctx) => {
              // renderVectorLayer 가 이미 layer.x/y 로 translate 했으므로 로컬 (0,0) 에 배치
              const lw = layer.width || this.canvas.width
              const lh = layer.height || this.canvas.height
              ctx.drawImage(src, 0, 0, lw, lh)
            },
          )
          if (smartCanvas) this.composite(layer, smartCanvas)
        }
        continue
      }
      if (!layer.bitmap) continue
      const cached = this.renderLayer(layer)
      if (cached) this.composite(layer, cached)
    }
  }

  private isVisible(layer: Layer, byId: Map<string, Layer>): boolean {
    if (!layer.visible) return false
    if (layer.type === 'group') return false
    // 중첩 그룹 — 조상 그룹 중 하나라도 숨김이면 보이지 않는다 (순환 방지 상한 포함)
    let parentId = layer.parentId
    for (let depth = 0; parentId && depth < 64; depth++) {
      const parent = byId.get(parentId)
      if (!parent) break
      if (!parent.visible) return false
      parentId = parent.parentId
    }
    return true
  }

  // 3) Layer Renderer — Layer Bitmap → Layer Mask 를 캐시 캔버스로 렌더. opacity/blend 는 제외.
  //    Bitmap Alpha × Mask Gray 로 최종 Alpha 를 계산하며, Bitmap 은 절대 수정하지 않는다.
  private renderLayer(layer: Layer): HTMLCanvasElement | null {
    if (!layer.bitmap) return null
    const w = this.canvas.width
    const h = this.canvas.height
    const lw = layer.width || w
    const lh = layer.height || h
    const maskOn = isMaskActive(layer)
    const maskSig = maskOn
      ? `${bitmapId(layer.mask!.bitmap)}:${layer.maskDensity ?? 100}:${layer.maskFeather ?? 0}`
      : 'off'
    const sig = `${bitmapId(layer.bitmap)}:${layer.x},${layer.y},${lw},${lh}:${layer.rotation}:${layer.pivotX ?? ''},${layer.pivotY ?? ''}:${w}x${h}:m${maskSig}`
    const hit = this.layerCache.get(layer.id)
    if (hit && hit.sig === sig) return hit.canvas

    const canvas = hit?.canvas ?? document.createElement('canvas')
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    this.applyLayerTransform(ctx, layer, lw, lh)
    try {
      ctx.drawImage(layer.bitmap, layer.x, layer.y, lw, lh)
      if (maskOn) {
        // Mask Gray → Alpha 캔버스를 destination-in 으로 곱해 최종 Alpha 계산
        ctx.globalCompositeOperation = 'destination-in'
        ctx.drawImage(
          maskAlphaCanvas(layer.mask!, layer.maskDensity ?? 100, layer.maskFeather ?? 0),
          layer.x,
          layer.y,
          lw,
          lh,
        )
        ctx.globalCompositeOperation = 'source-over'
      }
    } catch {
      /* noop */
    }
    ctx.restore()
    this.layerCache.set(layer.id, { sig, canvas })
    return canvas
  }

  // 3b) Vector Layer Renderer (Shape / Text) — Vector 를 문서 크기 캐시 캔버스에 그린 뒤
  //     Layer Mask 를 곱한다. Bitmap 은 없다. RenderEngine 이 매 변경 시 실시간 렌더한다.
  //     draw 콜백은 레이어 원점(layer.x/y)으로 translate 된 ctx 에 로컬 좌표로 그린다.
  private renderVectorLayer(
    layer: Layer,
    contentSig: string,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): HTMLCanvasElement | null {
    const w = this.canvas.width
    const h = this.canvas.height
    const lw = layer.width || w
    const lh = layer.height || h
    const maskOn = isMaskActive(layer)
    const maskSig = maskOn
      ? `${bitmapId(layer.mask!.bitmap)}:${layer.maskDensity ?? 100}:${layer.maskFeather ?? 0}`
      : 'off'
    const sig = `${contentSig}:@${layer.x},${layer.y}:${layer.rotation}:${layer.pivotX ?? ''},${layer.pivotY ?? ''}:${w}x${h}:m${maskSig}`
    const hit = this.layerCache.get(layer.id)
    if (hit && hit.sig === sig) return hit.canvas

    const canvas = hit?.canvas ?? document.createElement('canvas')
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    this.applyLayerTransform(ctx, layer, lw, lh)
    // 레이어 원점으로 이동 후 로컬 좌표로 Vector 를 그린다
    ctx.translate(layer.x, layer.y)
    try {
      draw(ctx)
    } catch {
      /* noop */
    }
    ctx.restore()
    if (maskOn) {
      ctx.save()
      this.applyLayerTransform(ctx, layer, lw, lh)
      ctx.globalCompositeOperation = 'destination-in'
      try {
        ctx.drawImage(
          maskAlphaCanvas(layer.mask!, layer.maskDensity ?? 100, layer.maskFeather ?? 0),
          layer.x,
          layer.y,
          lw,
          lh,
        )
      } catch {
        /* noop */
      }
      ctx.restore()
    }
    this.layerCache.set(layer.id, { sig, canvas })
    return canvas
  }

  // 4) Composite — save → globalAlpha → globalCompositeOperation → drawImage → restore
  private composite(layer: Layer, layerCanvas: HTMLCanvasElement) {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, (layer.opacity / 100) * (layer.fill / 100)))
    ctx.globalCompositeOperation = BLEND_OP[layer.blendMode] ?? 'source-over'
    ctx.drawImage(layerCanvas, 0, 0)
    ctx.restore()
  }

  // 사라진 레이어의 캐시 제거
  private pruneCache(doc: OpenDocument) {
    if (this.layerCache.size <= doc.layers.length) return
    const alive = new Set(doc.layers.map((l) => l.id))
    for (const id of this.layerCache.keys()) {
      if (!alive.has(id)) this.layerCache.delete(id)
    }
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.layerCache.clear()
    this.unsubFonts?.()
    this.unsubFonts = null
    if (activeEngine === this) activeEngine = null
  }
}
