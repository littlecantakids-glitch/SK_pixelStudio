// Filter Engine — Photoshop Filter Pipeline.
// Filter 는 FilterEngine 에서 계산하고 RenderEngine 은 결과를 그리기만 한다.
// ImageData 기반 계산은 순수 함수로 분리되어 있어 추후 Web Worker 로 이동 가능하다.
// Smart Object 에서는 동일한 API 로 비파괴 Smart Filter 를 구성할 수 있도록
// applyFilter(원본, 파라미터) → 결과 형태를 유지한다 (원본은 절대 수정하지 않음).
import type { Rect } from '../types'

export type FilterType =
  | 'gaussianBlur'
  | 'sharpen'
  | 'addNoise'
  | 'motionBlur'
  | 'highPass'
  | 'unsharpMask'

export type FilterParams = {
  radius?: number
  amount?: number
  distribution?: 'uniform' | 'gaussian'
  monochromatic?: boolean
  [key: string]: number | boolean | string | undefined
}

export type FilterContext = {
  documentId: string
  layerId: string
  target: 'bitmap' | 'mask'
  /** Selection 마스크 (doc 좌표, 255=선택). 있으면 선택 내부에만 적용 */
  selectionMask?: Uint8Array | null
  docWidth?: number
  docHeight?: number
  /** Selection(doc 좌표) → 레이어 로컬 변환 오프셋 */
  layerX?: number
  layerY?: number
  width: number
  height: number
}

export type FilterResult = {
  bitmap: HTMLCanvasElement
  dirtyBounds: Rect
}

export const FILTER_LABELS: Record<FilterType, string> = {
  gaussianBlur: '가우시안 흐림 효과',
  sharpen: '선명하게',
  addNoise: '노이즈 추가',
  motionBlur: '동작 흐림 효과',
  highPass: '하이 패스',
  unsharpMask: '언샵 마스크',
}

export const IMPLEMENTED_FILTERS: FilterType[] = ['gaussianBlur', 'sharpen', 'addNoise']

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height)
  c.getContext('2d')!.drawImage(src, 0, 0)
  return c
}

// ── 순수 필터 계산 (Worker 이동 대상) ─────────────────────────

/** Sharpen — 3x3 Convolution Kernel [0,-1,0,-1,5,-1,0,-1,0]. RGB만 처리, Alpha 보존 */
export function sharpenImageData(img: ImageData): ImageData {
  const { width: w, height: h, data: src } = img
  const out = new ImageData(w, h)
  const dst = out.data
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1)
    const y1 = Math.min(h - 1, y + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1)
      const x1 = Math.min(w - 1, x + 1)
      const i = (y * w + x) * 4
      const iu = (y0 * w + x) * 4
      const id = (y1 * w + x) * 4
      const il = (y * w + x0) * 4
      const ir = (y * w + x1) * 4
      for (let ch = 0; ch < 3; ch++) {
        dst[i + ch] = clamp(
          5 * src[i + ch] - src[iu + ch] - src[id + ch] - src[il + ch] - src[ir + ch],
        )
      }
      dst[i + 3] = src[i + 3]
    }
  }
  return out
}

/** Add Noise — Amount 0~100, Uniform/Gaussian 분포, Monochromatic 지원 */
export function addNoiseImageData(
  img: ImageData,
  amount: number,
  distribution: 'uniform' | 'gaussian',
  monochromatic: boolean,
): void {
  const data = img.data
  const scale = (Math.max(0, Math.min(100, amount)) / 100) * 255
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
  const rand =
    distribution === 'gaussian'
      ? () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 // 근사 정규분포
      : () => Math.random() * 2 - 1
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    if (monochromatic) {
      const d = rand() * scale
      data[i] = clamp(data[i] + d)
      data[i + 1] = clamp(data[i + 1] + d)
      data[i + 2] = clamp(data[i + 2] + d)
    } else {
      data[i] = clamp(data[i] + rand() * scale)
      data[i + 1] = clamp(data[i + 1] + rand() * scale)
      data[i + 2] = clamp(data[i + 2] + rand() * scale)
    }
  }
}

// ── Canvas 레벨 필터 실행 ────────────────────────────────────

function runGaussianBlur(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const out = makeCanvas(source.width, source.height)
  const ctx = out.getContext('2d')!
  ctx.filter = `blur(${Math.max(0.1, Math.min(250, radius))}px)`
  ctx.drawImage(source, 0, 0)
  ctx.filter = 'none'
  return out
}

function runSharpen(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = cloneCanvas(source)
  const ctx = out.getContext('2d')!
  const img = ctx.getImageData(0, 0, out.width, out.height)
  ctx.putImageData(sharpenImageData(img), 0, 0)
  return out
}

function runAddNoise(source: HTMLCanvasElement, params: FilterParams): HTMLCanvasElement {
  const out = cloneCanvas(source)
  const ctx = out.getContext('2d')!
  const img = ctx.getImageData(0, 0, out.width, out.height)
  addNoiseImageData(
    img,
    typeof params.amount === 'number' ? params.amount : 12.5,
    params.distribution === 'gaussian' ? 'gaussian' : 'uniform',
    !!params.monochromatic,
  )
  ctx.putImageData(img, 0, 0)
  return out
}

/** Selection 마스크(doc 좌표) → 레이어 로컬 알파 캔버스 */
function buildSelectionCanvas(context: FilterContext): HTMLCanvasElement | null {
  const sel = context.selectionMask
  const dw = context.docWidth ?? 0
  const dh = context.docHeight ?? 0
  if (!sel || !dw || !dh) return null
  const w = context.width
  const h = context.height
  const ox = Math.round(context.layerX ?? 0)
  const oy = Math.round(context.layerY ?? 0)
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= dh) continue
    for (let x = 0; x < w; x++) {
      const dx = x + ox
      if (dx < 0 || dx >= dw) continue
      img.data[(y * w + x) * 4 + 3] = sel[dy * dw + dx]
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * Filter Pipeline 진입점.
 * - Raster/Image Layer: 픽셀 직접 변경 (OK 시 Layer Bitmap 교체)
 * - Mask Target: Mask Bitmap 에만 적용 (Bitmap 수정 금지)
 * - Selection: 선택 내부에만 적용, 밖은 원본 유지
 * - Smart Object(향후): 동일 API 로 비파괴 Smart Filter 스택 구성
 */
export class FilterEngine {
  applyFilter(
    source: HTMLCanvasElement,
    filter: FilterType,
    params: FilterParams,
    context: FilterContext,
  ): FilterResult {
    const filtered = this.run(source, filter, params)
    const sel = buildSelectionCanvas(context)
    let out: HTMLCanvasElement

    if (sel) {
      // Selection 내부만 교체: 원본에서 선택 영역을 지우고, 선택 영역의 필터 결과를 얹는다
      const filteredSel = cloneCanvas(filtered)
      const fctx = filteredSel.getContext('2d')!
      fctx.globalCompositeOperation = 'destination-in'
      fctx.drawImage(sel, 0, 0)
      out = cloneCanvas(source)
      const octx = out.getContext('2d')!
      octx.globalCompositeOperation = 'destination-out'
      octx.drawImage(sel, 0, 0)
      octx.globalCompositeOperation = 'source-over'
      octx.drawImage(filteredSel, 0, 0)
    } else if (context.target === 'mask') {
      // Mask 는 항상 불투명 grayscale — 가장자리 알파 손실 방지를 위해 원본 위에 합성
      out = cloneCanvas(source)
      out.getContext('2d')!.drawImage(filtered, 0, 0)
    } else {
      out = filtered
    }

    return {
      bitmap: out,
      dirtyBounds: { x: 0, y: 0, width: source.width, height: source.height },
    }
  }

  /** Dialog Preview 용 — Layer 는 절대 수정하지 않는다 (동일 파이프라인, 결과만 반환) */
  previewFilter(
    source: HTMLCanvasElement,
    filter: FilterType,
    params: FilterParams,
    context: FilterContext,
  ): HTMLCanvasElement {
    return this.applyFilter(source, filter, params, context).bitmap
  }

  private run(
    source: HTMLCanvasElement,
    filter: FilterType,
    params: FilterParams,
  ): HTMLCanvasElement {
    switch (filter) {
      case 'gaussianBlur':
        return runGaussianBlur(source, typeof params.radius === 'number' ? params.radius : 5)
      case 'sharpen':
        return runSharpen(source)
      case 'addNoise':
        return runAddNoise(source, params)
      default:
        // motionBlur / highPass / unsharpMask — 구조만 준비
        return cloneCanvas(source)
    }
  }
}

export const filterEngine = new FilterEngine()
