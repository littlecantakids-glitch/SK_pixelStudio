// Clone Renderer — Clone Stamp 의 렌더 파이프라인을 React 와 분리한 순수 엔진.
//
//   Brush Engine (Dab 생성)  →  Clone Renderer (Sample 정렬 · 합성)  →  Bitmap Commit
//
// 이 계층 분리는 향후 WebGL/WebGPU Renderer 로의 교체를 대비한다.
// Renderer 는 "입력(Dab/Sample/Selection) → 출력(working canvas)" 만 담당하며 DOM/React 를 모른다.
//
// 성능:
//  - Source Composite 는 Stroke 시작 시 1회 정렬(translated)하고 Stroke 동안 재사용 (Source Cache).
//  - Dirty Rect 기반 부분 합성으로 대형 브러시(1000~3000px)에서도 프레임당 최소 픽셀만 갱신.
//  - Offscreen 캔버스는 Stroke 동안 재사용하고 종료 시 dispose.
import { drawSegment, enableHQSampling, stampDab, type BrushOptions, type Point } from './brushEngine'

export type Rect = { x: number; y: number; w: number; h: number }

export type CloneRendererInit = {
  /** 대상 레이어 비트맵 크기 (레이어 로컬 픽셀) */
  width: number
  height: number
  /** 대상 레이어 원본 픽셀 (없으면 빈 캔버스) */
  base: CanvasImageSource | null
  /** 문서 크기 Source Composite Snapshot */
  sample: HTMLCanvasElement
  /** targetStart - sourceStart (문서 좌표) */
  offset: { x: number; y: number }
  /** 레이어 원점 (문서 좌표) — 회전 0 가정 */
  origin: { x: number; y: number }
  /** 선택 영역 로컬 알파 마스크 (없으면 전체 허용) */
  selection: HTMLCanvasElement | null
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

/** 두 점을 감싸는 반지름 r 여유의 정수 사각형 (레이어 로컬) */
function segmentRect(from: Point, to: Point, r: number, w: number, h: number): Rect {
  const pad = r + 2
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - pad))
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - pad))
  const maxX = Math.min(w, Math.ceil(Math.max(from.x, to.x) + pad))
  const maxY = Math.min(h, Math.ceil(Math.max(from.y, to.y) + pad))
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) }
}

export class CloneRenderer {
  private w = 0
  private h = 0
  private base: HTMLCanvasElement | null = null
  /** 브러시 Dab 누적 커버리지 (알파) */
  private dab: HTMLCanvasElement | null = null
  private dabCtx: CanvasRenderingContext2D | null = null
  /** Source 를 offset 만큼 이동시켜 레이어 로컬에 정렬한 캔버스 (Stroke 내 고정 = Source Cache) */
  private translated: HTMLCanvasElement | null = null
  /** 복제 스트로크 = translated ∩ dab ∩ selection */
  private stroke: HTMLCanvasElement | null = null
  private strokeCtx: CanvasRenderingContext2D | null = null
  private selection: HTMLCanvasElement | null = null
  /** 최종 출력 (base + 복제 스트로크) */
  private working: HTMLCanvasElement | null = null
  private workingCtx: CanvasRenderingContext2D | null = null

  init(opts: CloneRendererInit) {
    const w = Math.max(1, Math.round(opts.width))
    const h = Math.max(1, Math.round(opts.height))
    this.w = w
    this.h = h

    this.base = makeCanvas(w, h)
    const bctx = this.base.getContext('2d')!
    if (opts.base) {
      try {
        bctx.drawImage(opts.base, 0, 0, w, h)
      } catch {
        /* noop */
      }
    }

    this.dab = makeCanvas(w, h)
    this.dabCtx = this.dab.getContext('2d')

    // Source Cache — Snapshot 을 offset 만큼 이동해 로컬 좌표에 정렬 (Stroke 동안 재사용)
    this.translated = makeCanvas(w, h)
    const tctx = this.translated.getContext('2d')!
    enableHQSampling(tctx) // Bilinear/Subpixel — 회전/확대 계단 현상 최소화
    tctx.drawImage(opts.sample, opts.offset.x - opts.origin.x, opts.offset.y - opts.origin.y)

    this.stroke = makeCanvas(w, h)
    this.strokeCtx = this.stroke.getContext('2d')
    this.selection = opts.selection

    this.working = makeCanvas(w, h)
    this.workingCtx = this.working.getContext('2d')
    // 시작 상태 = base 원본
    this.workingCtx!.drawImage(this.base, 0, 0)
  }

  get workingCanvas(): HTMLCanvasElement | null {
    return this.working
  }

  /** 첫 Dab (레이어 로컬 좌표). 갱신된 Dirty Rect 반환. */
  firstDab(p: Point, brush: BrushOptions): Rect {
    if (this.dabCtx) stampDab(this.dabCtx, p.x, p.y, brush)
    return segmentRect(p, p, brush.size / 2, this.w, this.h)
  }

  /** from→to 세그먼트를 Spacing 간격으로 스탬프. Dirty Rect 반환. */
  stampSegment(from: Point, to: Point, brush: BrushOptions, spacingRatio: number): Rect {
    if (this.dabCtx) drawSegment(this.dabCtx, from, to, brush, spacingRatio)
    return segmentRect(from, to, brush.size / 2, this.w, this.h)
  }

  /**
   * Dirty Rect 만 재합성한다.
   *  working[rect] = clear → base[rect] → (translated ∩ dab ∩ selection)[rect] · opacity · blend
   * @param opacity 0~1 (Stroke 전체 Alpha 상한)
   * @param blendOp Brush Mode 합성 연산
   */
  composite(rect: Rect, opacity: number, blendOp: GlobalCompositeOperation) {
    const wc = this.workingCtx
    const sc = this.strokeCtx
    if (!wc || !sc || !this.base || !this.dab || !this.translated || !this.stroke || rect.w <= 0 || rect.h <= 0)
      return

    // 1) 복제 스트로크(rect) = translated ∩ dab 커버리지 ∩ (선택 영역)
    sc.save()
    sc.beginPath()
    sc.rect(rect.x, rect.y, rect.w, rect.h)
    sc.clip()
    sc.globalCompositeOperation = 'source-over'
    sc.globalAlpha = 1
    sc.clearRect(rect.x, rect.y, rect.w, rect.h)
    sc.drawImage(this.translated, 0, 0)
    sc.globalCompositeOperation = 'destination-in'
    sc.drawImage(this.dab, 0, 0)
    if (this.selection) sc.drawImage(this.selection, 0, 0)
    sc.restore()

    // 2) working(rect) = base 위에 복제 스트로크 합성 (Opacity / Blend Mode)
    wc.save()
    wc.beginPath()
    wc.rect(rect.x, rect.y, rect.w, rect.h)
    wc.clip()
    wc.globalCompositeOperation = 'source-over'
    wc.globalAlpha = 1
    wc.clearRect(rect.x, rect.y, rect.w, rect.h)
    wc.drawImage(this.base, 0, 0)
    wc.globalAlpha = Math.max(0, Math.min(1, opacity))
    wc.globalCompositeOperation = blendOp
    wc.drawImage(this.stroke, 0, 0)
    wc.restore()
    wc.globalAlpha = 1
    wc.globalCompositeOperation = 'source-over'
  }

  dispose() {
    this.base = null
    this.dab = null
    this.dabCtx = null
    this.translated = null
    this.stroke = null
    this.strokeCtx = null
    this.selection = null
    this.working = null
    this.workingCtx = null
  }
}
