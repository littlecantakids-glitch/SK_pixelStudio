// Selection Engine — 순수 마스크 로직. 모든 편집 도구가 참조하는 Mask 기반.
import type { Rect, SelectionOperation } from '../types'

export function emptyMask(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h)
}

export function rectMask(w: number, h: number, r: Rect): Uint8Array {
  const m = emptyMask(w, h)
  const x0 = Math.max(0, Math.floor(Math.min(r.x, r.x + r.width)))
  const y0 = Math.max(0, Math.floor(Math.min(r.y, r.y + r.height)))
  const x1 = Math.min(w, Math.ceil(Math.max(r.x, r.x + r.width)))
  const y1 = Math.min(h, Math.ceil(Math.max(r.y, r.y + r.height)))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) m[y * w + x] = 255
  }
  return m
}

export function ellipseMask(w: number, h: number, r: Rect): Uint8Array {
  const m = emptyMask(w, h)
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  const rx = Math.abs(r.width / 2)
  const ry = Math.abs(r.height / 2)
  if (rx < 0.5 || ry < 0.5) return m
  const x0 = Math.max(0, Math.floor(cx - rx))
  const y0 = Math.max(0, Math.floor(cy - ry))
  const x1 = Math.min(w, Math.ceil(cx + rx))
  const y1 = Math.min(h, Math.ceil(cy + ry))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1) m[y * w + x] = 255
    }
  }
  return m
}

/** 다각형(또는 올가미 경로) 내부 채우기 — even-odd 규칙 */
export function polygonMask(w: number, h: number, pts: number[][]): Uint8Array {
  const m = emptyMask(w, h)
  if (pts.length < 3) return m
  let minY = Infinity
  let maxY = -Infinity
  for (const [, py] of pts) {
    minY = Math.min(minY, py)
    maxY = Math.max(maxY, py)
  }
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(h - 1, Math.ceil(maxY))
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5
    const xs: number[] = []
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > yc !== yj > yc) {
        const t = (yc - yi) / (yj - yi)
        xs.push(xi + t * (xj - xi))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5))
      const xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5))
      for (let x = xa; x <= xb; x++) m[y * w + x] = 255
    }
  }
  return m
}

export function allMask(w: number, h: number): Uint8Array {
  const m = emptyMask(w, h)
  m.fill(255)
  return m
}

export function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 255
  return out
}

/** 기존 마스크와 새 도형 마스크를 연산에 따라 결합 */
export function combine(
  base: Uint8Array | null,
  shape: Uint8Array,
  op: SelectionOperation,
): Uint8Array {
  if (op === 'new' || !base) return shape
  const out = new Uint8Array(shape.length)
  for (let i = 0; i < shape.length; i++) {
    const b = base[i] ? 1 : 0
    const s = shape[i] ? 1 : 0
    let v = 0
    if (op === 'add') v = b | s
    else if (op === 'subtract') v = b && !s ? 1 : 0
    else if (op === 'intersect') v = b & s
    out[i] = v ? 255 : 0
  }
  return out
}

export function boundsOf(mask: Uint8Array, w: number, h: number): Rect {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function isEmpty(mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) if (mask[i]) return false
  return true
}

export function translateMask(
  mask: Uint8Array,
  w: number,
  h: number,
  dx: number,
  dy: number,
): Uint8Array {
  const out = emptyMask(w, h)
  const idx = Math.round(dx)
  const idy = Math.round(dy)
  for (let y = 0; y < h; y++) {
    const sy = y - idy
    if (sy < 0 || sy >= h) continue
    for (let x = 0; x < w; x++) {
      const sx = x - idx
      if (sx < 0 || sx >= w) continue
      out[y * w + x] = mask[sy * w + sx]
    }
  }
  return out
}

/**
 * 마스크 경계를 연속된 폐곡선(Contour) 폴리라인으로 추적한다. 마칭 앤츠용.
 * boundarySegments 처럼 1px 선분을 나열하면 subpath 마다 dash 위상이 리셋되어
 * 대시가 생기지 않고 전체 테두리가 한꺼번에 깜박이므로, 반드시 이어진 경로가 필요하다.
 * 반환: 루프 배열, 각 루프는 방향 전환점만 담은 [x0,y0, x1,y1, ...] (닫힌 경로).
 */
export function boundaryContours(mask: Uint8Array, w: number, h: number): number[][] {
  // Photoshop처럼 커버리지 50% 지점을 경계로 추적 — Anti-Alias/Feather 마스크에서
  // 희미한 가장자리(>0)까지 따라가면 앤츠가 지저분해진다
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] > 127
  const W1 = w + 1
  // 방향 있는 경계 에지 (채워진 영역을 시계 방향으로 감싼다) — vertex key = y*(w+1)+x
  const out = new Map<number, number[]>()
  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const a = y0 * W1 + x0
    const b = y1 * W1 + x1
    const list = out.get(a)
    if (list) list.push(b)
    else out.set(a, [b])
  }
  let edgeCount = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue
      if (!on(x, y - 1)) { addEdge(x, y, x + 1, y); edgeCount++ } // top →
      if (!on(x + 1, y)) { addEdge(x + 1, y, x + 1, y + 1); edgeCount++ } // right ↓
      if (!on(x, y + 1)) { addEdge(x + 1, y + 1, x, y + 1); edgeCount++ } // bottom ←
      if (!on(x - 1, y)) { addEdge(x, y + 1, x, y); edgeCount++ } // left ↑
    }
  }

  const contours: number[][] = []
  let guard = edgeCount + 4
  for (const start of out.keys()) {
    // 남은 에지가 있는 정점에서 루프 추적 시작
    while ((out.get(start)?.length ?? 0) > 0) {
      const pts: number[] = []
      let cur = start
      let prevDx = 0
      let prevDy = 0
      while (guard-- > 0) {
        const nexts = out.get(cur)
        if (!nexts || nexts.length === 0) break
        const nxt = nexts.pop()!
        const cx = cur % W1
        const cy = (cur / W1) | 0
        const dx = (nxt % W1) - cx
        const dy = ((nxt / W1) | 0) - cy
        // 방향 전환점만 기록 (collinear 병합 → Path 크기 최소화)
        if (dx !== prevDx || dy !== prevDy) {
          pts.push(cx, cy)
          prevDx = dx
          prevDy = dy
        }
        cur = nxt
        if (cur === start) break
      }
      if (pts.length >= 4) contours.push(pts)
      if (guard <= 0) return contours
    }
  }
  return contours
}

/** 마스크 경계 선분(마칭 앤츠용). [x1,y1,x2,y2,...] 형태로 반환 */
export function boundarySegments(mask: Uint8Array, w: number, h: number): number[] {
  const seg: number[] = []
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] > 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue
      if (!on(x, y - 1)) seg.push(x, y, x + 1, y) // top
      if (!on(x, y + 1)) seg.push(x, y + 1, x + 1, y + 1) // bottom
      if (!on(x - 1, y)) seg.push(x, y, x, y + 1) // left
      if (!on(x + 1, y)) seg.push(x + 1, y, x + 1, y + 1) // right
    }
  }
  return seg
}
