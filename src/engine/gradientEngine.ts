// Gradient Engine — Photoshop Gradient System 의 단일 계산 엔진.
// Gradient Tool / Gradient Fill Layer / Layer Style / Gradient Map / Mask /
// Shape Fill / Text Fill 이 모두 이 엔진을 재사용한다.
// Preview 와 Commit 은 호출 측에서 분리하며, 이 엔진은 순수 계산만 담당한다.
import type { Gradient, GradientGeom, GradientType } from '../types'

let seq = 0
export function stopId(): string {
  seq += 1
  return `gs-${Date.now()}-${seq}`
}

export const GRADIENT_TYPE_LABELS: Record<GradientType, string> = {
  linear: '선형',
  radial: '방사형',
  angle: '각도',
  reflected: '반사',
  diamond: '다이아몬드',
}

// ── 색상 유틸 ────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6)
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

/** sentinel('foreground'/'background') 색상을 실제 색으로 해석 */
export function resolveColor(color: string, fg: string, bg: string): string {
  if (color === 'foreground') return fg
  if (color === 'background') return bg
  return color
}

// ── Stop 해석 ────────────────────────────────────────────────
type FlatStop = { pos: number; r: number; g: number; b: number; a: number }

/**
 * Gradient Stop 목록 → 정렬/정규화된 평탄 Stop 목록.
 * - sentinel 색상 해석 (Foreground/Background)
 * - reverse: 방향 반전
 * - transparency OFF: Opacity Stop 무시 (모두 불투명)
 * - midpoint ≠ 0.5: 중간점 위치에 보간 Stop 삽입
 */
export function flattenStops(
  gradient: Gradient,
  opts: { fg: string; bg: string; reverse?: boolean; transparency?: boolean },
): FlatStop[] {
  const src = [...gradient.stops].sort((a, b) => a.position - b.position)
  let stops: FlatStop[] = src.map((s) => {
    const [r, g, b] = hexToRgb(resolveColor(s.color, opts.fg, opts.bg))
    return {
      pos: Math.min(1, Math.max(0, s.position)),
      r,
      g,
      b,
      a: opts.transparency === false ? 1 : Math.min(1, Math.max(0, s.opacity / 100)),
    }
  })
  if (stops.length === 0) stops = [{ pos: 0, r: 0, g: 0, b: 0, a: 1 }]
  if (stops.length === 1) stops.push({ ...stops[0], pos: 1 })

  // Midpoint — 인접 Stop 사이 중간점을 50/50 색으로 삽입
  const withMid: FlatStop[] = []
  for (let i = 0; i < stops.length; i++) {
    withMid.push(stops[i])
    const m = src[i]?.midpoint
    if (i < stops.length - 1 && m != null && Math.abs(m - 0.5) > 0.01) {
      const a = stops[i]
      const b = stops[i + 1]
      const pos = a.pos + (b.pos - a.pos) * Math.min(0.95, Math.max(0.05, m))
      withMid.push({
        pos,
        r: (a.r + b.r) / 2,
        g: (a.g + b.g) / 2,
        b: (a.b + b.b) / 2,
        a: (a.a + b.a) / 2,
      })
    }
  }
  let out = withMid
  if (opts.reverse) {
    out = out.map((s) => ({ ...s, pos: 1 - s.pos })).reverse()
  }
  return out
}

/** t(0~1) 위치의 색 보간 */
function sampleStops(stops: FlatStop[], t: number): [number, number, number, number] {
  if (t <= stops[0].pos) {
    const s = stops[0]
    return [s.r, s.g, s.b, s.a]
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t <= b.pos) {
      const span = b.pos - a.pos
      const k = span <= 0 ? 0 : (t - a.pos) / span
      return [
        a.r + (b.r - a.r) * k,
        a.g + (b.g - a.g) * k,
        a.b + (b.b - a.b) * k,
        a.a + (b.a - a.a) * k,
      ]
    }
  }
  const s = stops[stops.length - 1]
  return [s.r, s.g, s.b, s.a]
}

/** 1024 엔트리 RGBA LUT (per-pixel 타입용) */
function buildLut(stops: FlatStop[]): Uint8ClampedArray {
  const N = 1024
  const lut = new Uint8ClampedArray(N * 4)
  for (let i = 0; i < N; i++) {
    const [r, g, b, a] = sampleStops(stops, i / (N - 1))
    lut[i * 4] = r
    lut[i * 4 + 1] = g
    lut[i * 4 + 2] = b
    lut[i * 4 + 3] = a * 255
  }
  return lut
}

export type GradientRenderOptions = {
  fg: string
  bg: string
  reverse?: boolean
  dither?: boolean
  transparency?: boolean
}

/**
 * Gradient 를 캔버스로 렌더한다 — 엔진의 유일한 래스터 진입점.
 * linear/radial/reflected/angle 은 네이티브 Canvas Gradient,
 * diamond 는 per-pixel LUT 로 계산한다. dither ON 이면 밴딩 감소 노이즈를 더한다.
 */
export function renderGradientToCanvas(
  width: number,
  height: number,
  gradient: Gradient,
  geom: GradientGeom,
  opts: GradientRenderOptions,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')!
  const stops = flattenStops(gradient, opts)
  const { x0, y0, x1, y1 } = geom
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.max(0.5, Math.hypot(dx, dy))

  if (gradient.type === 'diamond') {
    // Diamond — max(|u|,|v|) 거리 계량 (드래그 축 기준 회전 좌표계)
    const lut = buildLut(stops)
    const img = ctx.createImageData(canvas.width, canvas.height)
    const ux = dx / len
    const uy = dy / len
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const px = x + 0.5 - x0
        const py = y + 0.5 - y0
        const u = (px * ux + py * uy) / len
        const v = (-px * uy + py * ux) / len
        const t = Math.min(1, Math.abs(u) + Math.abs(v))
        const li = Math.round(t * 1023) * 4
        const i = (y * canvas.width + x) * 4
        img.data[i] = lut[li]
        img.data[i + 1] = lut[li + 1]
        img.data[i + 2] = lut[li + 2]
        img.data[i + 3] = lut[li + 3]
      }
    }
    ctx.putImageData(img, 0, 0)
  } else {
    let g: CanvasGradient
    if (gradient.type === 'radial') {
      g = ctx.createRadialGradient(x0, y0, 0, x0, y0, len)
      for (const s of stops) g.addColorStop(s.pos, `rgba(${s.r | 0},${s.g | 0},${s.b | 0},${s.a})`)
    } else if (gradient.type === 'angle') {
      const start = Math.atan2(dy, dx)
      g = ctx.createConicGradient(start, x0, y0)
      for (const s of stops) g.addColorStop(s.pos, `rgba(${s.r | 0},${s.g | 0},${s.b | 0},${s.a})`)
    } else if (gradient.type === 'reflected') {
      // Reflected — 시작점 기준 양방향 미러
      g = ctx.createLinearGradient(x0 - dx, y0 - dy, x1, y1)
      for (const s of stops) {
        const c = `rgba(${s.r | 0},${s.g | 0},${s.b | 0},${s.a})`
        g.addColorStop(0.5 - s.pos / 2, c)
        g.addColorStop(0.5 + s.pos / 2, c)
      }
    } else {
      g = ctx.createLinearGradient(x0, y0, x1, y1)
      for (const s of stops) g.addColorStop(s.pos, `rgba(${s.r | 0},${s.g | 0},${s.b | 0},${s.a})`)
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  if (opts.dither) {
    // Dither — ±2 노이즈로 Banding 감소
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const n = (Math.random() - 0.5) * 4
      d[i] = Math.min(255, Math.max(0, d[i] + n))
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n))
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n))
    }
    ctx.putImageData(img, 0, 0)
  }
  return canvas
}

/** UI 스트립 썸네일용 — 좌→우 linear 로 강제 렌더 (체커보드 배경은 CSS) */
export function renderGradientStrip(
  width: number,
  height: number,
  gradient: Gradient,
  opts: GradientRenderOptions,
): HTMLCanvasElement {
  return renderGradientToCanvas(
    width,
    height,
    { ...gradient, type: 'linear' },
    { x0: 0, y0: 0, x1: width, y1: 0 },
    opts,
  )
}

// ── Presets ─────────────────────────────────────────────────
const mk = (
  id: string,
  name: string,
  stops: Array<[number, string, number]>,
): Gradient => ({
  id,
  name,
  type: 'linear',
  stops: stops.map(([position, color, opacity]) => ({ id: stopId(), position, color, opacity })),
})

/** 기본 제공 Preset — Photoshop 기본 세트 */
export const DEFAULT_GRADIENT_PRESETS: Gradient[] = [
  mk('preset-fg-bg', '전경색에서 배경색으로', [
    [0, 'foreground', 100],
    [1, 'background', 100],
  ]),
  mk('preset-black-white', '검정, 흰색', [
    [0, '#000000', 100],
    [1, '#ffffff', 100],
  ]),
  mk('preset-fg-transparent', '전경색에서 투명으로', [
    [0, 'foreground', 100],
    [1, 'foreground', 0],
  ]),
  mk('preset-spectrum', '스펙트럼', [
    [0, '#ff0000', 100],
    [0.17, '#ff00ff', 100],
    [0.34, '#0000ff', 100],
    [0.5, '#00ffff', 100],
    [0.67, '#00ff00', 100],
    [0.84, '#ffff00', 100],
    [1, '#ff0000', 100],
  ]),
  mk('preset-rainbow', '무지개', [
    [0, '#ff2400', 100],
    [0.2, '#ffa500', 100],
    [0.4, '#ffee00', 100],
    [0.6, '#00b300', 100],
    [0.8, '#0055ff', 100],
    [1, '#7a00cc', 100],
  ]),
]

/** t(0~1) 위치의 색을 샘플 (Editor 에서 Stop 추가 시 초기 색) */
export function sampleGradientColor(
  gradient: Gradient,
  t: number,
  fg: string,
  bg: string,
): { color: string; opacity: number } {
  const stops = flattenStops(gradient, { fg, bg, transparency: true })
  const [r, g, b, a] = ((): [number, number, number, number] => {
    if (t <= stops[0].pos) {
      const s = stops[0]
      return [s.r, s.g, s.b, s.a]
    }
    for (let i = 0; i < stops.length - 1; i++) {
      const p = stops[i]
      const q = stops[i + 1]
      if (t <= q.pos) {
        const span = q.pos - p.pos
        const k = span <= 0 ? 0 : (t - p.pos) / span
        return [p.r + (q.r - p.r) * k, p.g + (q.g - p.g) * k, p.b + (q.b - p.b) * k, p.a + (q.a - p.a) * k]
      }
    }
    const s = stops[stops.length - 1]
    return [s.r, s.g, s.b, s.a]
  })()
  const hex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return { color: `#${hex(r)}${hex(g)}${hex(b)}`, opacity: Math.round(a * 100) }
}

export function cloneGradient(g: Gradient): Gradient {
  return { ...g, stops: g.stops.map((s) => ({ ...s })) }
}

/** Gradient 정의 → 캐시 서명 (Shape/Text 벡터 캐시 무효화용) */
export function gradientSignature(g: Gradient | undefined | null, geom?: GradientGeom): string {
  if (!g) return 'nograd'
  const stops = g.stops
    .map((s) => `${s.position.toFixed(3)}${s.color}${s.opacity}${s.midpoint ?? ''}`)
    .join(';')
  const gm = geom ? `${geom.x0},${geom.y0},${geom.x1},${geom.y1}` : ''
  return `${g.type}:${stops}:${gm}`
}
