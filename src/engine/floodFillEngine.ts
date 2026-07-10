// Flood Fill Engine — Photoshop Color Matching 의 단일 계산 엔진.
// Paint Bucket 과 (향후) Magic Wand 가 동일한 Tolerance/Contiguous/Anti-Alias
// 매칭 로직을 공유한다. 입력은 항상 렌더 결과(ImageData) — Layer 직접 접근 금지.
//
// 성능: Queue 기반 Scanline Flood Fill (재귀/DFS 금지 — Stack Overflow 없음).
// Span 단위로 확장하므로 대용량 이미지에서도 픽셀당 상수 회수만 방문한다.

export type ColorMatchOptions = {
  /** 0~255 — 낮을수록 비슷한 색만 매칭 */
  tolerance: number
  /** true = 인접 픽셀만(Flood), false = 이미지 전체에서 같은 색 */
  contiguous: boolean
  /** true = 경계 부드럽게 (3×3 커버리지 블러) */
  antiAlias: boolean
  /** 8-way 연결 (Photoshop 기본). false = 4-way */
  eightWay?: boolean
}

export class FloodFillEngine {
  /**
   * 두 픽셀의 색 거리 — 채널별 최대 차이 (Photoshop Tolerance 방식).
   * 투명 픽셀: 둘 중 하나가 완전 투명이면 RGB 는 무의미하므로 Alpha 차이만 사용.
   * (투명 ↔ 투명 = 0, 투명 ↔ 불투명 = 255) — Magic Wand 와 공유.
   */
  matchColor(
    d: Uint8ClampedArray,
    i: number,
    sr: number,
    sg: number,
    sb: number,
    sa: number,
  ): number {
    const a = d[i + 3]
    const da = Math.abs(a - sa)
    if (a === 0 || sa === 0) return da
    const dr = Math.abs(d[i] - sr)
    const dg = Math.abs(d[i + 1] - sg)
    const db = Math.abs(d[i + 2] - sb)
    return Math.max(da, dr, dg, db)
  }

  /**
   * Queue 기반 Scanline Flood Fill (Contiguous).
   * Span(가로 연속 구간)을 한 번에 채우고 위/아래 행에서 새 Span seed 만 큐에 넣는다.
   */
  scanlineFill(
    img: ImageData,
    seedX: number,
    seedY: number,
    tolerance: number,
    eightWay = true,
  ): Uint8ClampedArray {
    const { width: w, height: h, data: d } = img
    const mask = new Uint8ClampedArray(w * h)
    const x0 = Math.floor(seedX)
    const y0 = Math.floor(seedY)
    const si = (y0 * w + x0) * 4
    const sr = d[si]
    const sg = d[si + 1]
    const sb = d[si + 2]
    const sa = d[si + 3]
    const tol = Math.max(0, Math.min(255, tolerance))
    const match = (p: number) => this.matchColor(d, p * 4, sr, sg, sb, sa) <= tol

    // 명시적 큐 — 재귀/DFS 없음 (Stack Overflow 불가), 같은 픽셀 중복 push 대비 동적 배열
    const queue: number[] = [y0 * w + x0]

    while (queue.length > 0) {
      const p = queue.pop()!
      if (mask[p]) continue
      if (!match(p)) continue
      const y = (p / w) | 0
      const rowStart = y * w
      let x1 = p - rowStart
      let x2 = x1
      // Span 좌우 확장
      while (x1 > 0 && !mask[rowStart + x1 - 1] && match(rowStart + x1 - 1)) x1--
      while (x2 < w - 1 && !mask[rowStart + x2 + 1] && match(rowStart + x2 + 1)) x2++
      // Span 채우기
      mask.fill(255, rowStart + x1, rowStart + x2 + 1)
      // 위/아래 행에서 새 Span seed 탐색 (8-way 는 ±1 확장)
      const pad = eightWay ? 1 : 0
      const nx1 = Math.max(0, x1 - pad)
      const nx2 = Math.min(w - 1, x2 + pad)
      for (let dy = -1; dy <= 1; dy += 2) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        const nRow = ny * w
        let inSpan = false
        for (let nx = nx1; nx <= nx2; nx++) {
          const np = nRow + nx
          const ok = !mask[np] && match(np)
          if (ok && !inSpan) {
            queue.push(np)
            inSpan = true
          } else if (!ok) {
            inSpan = false
          }
        }
      }
    }
    return mask
  }

  /** Contiguous OFF — 문서 전체에서 같은 색 전부 매칭 */
  globalMatch(img: ImageData, seedX: number, seedY: number, tolerance: number): Uint8ClampedArray {
    const { width: w, height: h, data: d } = img
    const mask = new Uint8ClampedArray(w * h)
    const si = (Math.floor(seedY) * w + Math.floor(seedX)) * 4
    const sr = d[si]
    const sg = d[si + 1]
    const sb = d[si + 2]
    const sa = d[si + 3]
    const tol = Math.max(0, Math.min(255, tolerance))
    for (let p = 0; p < w * h; p++) {
      if (this.matchColor(d, p * 4, sr, sg, sb, sa) <= tol) mask[p] = 255
    }
    return mask
  }

  /**
   * Color Matching 진입점 — Seed 기준 커버리지 마스크(0~255).
   * Paint Bucket 은 이 마스크로 Fill 하고, Magic Wand 는 Selection 으로 사용한다.
   */
  fill(
    img: ImageData,
    seedX: number,
    seedY: number,
    opts: ColorMatchOptions,
  ): Uint8ClampedArray | null {
    const { width: w, height: h } = img
    const x = Math.floor(seedX)
    const y = Math.floor(seedY)
    if (x < 0 || y < 0 || x >= w || y >= h) return null
    const mask = opts.contiguous
      ? this.scanlineFill(img, x, y, opts.tolerance, opts.eightWay !== false)
      : this.globalMatch(img, x, y, opts.tolerance)
    return opts.antiAlias ? antiAliasMask(mask, w, h) : mask
  }
}

/** 공유 싱글턴 — Paint Bucket / Magic Wand 가 함께 사용 */
export const floodFillEngine = new FloodFillEngine()

/** 함수형 API (하위 호환) */
export function colorMatchMask(
  img: ImageData,
  seedX: number,
  seedY: number,
  opts: ColorMatchOptions,
): Uint8ClampedArray | null {
  return floodFillEngine.fill(img, seedX, seedY, opts)
}

/** 경계 3×3 평균 블러 — Anti Alias 커버리지 (내부/외부 완전 영역은 유지) */
function antiAliasMask(mask: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const v = mask[p]
      // 경계 판정 — 4방향 이웃과 값이 다를 때만 블러
      const l = x > 0 ? mask[p - 1] : v
      const r = x < w - 1 ? mask[p + 1] : v
      const u = y > 0 ? mask[p - w] : v
      const dn = y < h - 1 ? mask[p + w] : v
      if (l === v && r === v && u === v && dn === v) {
        out[p] = v
        continue
      }
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          sum += mask[yy * w + xx]
          n++
        }
      }
      out[p] = Math.round(sum / n)
    }
  }
  return out
}

/** 커버리지 마스크 → 알파 캔버스 (Fill 클리핑/Selection 변환용) */
export function maskToAlphaCanvas(
  mask: Uint8ClampedArray,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let p = 0; p < mask.length; p++) img.data[p * 4 + 3] = mask[p]
  ctx.putImageData(img, 0, 0)
  return c
}
