// Smart Filter Engine — Smart Object 전용 비파괴 필터 스택 (Plugin Registry 구조).
// 새 필터는 Engine 수정 없이 PLUGINS 에 항목만 추가하면 동작한다 (동일한 SmartFilter 인터페이스).
// 원본 Bitmap 은 절대 수정하지 않고, 각 Filter 는 (입력 canvas, parameters) → 출력 canvas 순수 함수다.
import type { SmartFilter, SmartFilterType } from '../types'
import { applyAdjustment } from './adjustmentEngine'
import { addNoiseImageData } from './filterEngine'
import { genId } from './layerEngine'
import { BLEND_OP } from './blendModes'

export type FilterParamKind = 'slider' | 'toggle'
export type FilterParamSpec = {
  key: string
  label: string
  min: number
  max: number
  step: number
  unit?: string
  kind?: FilterParamKind
}
export type FilterCategory = 'adjust' | 'blur' | 'sharpen' | 'noise' | 'distort' | 'other'

type FilterPlugin = {
  type: SmartFilterType
  label: string
  category: FilterCategory
  implemented: boolean
  params: FilterParamSpec[]
  defaults: Record<string, number>
  apply?: (src: HTMLCanvasElement, p: Record<string, number>) => HTMLCanvasElement
}

// ── Canvas helpers ─────────────────────────────────────────────────
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
function blurCanvas(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const out = makeCanvas(src.width, src.height)
  const ctx = out.getContext('2d')!
  ctx.filter = `blur(${Math.max(0, Math.min(300, radius))}px)`
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  return out
}
function data(src: HTMLCanvasElement): ImageData {
  return src.getContext('2d')!.getImageData(0, 0, src.width, src.height)
}
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** 픽셀 재배치(Distort) — fn(x,y) → 샘플 좌표 [sx,sy]. wrap 시 경계 순환 */
function remap(
  src: HTMLCanvasElement,
  fn: (x: number, y: number, cx: number, cy: number) => [number, number],
  wrap = false,
): HTMLCanvasElement {
  const w = src.width
  const h = src.height
  const s = data(src).data
  const out = makeCanvas(w, h)
  const octx = out.getContext('2d')!
  const o = octx.createImageData(w, h)
  const d = o.data
  const cx = w / 2
  const cy = h / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sxf, syf] = fn(x, y, cx, cy)
      let xi = Math.round(sxf)
      let yi = Math.round(syf)
      if (wrap) {
        xi = ((xi % w) + w) % w
        yi = ((yi % h) + h) % h
      }
      const di = (y * w + x) * 4
      if (xi >= 0 && xi < w && yi >= 0 && yi < h) {
        const si = (yi * w + xi) * 4
        d[di] = s[si]
        d[di + 1] = s[si + 1]
        d[di + 2] = s[si + 2]
        d[di + 3] = s[si + 3]
      }
    }
  }
  octx.putImageData(o, 0, 0)
  return out
}

// ── Filter 구현 ────────────────────────────────────────────────────
function fAdjust(type: 'brightnessContrast' | 'hueSaturation') {
  return (src: HTMLCanvasElement, p: Record<string, number>) => {
    const out = cloneCanvas(src)
    const ctx = out.getContext('2d')!
    const img = ctx.getImageData(0, 0, out.width, out.height)
    applyAdjustment(img, type, p)
    ctx.putImageData(img, 0, 0)
    return out
  }
}

function fMotionBlur(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const dist = Math.max(0, p.distance ?? 20)
  const ang = ((p.angle ?? 0) * Math.PI) / 180
  const out = makeCanvas(src.width, src.height)
  const ctx = out.getContext('2d')!
  const n = Math.max(1, Math.min(64, Math.round(dist)))
  ctx.globalAlpha = 1 / n
  for (let i = 0; i < n; i++) {
    const t = (i / Math.max(1, n - 1) - 0.5) * dist
    ctx.drawImage(src, Math.cos(ang) * t, Math.sin(ang) * t)
  }
  ctx.globalAlpha = 1
  return out
}

function fRadialBlur(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const amount = Math.max(0, p.amount ?? 10)
  const out = makeCanvas(src.width, src.height)
  const ctx = out.getContext('2d')!
  const cx = src.width / 2
  const cy = src.height / 2
  const n = Math.max(2, Math.min(48, Math.round(amount)))
  const total = (amount * Math.PI) / 180
  ctx.globalAlpha = 1 / n
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * total
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(a)
    ctx.translate(-cx, -cy)
    ctx.drawImage(src, 0, 0)
    ctx.restore()
  }
  ctx.globalAlpha = 1
  return out
}

function fAverage(src: HTMLCanvasElement): HTMLCanvasElement {
  const one = makeCanvas(1, 1)
  const octx = one.getContext('2d')!
  octx.drawImage(src, 0, 0, 1, 1)
  const [r, g, b, a] = octx.getImageData(0, 0, 1, 1).data
  const out = makeCanvas(src.width, src.height)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`
  ctx.fillRect(0, 0, out.width, out.height)
  return out
}

/** Unsharp / Smart Sharpen 공용 — out = src + (src - blur) * amount (threshold 이상 차이에만) */
function unsharp(src: HTMLCanvasElement, radius: number, amountPct: number, threshold = 0): HTMLCanvasElement {
  const blurred = blurCanvas(src, radius)
  const s = data(src)
  const b = data(blurred).data
  const amt = amountPct / 100
  const d = s.data
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      const diff = d[i + ch] - b[i + ch]
      if (Math.abs(diff) >= threshold) d[i + ch] = clamp255(d[i + ch] + diff * amt)
    }
  }
  const out = makeCanvas(src.width, src.height)
  out.getContext('2d')!.putImageData(s, 0, 0)
  return out
}

function fHighPass(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const blurred = blurCanvas(src, p.radius ?? 10)
  const s = data(src)
  const b = data(blurred).data
  const d = s.data
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp255(128 + (d[i + ch] - b[i + ch]))
  }
  const out = makeCanvas(src.width, src.height)
  out.getContext('2d')!.putImageData(s, 0, 0)
  return out
}

function fAddNoise(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const out = cloneCanvas(src)
  const ctx = out.getContext('2d')!
  const img = ctx.getImageData(0, 0, out.width, out.height)
  addNoiseImageData(img, p.amount ?? 12, p.distribution ? 'gaussian' : 'uniform', !!p.monochromatic)
  ctx.putImageData(img, 0, 0)
  return out
}

function medianFilter(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const r = Math.max(1, Math.min(3, Math.round(radius)))
  const w = src.width
  const h = src.height
  const s = data(src).data
  const out = makeCanvas(w, h)
  const octx = out.getContext('2d')!
  const o = octx.createImageData(w, h)
  const d = o.data
  const win: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        win.length = 0
        for (let dy = -r; dy <= r; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy))
          for (let dx = -r; dx <= r; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx))
            win.push(s[(yy * w + xx) * 4 + ch])
          }
        }
        win.sort((a, b) => a - b)
        d[di + ch] = win[win.length >> 1]
      }
      d[di + 3] = s[di + 3]
    }
  }
  octx.putImageData(o, 0, 0)
  return out
}

// Distort
function fRipple(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const amt = (p.amount ?? 100) / 20
  const size = Math.max(1, p.size ?? 10)
  return remap(src, (x, y) => [x + Math.sin(y / size) * amt, y + Math.sin(x / size) * amt])
}
function fTwirl(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const angle = ((p.angle ?? 50) * Math.PI) / 180
  return remap(src, (x, y, cx, cy) => {
    const dx = x - cx
    const dy = y - cy
    const r = Math.hypot(dx, dy)
    const maxR = Math.hypot(cx, cy)
    if (r >= maxR) return [x, y]
    const rot = -angle * (1 - r / maxR)
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
  })
}
function fWave(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const amp = p.amplitude ?? 20
  const wl = Math.max(1, p.wavelength ?? 100)
  return remap(src, (x, y) => [x + Math.sin((y / wl) * Math.PI * 2) * amp, y + Math.sin((x / wl) * Math.PI * 2) * amp])
}
function fZigzag(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const amount = p.amount ?? 10
  const ridges = Math.max(1, p.ridges ?? 5)
  return remap(src, (x, y, cx, cy) => {
    const dx = x - cx
    const dy = y - cy
    const r = Math.hypot(dx, dy)
    const maxR = Math.hypot(cx, cy) || 1
    const ang = Math.atan2(dy, dx)
    const disp = Math.sin((r / maxR) * ridges * Math.PI * 2) * amount
    return [cx + Math.cos(ang) * (r + disp), cy + Math.sin(ang) * (r + disp)]
  })
}
function fOffset(src: HTMLCanvasElement, p: Record<string, number>): HTMLCanvasElement {
  const ox = Math.round(p.x ?? 0)
  const oy = Math.round(p.y ?? 0)
  return remap(src, (x, y) => [x - ox, y - oy], true)
}

// ── Plugin Registry ────────────────────────────────────────────────
const PLUGINS: FilterPlugin[] = [
  // 조정
  { type: 'brightnessContrast', label: '명도/대비', category: 'adjust', implemented: true, defaults: { brightness: 0, contrast: 0 },
    params: [{ key: 'brightness', label: '명도', min: -150, max: 150, step: 1 }, { key: 'contrast', label: '대비', min: -50, max: 100, step: 1 }],
    apply: fAdjust('brightnessContrast') },
  { type: 'hueSaturation', label: '색조/채도', category: 'adjust', implemented: true, defaults: { hue: 0, saturation: 0, lightness: 0 },
    params: [{ key: 'hue', label: '색조', min: -180, max: 180, step: 1 }, { key: 'saturation', label: '채도', min: -100, max: 100, step: 1 }, { key: 'lightness', label: '밝기', min: -100, max: 100, step: 1 }],
    apply: fAdjust('hueSaturation') },
  // Blur
  { type: 'gaussianBlur', label: '가우시안 흐림 효과', category: 'blur', implemented: true, defaults: { radius: 5 },
    params: [{ key: 'radius', label: '반경', min: 0, max: 250, step: 0.1, unit: 'px' }],
    apply: (s, p) => blurCanvas(s, p.radius ?? 5) },
  { type: 'motionBlur', label: '동작 흐림 효과', category: 'blur', implemented: true, defaults: { distance: 20, angle: 0 },
    params: [{ key: 'distance', label: '거리', min: 1, max: 200, step: 1, unit: 'px' }, { key: 'angle', label: '각도', min: -180, max: 180, step: 1, unit: '°' }],
    apply: fMotionBlur },
  { type: 'surfaceBlur', label: '표면 흐림 효과', category: 'blur', implemented: true, defaults: { radius: 5, threshold: 15 },
    params: [{ key: 'radius', label: '반경', min: 1, max: 100, step: 1, unit: 'px' }, { key: 'threshold', label: '한계값', min: 0, max: 255, step: 1 }],
    apply: (s, p) => blurCanvas(s, p.radius ?? 5) },
  { type: 'boxBlur', label: '상자 흐림 효과', category: 'blur', implemented: true, defaults: { radius: 8 },
    params: [{ key: 'radius', label: '반경', min: 0, max: 250, step: 1, unit: 'px' }],
    apply: (s, p) => blurCanvas(s, p.radius ?? 8) },
  { type: 'radialBlur', label: '방사형 흐림 효과', category: 'blur', implemented: true, defaults: { amount: 10 },
    params: [{ key: 'amount', label: '양', min: 1, max: 100, step: 1 }],
    apply: fRadialBlur },
  { type: 'average', label: '평균', category: 'blur', implemented: true, defaults: {}, params: [], apply: fAverage },
  // Sharpen
  { type: 'smartSharpen', label: '고급 선명 효과', category: 'sharpen', implemented: true, defaults: { amount: 100, radius: 2, reduceNoise: 0 },
    params: [{ key: 'amount', label: '양', min: 0, max: 500, step: 1, unit: '%' }, { key: 'radius', label: '반경', min: 0.1, max: 64, step: 0.1, unit: 'px' }, { key: 'reduceNoise', label: '노이즈 감소', min: 0, max: 100, step: 1, unit: '%' }],
    apply: (s, p) => unsharp(s, p.radius ?? 2, p.amount ?? 100, 0) },
  { type: 'unsharpMask', label: '언샵 마스크', category: 'sharpen', implemented: true, defaults: { amount: 100, radius: 2, threshold: 0 },
    params: [{ key: 'amount', label: '양', min: 0, max: 500, step: 1, unit: '%' }, { key: 'radius', label: '반경', min: 0.1, max: 64, step: 0.1, unit: 'px' }, { key: 'threshold', label: '한계값', min: 0, max: 255, step: 1 }],
    apply: (s, p) => unsharp(s, p.radius ?? 2, p.amount ?? 100, p.threshold ?? 0) },
  { type: 'highPass', label: '하이 패스', category: 'sharpen', implemented: true, defaults: { radius: 10 },
    params: [{ key: 'radius', label: '반경', min: 0.1, max: 250, step: 0.1, unit: 'px' }],
    apply: fHighPass },
  // Noise
  { type: 'addNoise', label: '노이즈 추가', category: 'noise', implemented: true, defaults: { amount: 12, monochromatic: 0, distribution: 0 },
    params: [{ key: 'amount', label: '양', min: 0, max: 100, step: 1, unit: '%' }, { key: 'distribution', label: '가우시안 분포', min: 0, max: 1, step: 1, kind: 'toggle' }, { key: 'monochromatic', label: '단색', min: 0, max: 1, step: 1, kind: 'toggle' }],
    apply: fAddNoise },
  { type: 'reduceNoise', label: '노이즈 감소', category: 'noise', implemented: true, defaults: { strength: 50 },
    params: [{ key: 'strength', label: '강도', min: 0, max: 100, step: 1 }],
    apply: (s, p) => blurCanvas(s, (p.strength ?? 50) / 40) },
  { type: 'median', label: '중간값', category: 'noise', implemented: true, defaults: { radius: 1 },
    params: [{ key: 'radius', label: '반경', min: 1, max: 3, step: 1, unit: 'px' }],
    apply: (s, p) => medianFilter(s, p.radius ?? 1) },
  { type: 'dustScratches', label: '먼지와 스크래치', category: 'noise', implemented: true, defaults: { radius: 1, threshold: 0 },
    params: [{ key: 'radius', label: '반경', min: 1, max: 3, step: 1, unit: 'px' }, { key: 'threshold', label: '한계값', min: 0, max: 255, step: 1 }],
    apply: (s, p) => medianFilter(s, p.radius ?? 1) },
  // Distort
  { type: 'ripple', label: '잔물결', category: 'distort', implemented: true, defaults: { amount: 100, size: 10 },
    params: [{ key: 'amount', label: '양', min: -999, max: 999, step: 1, unit: '%' }, { key: 'size', label: '크기', min: 1, max: 100, step: 1 }],
    apply: fRipple },
  { type: 'twirl', label: '돌리기', category: 'distort', implemented: true, defaults: { angle: 50 },
    params: [{ key: 'angle', label: '각도', min: -360, max: 360, step: 1, unit: '°' }],
    apply: fTwirl },
  { type: 'wave', label: '파형', category: 'distort', implemented: true, defaults: { amplitude: 20, wavelength: 100 },
    params: [{ key: 'amplitude', label: '진폭', min: 0, max: 200, step: 1 }, { key: 'wavelength', label: '파장', min: 1, max: 400, step: 1 }],
    apply: fWave },
  { type: 'zigzag', label: '지그재그', category: 'distort', implemented: true, defaults: { amount: 10, ridges: 5 },
    params: [{ key: 'amount', label: '양', min: -100, max: 100, step: 1 }, { key: 'ridges', label: '능선', min: 1, max: 20, step: 1 }],
    apply: fZigzag },
  { type: 'offset', label: '오프셋', category: 'distort', implemented: true, defaults: { x: 0, y: 0 },
    params: [{ key: 'x', label: '수평', min: -2000, max: 2000, step: 1, unit: 'px' }, { key: 'y', label: '수직', min: -2000, max: 2000, step: 1, unit: 'px' }],
    apply: fOffset },
  // 구조만 준비
  { type: 'cameraRaw', label: 'Camera Raw 필터', category: 'other', implemented: false, defaults: {}, params: [] },
  { type: 'liquify', label: '픽셀 유동화', category: 'other', implemented: false, defaults: {}, params: [] },
  { type: 'lensBlur', label: '렌즈 흐림 효과', category: 'blur', implemented: false, defaults: {}, params: [] },
  { type: 'oilPaint', label: '유화', category: 'other', implemented: false, defaults: {}, params: [] },
]

const PLUGIN_MAP = new Map<SmartFilterType, FilterPlugin>(PLUGINS.map((p) => [p.type, p]))

/** Dialog / UI 용 메타 (label + implemented + params) */
export const SMART_FILTER_META: Record<SmartFilterType, { label: string; implemented: boolean; params: FilterParamSpec[] }> =
  Object.fromEntries(PLUGINS.map((p) => [p.type, { label: p.label, implemented: p.implemented, params: p.params }])) as Record<
    SmartFilterType,
    { label: string; implemented: boolean; params: FilterParamSpec[] }
  >

export const IMPLEMENTED_SMART_FILTERS: SmartFilterType[] = PLUGINS.filter((p) => p.implemented).map((p) => p.type)

/** 카테고리별 구현 필터 목록 (메뉴/Add 메뉴 구성용) */
export function filtersByCategory(cat: FilterCategory): FilterPlugin[] {
  return PLUGINS.filter((p) => p.category === cat && p.implemented)
}

/** Filter 메뉴 라벨 → 타입 (라벨 끝의 '...' 무시) */
export function smartTypeForLabel(label: string): SmartFilterType | null {
  const norm = label.replace(/\.\.\.$/, '').trim()
  const hit = PLUGINS.find((p) => p.label === norm)
  return hit ? hit.type : null
}

/** 새 Smart Filter 생성 (기본 파라미터) */
export function createSmartFilter(type: SmartFilterType): SmartFilter {
  const plugin = PLUGIN_MAP.get(type)
  return {
    id: genId('filter'),
    type,
    name: plugin?.label ?? type,
    enabled: true,
    parameters: { ...(plugin?.defaults ?? {}) },
    opacity: 100,
    blendMode: 'normal',
  }
}

function runFilter(source: HTMLCanvasElement, f: SmartFilter): HTMLCanvasElement {
  const plugin = PLUGIN_MAP.get(f.type)
  if (plugin?.apply) {
    try {
      return plugin.apply(source, f.parameters)
    } catch {
      /* noop */
    }
  }
  return cloneCanvas(source)
}

/** filtered 를 base 위에 opacity/blend/mask 로 합성 */
function blendFilter(base: HTMLCanvasElement, filtered: HTMLCanvasElement, f: SmartFilter): HTMLCanvasElement {
  const out = cloneCanvas(base)
  const ctx = out.getContext('2d')!
  let src = filtered
  if (f.mask?.bitmap) {
    src = cloneCanvas(filtered)
    const mctx = src.getContext('2d')!
    mctx.globalCompositeOperation = 'destination-in'
    try {
      mctx.drawImage(f.mask.bitmap, 0, 0, src.width, src.height)
    } catch {
      /* noop */
    }
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, f.opacity / 100))
  ctx.globalCompositeOperation = BLEND_OP[f.blendMode] ?? 'source-over'
  ctx.drawImage(src, 0, 0)
  return out
}

export function filterStackSignature(filters: SmartFilter[]): string {
  return filters
    .map(
      (f) =>
        `${f.id}:${f.type}:${f.enabled ? 1 : 0}:${f.opacity}:${f.blendMode}:${Object.entries(f.parameters)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}:${f.mask ? 'm' : '_'}`,
    )
    .join('|')
}

// ── Smart Filter Cache ─────────────────────────────────────────────
const cache = new Map<string, HTMLCanvasElement>()
const CACHE_CAP = 40

export function applyFilterStack(
  source: HTMLCanvasElement,
  filters: SmartFilter[],
  sourceKey: string,
): HTMLCanvasElement {
  const enabled = filters.some((f) => f.enabled)
  if (!filters.length || !enabled) return source
  const sig = `${sourceKey}|${source.width}x${source.height}|${filterStackSignature(filters)}`
  const hit = cache.get(sig)
  if (hit) {
    cache.delete(sig)
    cache.set(sig, hit)
    return hit
  }
  // 스택 맨 위(index 0)가 마지막에 적용되도록 아래(끝)부터 위로 적용 (Photoshop 순서)
  let current = cloneCanvas(source)
  for (let i = filters.length - 1; i >= 0; i--) {
    const f = filters[i]
    if (!f.enabled) continue
    const filtered = runFilter(current, f)
    current = blendFilter(current, filtered, f)
  }
  cache.set(sig, current)
  if (cache.size > CACHE_CAP) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return current
}

export function invalidateFilterCache() {
  cache.clear()
}
export function smartFilterCacheSize(): number {
  return cache.size
}
