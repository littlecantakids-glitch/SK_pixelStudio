// Sampling Engine — Photoshop Color Sampling 의 단일 계산 엔진.
// Eyedropper / Color Sampler / Magic Wand / Paint Bucket 이 모두 이 엔진을 공유한다.
// 입력은 항상 RenderEngine 결과(ImageData) — Layer 직접 접근 금지.

export type RGBA = { r: number; g: number; b: number; a: number }

// ── 공용 Pixel Readback ──────────────────────────────────────
// GPU 가속 캔버스(화면 캔버스/마스크 등)에 getImageData 를 반복 호출하면
// Canvas2D 가 willReadFrequently 경고를 내고 readback 이 느려진다.
// 판독 전용(willReadFrequently) 캔버스에 한 번 복사한 뒤 읽는 헬퍼로 우회한다.
let readbackCanvas: HTMLCanvasElement | null = null
let readbackCtx: CanvasRenderingContext2D | null = null

/** source 의 (sx,sy,sw,sh) 영역을 판독 전용 컨텍스트로 복사 후 ImageData 반환 */
export function readPixels(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): ImageData | null {
  if (sw <= 0 || sh <= 0) return null
  if (!readbackCanvas) {
    readbackCanvas = document.createElement('canvas')
    readbackCtx = readbackCanvas.getContext('2d', { willReadFrequently: true })
  }
  if (!readbackCtx) return null
  // 필요 시에만 확장 (매번 리사이즈하면 캔버스가 초기화되므로 grow-only)
  if (readbackCanvas.width < sw) readbackCanvas.width = sw
  if (readbackCanvas.height < sh) readbackCanvas.height = sh
  try {
    readbackCtx.clearRect(0, 0, sw, sh)
    readbackCtx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
    return readbackCtx.getImageData(0, 0, sw, sh)
  } catch {
    return null
  }
}

/** Photoshop Sample Size 목록 (Point = 1) */
export const SAMPLE_SIZES: { value: number; label: string }[] = [
  { value: 1, label: '포인트 샘플' },
  { value: 3, label: '3x3 평균' },
  { value: 5, label: '5x5 평균' },
  { value: 11, label: '11x11 평균' },
  { value: 31, label: '31x31 평균' },
  { value: 51, label: '51x51 평균' },
  { value: 101, label: '101x101 평균' },
]

export type SampleSource = 'current' | 'currentBelow' | 'all'

export const SAMPLE_SOURCES: { value: SampleSource; label: string }[] = [
  { value: 'all', label: '모든 레이어' },
  { value: 'current', label: '현재 레이어' },
  { value: 'currentBelow', label: '현재 및 아래 레이어' },
]

/**
 * ImageData 블록의 알파 가중 평균색.
 * 완전 투명 영역만 있으면 null (Photoshop — 빈 영역 클릭 시 색상 미변경).
 */
export function averageColor(img: ImageData): RGBA | null {
  const d = img.data
  let sr = 0
  let sg = 0
  let sb = 0
  let sa = 0
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 0) continue
    sr += d[i] * a
    sg += d[i + 1] * a
    sb += d[i + 2] * a
    sa += a
  }
  if (sa === 0) return null
  return {
    r: Math.round(sr / sa),
    g: Math.round(sg / sa),
    b: Math.round(sb / sa),
    a: Math.round(sa / (d.length / 4)),
  }
}

// ── 색 공간 변환 (Status Bar / HUD 표시용) ───────────────────
export function rgbToHex(c: RGBA): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase()
}

export function rgbToHsl(c: RGBA): { h: number; s: number; l: number } {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function rgbToHsv(c: RGBA): { h: number; s: number; v: number } {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return {
    h: Math.round(h),
    s: Math.round(max === 0 ? 0 : (d / max) * 100),
    v: Math.round(max * 100),
  }
}

export function rgbToCmyk(c: RGBA): { c: number; m: number; y: number; k: number } {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  }
}
