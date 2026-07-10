// Path Engine — Photoshop Vector Path System 의 순수 로직 (React/DOM 상태 없음).
// 향후 Shape Tool / Vector Mask / Text on Path / Stroke Path / SVG Export 가 모두 재사용한다.
//
//   Anchor(정점) + In/Out Handle(베지어 제어점) → Cubic Bezier Subpath → 평탄화(polyline)
//   → Mask(Selection) / Stroke(Brush) / Fill / SVG(d=...)
import type { VectorPath, PathPoint, Vec2 } from '../types'
import { polygonMask } from './selectionEngine'
import { drawSegment, type BrushOptions } from './brushEngine'

let pathSeq = 0
let pointSeq = 0
export function newPathId(): string {
  pathSeq += 1
  return `path-${pathSeq}-${Math.round(performance.now())}`
}
export function newPointId(): string {
  pointSeq += 1
  return `pt-${pointSeq}-${Math.round(performance.now())}`
}

/** Anchor 생성 — 기본은 Handle 이 Anchor 와 동일(=직선/코너) */
export function createPoint(
  anchor: Vec2,
  type: PathPoint['type'] = 'corner',
): PathPoint {
  return {
    id: newPointId(),
    anchor: { ...anchor },
    inHandle: { ...anchor },
    outHandle: { ...anchor },
    type,
    selected: false,
  }
}

export function createWorkPath(name = '작업 패스'): VectorPath {
  return { id: newPathId(), name, closed: false, visible: true, points: [] }
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Cubic Bezier 위 점 (t: 0~1) */
export function cubicAt(p0: Vec2, c0: Vec2, c1: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * c0.x + c * c1.x + d * p1.x,
    y: a * p0.y + b * c0.y + c * c1.y + d * p1.y,
  }
}

/** 한 구간(from→to)이 직선인지 (양쪽 Handle 이 Anchor 와 같음) */
function isLineSeg(from: PathPoint, to: PathPoint): boolean {
  return (
    from.outHandle.x === from.anchor.x &&
    from.outHandle.y === from.anchor.y &&
    to.inHandle.x === to.anchor.x &&
    to.inHandle.y === to.anchor.y
  )
}

/** 두 Anchor 사이 구간을 폴리라인으로 평탄화 */
function flattenSeg(from: PathPoint, to: PathPoint, out: Vec2[]) {
  if (isLineSeg(from, to)) {
    out.push({ ...to.anchor })
    return
  }
  const approx =
    dist(from.anchor, from.outHandle) + dist(from.outHandle, to.inHandle) + dist(to.inHandle, to.anchor)
  const steps = Math.max(8, Math.min(120, Math.round(approx / 4)))
  for (let i = 1; i <= steps; i++) {
    out.push(cubicAt(from.anchor, from.outHandle, to.inHandle, to.anchor, i / steps))
  }
}

/** Path 를 폴리라인 정점 배열로 평탄화 (closed 면 마지막→처음 구간 포함) */
export function flattenPath(path: VectorPath): Vec2[] {
  const pts = path.points
  if (pts.length === 0) return []
  const out: Vec2[] = [{ ...pts[0].anchor }]
  for (let i = 0; i + 1 < pts.length; i++) flattenSeg(pts[i], pts[i + 1], out)
  if (path.closed && pts.length > 2) flattenSeg(pts[pts.length - 1], pts[0], out)
  return out
}

/** 오버레이/Fill 용 Path2D (offset 만큼 이동 — 레이어 로컬 좌표 지원) */
export function buildPath2D(path: VectorPath, ox = 0, oy = 0): Path2D {
  const p = new Path2D()
  const pts = path.points
  if (pts.length === 0) return p
  p.moveTo(pts[0].anchor.x - ox, pts[0].anchor.y - oy)
  const seg = (from: PathPoint, to: PathPoint) => {
    if (isLineSeg(from, to)) {
      p.lineTo(to.anchor.x - ox, to.anchor.y - oy)
    } else {
      p.bezierCurveTo(
        from.outHandle.x - ox,
        from.outHandle.y - oy,
        to.inHandle.x - ox,
        to.inHandle.y - oy,
        to.anchor.x - ox,
        to.anchor.y - oy,
      )
    }
  }
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1])
  if (path.closed && pts.length > 1) {
    seg(pts[pts.length - 1], pts[0])
    p.closePath()
  }
  return p
}

// ── Hit Testing (문서 좌표, tol = 문서 픽셀 허용 오차) ─────────────
export type PathHit =
  | { kind: 'anchor'; pointId: string }
  | { kind: 'in'; pointId: string }
  | { kind: 'out'; pointId: string }
  | { kind: 'segment'; index: number; t: number }
  | null

/** Anchor / Handle 히트 (선택된 점의 Handle 은 우선 검사) */
export function hitTestPoints(path: VectorPath, pos: Vec2, tol: number): PathHit {
  // Handle 은 선택된(=핸들이 보이는) 점만 대상으로
  for (const pt of path.points) {
    const showHandles = pt.selected || pt.type !== 'corner'
    if (showHandles) {
      if (hasHandle(pt, 'out') && dist(pos, pt.outHandle) <= tol) return { kind: 'out', pointId: pt.id }
      if (hasHandle(pt, 'in') && dist(pos, pt.inHandle) <= tol) return { kind: 'in', pointId: pt.id }
    }
  }
  for (const pt of path.points) {
    if (dist(pos, pt.anchor) <= tol) return { kind: 'anchor', pointId: pt.id }
  }
  return null
}

export function hasHandle(pt: PathPoint, which: 'in' | 'out'): boolean {
  const h = which === 'in' ? pt.inHandle : pt.outHandle
  return h.x !== pt.anchor.x || h.y !== pt.anchor.y
}

/** 세그먼트(곡선) 히트 — 평탄화 후 선분 거리로 근사 */
export function hitTestSegment(path: VectorPath, pos: Vec2, tol: number): PathHit {
  const pts = path.points
  const n = pts.length
  if (n < 2) return null
  const test = (from: PathPoint, to: PathPoint, index: number): PathHit => {
    const line: Vec2[] = [{ ...from.anchor }]
    flattenSeg(from, to, line)
    for (let i = 0; i + 1 < line.length; i++) {
      const d = distToSeg(pos, line[i], line[i + 1])
      if (d <= tol) return { kind: 'segment', index, t: i / (line.length - 1) }
    }
    return null
  }
  for (let i = 0; i + 1 < n; i++) {
    const h = test(pts[i], pts[i + 1], i)
    if (h) return h
  }
  if (path.closed && n > 2) {
    const h = test(pts[n - 1], pts[0], n - 1)
    if (h) return h
  }
  return null
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// ── Selection / Stroke / Fill ────────────────────────────────────
/** Path → Selection Mask (평탄화 폴리곤을 even-odd 로 채움, 열린 패스는 닫아서 처리) */
export function pathToMask(path: VectorPath, w: number, h: number): Uint8Array {
  const poly = flattenPath(path).map((v) => [v.x, v.y])
  return polygonMask(w, h, poly)
}

/** Stroke Path — Brush Engine 으로 평탄화 폴리라인을 따라 dab 을 찍는다 (ctx 는 레이어 로컬) */
export function strokePathOnCanvas(
  ctx: CanvasRenderingContext2D,
  path: VectorPath,
  brush: BrushOptions,
  ox = 0,
  oy = 0,
  spacingRatio = 0.1,
) {
  const line = flattenPath(path)
  if (line.length < 2) return
  const local = line.map((v) => ({ x: v.x - ox, y: v.y - oy }))
  for (let i = 0; i + 1 < local.length; i++) {
    drawSegment(ctx, local[i], local[i + 1], brush, spacingRatio)
  }
}

/** Fill Path — 닫힌 폴리곤을 색으로 채운다 (ctx 는 레이어 로컬) */
export function fillPathOnCanvas(
  ctx: CanvasRenderingContext2D,
  path: VectorPath,
  color: string,
  ox = 0,
  oy = 0,
) {
  const p2d = buildPath2D({ ...path, closed: true }, ox, oy)
  ctx.save()
  ctx.fillStyle = color
  ctx.fill(p2d, 'evenodd')
  ctx.restore()
}

/** SVG path d= 문자열 (SVG Export 대비 구조) */
export function pathToSVG(path: VectorPath): string {
  const pts = path.points
  if (pts.length === 0) return ''
  const f = (n: number) => Math.round(n * 100) / 100
  let d = `M ${f(pts[0].anchor.x)} ${f(pts[0].anchor.y)}`
  const seg = (from: PathPoint, to: PathPoint) => {
    if (isLineSeg(from, to)) d += ` L ${f(to.anchor.x)} ${f(to.anchor.y)}`
    else
      d += ` C ${f(from.outHandle.x)} ${f(from.outHandle.y)} ${f(to.inHandle.x)} ${f(to.inHandle.y)} ${f(to.anchor.x)} ${f(to.anchor.y)}`
  }
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1])
  if (path.closed && pts.length > 1) {
    seg(pts[pts.length - 1], pts[0])
    d += ' Z'
  }
  return d
}

/** 패스 바운딩 박스 (Anchor+Handle 포함) */
export function pathBounds(path: VectorPath): { x: number; y: number; w: number; h: number } | null {
  if (path.points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pt of path.points) {
    for (const v of [pt.anchor, pt.inHandle, pt.outHandle]) {
      minX = Math.min(minX, v.x)
      minY = Math.min(minY, v.y)
      maxX = Math.max(maxX, v.x)
      maxY = Math.max(maxY, v.y)
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
