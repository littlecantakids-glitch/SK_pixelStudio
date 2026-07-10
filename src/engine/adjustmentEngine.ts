// Adjustment Engine — Photoshop Adjustment Layer 의 실시간 계산 파이프라인.
// Bitmap 은 절대 수정하지 않는다. RenderEngine 이 합성 결과에 대해 매 렌더마다 계산한다.
// Canvas2D(CPU) 기반이지만, applyAdjustment 가 유일한 계산 진입점이므로
// 추후 WebGL/WebGPU Shader 구현으로 그대로 교체할 수 있다.
import type { AdjustmentSettings, AdjustmentType, Layer } from '../types'
import { isMaskActive, maskAlphaCanvas } from './maskEngine'
import { readPixels } from './samplingEngine'

/** Adjustment 별 한국어 이름 (레이어 이름/메뉴/히스토리 라벨) */
export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  brightnessContrast: '명도/대비',
  levels: '레벨',
  curves: '곡선',
  hueSaturation: '색조/채도',
  colorBalance: '색상 균형',
  exposure: '노출',
  vibrance: '활기',
}

/** 현재 실제 구현된 Adjustment (나머지는 구조만 준비) */
export const IMPLEMENTED_ADJUSTMENTS: AdjustmentType[] = [
  'brightnessContrast',
  'levels',
  'hueSaturation',
]

export function defaultSettings(type: AdjustmentType): AdjustmentSettings {
  switch (type) {
    case 'brightnessContrast':
      return { brightness: 0, contrast: 0 }
    case 'hueSaturation':
      return { hue: 0, saturation: 0, lightness: 0 }
    case 'levels':
      return { black: 0, gamma: 1, white: 255 }
    default:
      return {}
  }
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Brightness/Contrast · Levels 용 256 엔트리 LUT — 채널 독립 보정은 모두 LUT 로 처리 */
function buildLut(type: AdjustmentType, s: AdjustmentSettings): Uint8ClampedArray | null {
  const lut = new Uint8ClampedArray(256)
  if (type === 'brightnessContrast') {
    const b = s.brightness ?? 0
    const c = s.contrast ?? 0
    // 표준 대비 계수: c=0 → 1.0, c=100 → 약 2.27, c=-50 → 약 0.67
    const f = (259 * (255 + c)) / (255 * (259 - c))
    for (let i = 0; i < 256; i++) lut[i] = clamp255((i - 128) * f + 128 + b)
    return lut
  }
  if (type === 'levels') {
    const black = s.black ?? 0
    const white = s.white ?? 255
    const gamma = Math.max(0.1, s.gamma ?? 1)
    const range = Math.max(1, white - black)
    for (let i = 0; i < 256; i++) {
      const t = Math.min(1, Math.max(0, (i - black) / range))
      lut[i] = clamp255(Math.pow(t, 1 / gamma) * 255)
    }
    return lut
  }
  return null
}

/** RGB(0~255) → HSL(h 0~360, s/l 0~1) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s, l]
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

/** HSL → RGB(0~255) */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hn = ((h % 360) + 360) % 360 / 360
  return [
    hue2rgb(p, q, hn + 1 / 3) * 255,
    hue2rgb(p, q, hn) * 255,
    hue2rgb(p, q, hn - 1 / 3) * 255,
  ]
}

/**
 * ImageData 에 Adjustment 를 적용한다 (in-place).
 * GPU 파이프라인 교체 시 이 함수만 Shader 로 대체하면 된다.
 */
export function applyAdjustment(
  img: ImageData,
  type: AdjustmentType,
  settings: AdjustmentSettings,
): void {
  const data = img.data
  const lut = buildLut(type, settings)
  if (lut) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      data[i] = lut[data[i]]
      data[i + 1] = lut[data[i + 1]]
      data[i + 2] = lut[data[i + 2]]
    }
    return
  }
  if (type === 'hueSaturation') {
    const dh = settings.hue ?? 0
    const ds = (settings.saturation ?? 0) / 100
    const dl = (settings.lightness ?? 0) / 100
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      // HSL 변환 → Hue/Saturation 변경 → RGB 복귀
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
      const s2 = Math.min(1, Math.max(0, s * (1 + ds)))
      let [r, g, b] = hslToRgb(h + dh, s2, l)
      // Lightness: 양수 = 흰색 방향, 음수 = 검정 방향 (Photoshop 방식)
      if (dl > 0) {
        r += (255 - r) * dl
        g += (255 - g) * dl
        b += (255 - b) * dl
      } else if (dl < 0) {
        r *= 1 + dl
        g *= 1 + dl
        b *= 1 + dl
      }
      data[i] = clamp255(r)
      data[i + 1] = clamp255(g)
      data[i + 2] = clamp255(b)
    }
  }
  // curves / colorBalance / exposure / vibrance — 구조만 준비 (no-op)
}

/**
 * Adjustment Layer 하나를 합성 캔버스(ctx)에 적용한다.
 * 순서: 아래 합성 결과 → Adjustment 계산 → Mask → Blend/Opacity → Composite.
 * RenderEngine 과 Export 파이프라인이 공유한다.
 */
export function applyAdjustmentLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layer: Layer,
  blendOp: GlobalCompositeOperation = 'source-over',
): void {
  if (!layer.adjustment || !layer.adjustmentSettings) return
  if (!IMPLEMENTED_ADJUSTMENTS.includes(layer.adjustment)) return

  // 1) 아래 레이어들의 합성 결과 → Adjustment 계산
  // 매 렌더마다 화면 캔버스를 직접 getImageData 하면 willReadFrequently 경고가 발생하므로
  // 판독 전용 캔버스를 경유해 읽는다
  const img = readPixels(ctx.canvas, 0, 0, width, height)
  if (!img) return
  applyAdjustment(img, layer.adjustment, layer.adjustmentSettings)

  const temp = document.createElement('canvas')
  temp.width = width
  temp.height = height
  const tctx = temp.getContext('2d')!
  tctx.putImageData(img, 0, 0)

  // 2) Mask — Mask Gray 를 Alpha 로 곱해 보정 영역 제한
  if (isMaskActive(layer)) {
    const lw = layer.width || width
    const lh = layer.height || height
    tctx.globalCompositeOperation = 'destination-in'
    tctx.drawImage(
      maskAlphaCanvas(layer.mask!, layer.maskDensity ?? 100, layer.maskFeather ?? 0),
      layer.x,
      layer.y,
      lw,
      lh,
    )
    tctx.globalCompositeOperation = 'source-over'
  }

  // 3) Blend Mode → Opacity → Composite
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, ((layer.opacity ?? 100) / 100) * ((layer.fill ?? 100) / 100)))
  ctx.globalCompositeOperation = blendOp
  ctx.drawImage(temp, 0, 0)
  ctx.restore()
}
