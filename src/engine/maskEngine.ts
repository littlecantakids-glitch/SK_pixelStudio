// Mask Engine — Photoshop Layer Mask 순수 로직.
// Mask 는 Grayscale 캔버스(255=보임, 0=숨김)이며 Bitmap과 완전히 분리된다.
// Eraser / Adjustment Layer / Clipping Mask / Quick Mask 가 이 엔진을 재사용한다.
import type { Layer, LayerMask } from '../types'

/** 새 레이어 생성 시 기본 마스크 관련 필드 */
export const MASK_DEFAULTS = {
  maskEnabled: true,
  maskLinked: true,
  maskDensity: 100,
  maskFeather: 0,
} as const

/** 새 Layer Mask 생성. 기본값은 전체 흰색(255) = Reveal All */
export function createLayerMask(
  width: number,
  height: number,
  fill: 'reveal' | 'hide' = 'reveal',
): LayerMask {
  const bitmap = document.createElement('canvas')
  bitmap.width = Math.max(1, Math.round(width))
  bitmap.height = Math.max(1, Math.round(height))
  const ctx = bitmap.getContext('2d')!
  ctx.fillStyle = fill === 'reveal' ? '#ffffff' : '#000000'
  ctx.fillRect(0, 0, bitmap.width, bitmap.height)
  return {
    width: bitmap.width,
    height: bitmap.height,
    bitmap,
    enabled: true,
    density: 100,
    feather: 0,
  }
}

/** 마스크를 독립 캔버스로 복제 (Duplicate Layer / History 스냅샷용) */
export function cloneLayerMask(mask: LayerMask): LayerMask {
  const bitmap = document.createElement('canvas')
  bitmap.width = mask.bitmap.width
  bitmap.height = mask.bitmap.height
  bitmap.getContext('2d')!.drawImage(mask.bitmap, 0, 0)
  return { ...mask, bitmap }
}

/** 마스크가 실제 렌더에 적용되는 상태인지 */
export function isMaskActive(layer: Layer): boolean {
  return !!layer.mask && layer.maskEnabled !== false && layer.mask.enabled !== false
}

// ── Grayscale → Alpha 변환 캐시 ────────────────────────────────
// destination-in 합성은 소스의 alpha 를 사용하므로, 회색 값을 alpha 채널로 옮긴
// 캔버스가 필요하다. mask.bitmap 은 페인트 커밋 시마다 새 캔버스로 교체되므로
// WeakMap 캐시는 자동으로 정리된다.
const alphaCache = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>()

/** Mask Gray → Alpha 캔버스 (density/feather 반영). Bitmap Alpha × Mask Gray 합성용 */
export function maskAlphaCanvas(mask: LayerMask, density = 100, feather = 0): HTMLCanvasElement {
  const key = `${density}:${feather}`
  const hit = alphaCache.get(mask.bitmap)
  if (hit && hit.key === key) return hit.canvas

  const w = mask.bitmap.width
  const h = mask.bitmap.height
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const src = mask.bitmap.getContext('2d')!.getImageData(0, 0, w, h)
  const dctx = out.getContext('2d')!
  const img = dctx.createImageData(w, h)
  const k = Math.max(0, Math.min(1, density / 100))
  for (let i = 0; i < src.data.length; i += 4) {
    const gray = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3
    // density: 100 = gray 그대로, 0 = 항상 255 (마스크 효과 없음)
    img.data[i + 3] = Math.round(255 - (255 - gray) * k)
  }
  dctx.putImageData(img, 0, 0)

  let result = out
  if (feather > 0) {
    const blurred = document.createElement('canvas')
    blurred.width = w
    blurred.height = h
    const bctx = blurred.getContext('2d')!
    bctx.filter = `blur(${feather}px)`
    bctx.drawImage(out, 0, 0)
    result = blurred
  }
  alphaCache.set(mask.bitmap, { key, canvas: result })
  return result
}

// ── Rubylith Overlay (\ 키 — Quick Mask 스타일 빨간 미리보기) ──
const overlayCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>()

/** 마스크가 숨기는(검정) 영역을 반투명 빨강으로 표시하는 오버레이 캔버스 */
export function maskOverlayCanvas(mask: LayerMask): HTMLCanvasElement {
  const hit = overlayCache.get(mask.bitmap)
  if (hit) return hit
  const w = mask.bitmap.width
  const h = mask.bitmap.height
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const src = mask.bitmap.getContext('2d')!.getImageData(0, 0, w, h)
  const dctx = out.getContext('2d')!
  const img = dctx.createImageData(w, h)
  for (let i = 0; i < src.data.length; i += 4) {
    const gray = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3
    img.data[i] = 255
    img.data[i + 1] = 20
    img.data[i + 2] = 20
    // 숨김(0)일수록 진한 빨강, 보임(255)은 투명 — Photoshop 기본 50% 근사
    img.data[i + 3] = Math.round((255 - gray) * 0.55)
  }
  dctx.putImageData(img, 0, 0)
  overlayCache.set(mask.bitmap, out)
  return out
}

/** 마스크 페인트용 색 변환 — 임의 색을 휘도 기반 회색으로 클램프 */
export function toMaskGray(hex: string): string {
  const h = hex.replace('#', '')
  const v =
    h.length === 3
      ? h.split('').map((c) => c + c).join('')
      : h.padEnd(6, '0').slice(0, 6)
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  const yy = y.toString(16).padStart(2, '0')
  return `#${yy}${yy}${yy}`
}
