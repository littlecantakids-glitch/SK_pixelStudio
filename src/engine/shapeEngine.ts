// Shape Engine — Photoshop Vector Shape System 의 순수 로직 (React/DOM 상태 없음).
// Rectangle / Ellipse / Line 등 모든 Shape 는 Pen Tool 과 동일한 Path Engine(VectorPath)을 사용한다.
// Shape 는 Rasterize 하지 않는다 — RenderEngine 이 이 엔진의 draw 로직으로 실시간 렌더한다.
//
//   Drag → Geometry(Rect/Line) → VectorPath(레이어 로컬 좌표) → Shape Layer
//   RenderEngine → drawShapeOnCanvas(fill + stroke) → Composite
import type {
  Layer,
  ShapeFill,
  ShapeKind,
  ShapeSpec,
  ShapeStroke,
  StrokeAlign,
  Vec2,
  VectorPath,
} from '../types'
import { createPoint, newPathId, buildPath2D } from './pathEngine'
import { genId } from './layerEngine'
import { MASK_DEFAULTS } from './maskEngine'
import { gradientSignature, renderGradientToCanvas } from './gradientEngine'

/** Cubic Bezier 로 원(호)을 근사할 때의 제어점 비율 */
const KAPPA = 0.5522847498307936

const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: '사각형',
  roundRect: '둥근 사각형',
  ellipse: '타원',
  polygon: '다각형',
  line: '선',
  custom: '사용자 정의 모양',
}

export function shapeLabel(kind: ShapeKind): string {
  return SHAPE_LABELS[kind] ?? '모양'
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** corner 정점 (직선 코너) */
function corner(x: number, y: number): ReturnType<typeof createPoint> {
  return createPoint({ x, y }, 'corner')
}

/** smooth 정점 + In/Out Handle 직접 지정 */
function smooth(
  ax: number,
  ay: number,
  ihx: number,
  ihy: number,
  ohx: number,
  ohy: number,
): ReturnType<typeof createPoint> {
  const p = createPoint({ x: ax, y: ay }, 'smooth')
  p.inHandle = { x: ihx, y: ihy }
  p.outHandle = { x: ohx, y: ohy }
  return p
}

/** Rectangle Path (레이어 로컬 좌표: 0,0 ~ w,h) */
export function rectPath(w: number, h: number): VectorPath {
  return {
    id: newPathId(),
    name: '사각형',
    closed: true,
    visible: true,
    points: [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)],
  }
}

/** Rounded Rectangle Path — 각 모서리를 Cubic Bezier 로 근사 (8 정점) */
export function roundRectPath(w: number, h: number, radius: number): VectorPath {
  const rr = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
  if (rr <= 0.01) return { ...rectPath(w, h), name: '둥근 사각형' }
  const k = KAPPA * rr
  const pts = [
    smooth(rr, 0, rr - k, 0, rr, 0), // 상단 시작 (TL 코너 exit)
    smooth(w - rr, 0, w - rr, 0, w - rr + k, 0), // 상단 끝 (TR 코너 entry)
    smooth(w, rr, w, rr - k, w, rr), // 우측 시작
    smooth(w, h - rr, w, h - rr, w, h - rr + k), // 우측 끝
    smooth(w - rr, h, w - rr + k, h, w - rr, h), // 하단 시작
    smooth(rr, h, rr, h, rr - k, h), // 하단 끝
    smooth(0, h - rr, 0, h - rr + k, 0, h - rr), // 좌측 시작
    smooth(0, rr, 0, rr, 0, rr - k), // 좌측 끝 (TL 코너 entry)
  ]
  return { id: newPathId(), name: '둥근 사각형', closed: true, visible: true, points: pts }
}

/** Ellipse Path — 4 정점 Cubic Bezier 근사 */
export function ellipsePath(w: number, h: number): VectorPath {
  const rx = w / 2
  const ry = h / 2
  const cx = w / 2
  const cy = h / 2
  const ox = KAPPA * rx
  const oy = KAPPA * ry
  const pts = [
    smooth(cx, cy - ry, cx - ox, cy - ry, cx + ox, cy - ry), // top
    smooth(cx + rx, cy, cx + rx, cy - oy, cx + rx, cy + oy), // right
    smooth(cx, cy + ry, cx + ox, cy + ry, cx - ox, cy + ry), // bottom
    smooth(cx - rx, cy, cx - rx, cy + oy, cx - rx, cy - oy), // left
  ]
  return { id: newPathId(), name: '타원', closed: true, visible: true, points: pts }
}

/** Line Path — 2 정점, 열린 패스 (로컬 좌표) */
export function linePath(ax: number, ay: number, bx: number, by: number): VectorPath {
  return {
    id: newPathId(),
    name: '선',
    closed: false,
    visible: true,
    points: [corner(ax, ay), corner(bx, by)],
  }
}

/** 도형 종류 + 로컬 크기 → VectorPath */
export function buildShapePath(kind: ShapeKind, w: number, h: number, radius = 12): VectorPath {
  switch (kind) {
    case 'ellipse':
      return ellipsePath(w, h)
    case 'roundRect':
      return roundRectPath(w, h, radius)
    case 'rectangle':
    case 'polygon':
    case 'custom':
    default:
      return rectPath(w, h)
  }
}

export type ShapeGeom = { x: number; y: number; width: number; height: number; path: VectorPath }

/** Drag 사각형(문서 좌표) → Shape Geometry (레이어 원점 + 로컬 Path) */
export function rectShapeGeom(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 12,
): ShapeGeom {
  const width = Math.max(1, w)
  const height = Math.max(1, h)
  return { x, y, width, height, path: buildShapePath(kind, width, height, radius) }
}

/** 두 문서 좌표 끝점 → Line Shape Geometry (bbox 원점 기준 로컬 Path) */
export function lineShapeGeom(a: Vec2, b: Vec2): ShapeGeom {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const width = Math.max(1, Math.abs(b.x - a.x))
  const height = Math.max(1, Math.abs(b.y - a.y))
  return {
    x: minX,
    y: minY,
    width,
    height,
    path: linePath(a.x - minX, a.y - minY, b.x - minX, b.y - minY),
  }
}

export function defaultFill(color = '#7f7f7f'): ShapeFill {
  return { type: 'solid', color, enabled: true }
}

export function defaultStroke(
  color = '#000000',
  width = 1,
  align: StrokeAlign = 'center',
  enabled = false,
): ShapeStroke {
  return { color, width, align, enabled }
}

/** Shape Layer 생성 — Bitmap 없음, shape 스펙만 보유 (RenderEngine 이 실시간 렌더) */
export function createShapeLayer(opts: {
  name: string
  geom: ShapeGeom
  kind: ShapeKind
  fill: ShapeFill
  stroke: ShapeStroke
  radius?: number
  sides?: number
}): Layer {
  const { name, geom, kind, fill, stroke, radius, sides } = opts
  const shape: ShapeSpec = {
    kind,
    path: geom.path,
    fill: { ...fill },
    stroke: { ...stroke },
    radius,
    sides,
  }
  return {
    id: genId('shape'),
    name,
    type: 'shape',
    visible: true,
    locked: false,
    selected: true,
    opacity: 100,
    fill: 100,
    blendMode: 'normal',
    x: geom.x,
    y: geom.y,
    width: geom.width,
    height: geom.height,
    rotation: 0,
    ...MASK_DEFAULTS,
    shape,
  }
}

/** "모양 N" 다음 이름 */
export function nextShapeName(layers: Layer[], kind: ShapeKind): string {
  const base = shapeLabel(kind)
  let max = 0
  for (const l of layers) {
    const m = new RegExp(`^${base} (\\d+)$`).exec(l.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${base} ${max + 1}`
}

/** Shape 로컬 좌표 최대 범위 (Gradient Fill 래스터 크기 계산용) */
function shapeLocalBounds(shape: ShapeSpec): { x: number; y: number; width: number; height: number } {
  let maxX = 1
  let maxY = 1
  const scan = (pts: { anchor: { x: number; y: number } }[]) => {
    for (const p of pts) {
      if (p.anchor.x > maxX) maxX = p.anchor.x
      if (p.anchor.y > maxY) maxY = p.anchor.y
    }
  }
  scan(shape.path.points)
  if (shape.subpaths) for (const sp of shape.subpaths) scan(sp.points)
  return { x: 0, y: 0, width: maxX, height: maxY }
}

/**
 * Shape 를 canvas 에 그린다 (ctx 는 이미 레이어 원점으로 translate 된 상태 = 로컬 좌표).
 * Fill(닫힌 도형) → Stroke(center/inside/outside). RenderEngine 과 Thumbnail 이 공유.
 */
export function drawShapeOnCanvas(ctx: CanvasRenderingContext2D, shape: ShapeSpec) {
  const closed = shape.path.closed
  const p2d = buildPath2D(shape.path, 0, 0)
  // 다중 서브패스(Type→Shape 변환 등)를 하나의 Path2D 로 합쳐 even-odd 로 채운다
  if (shape.subpaths?.length) {
    for (const sp of shape.subpaths) p2d.addPath(buildPath2D(sp, 0, 0))
  }

  // Fill — 닫힌 도형만. Gradient Fill 은 Gradient Engine 의 래스터를 pattern 으로 사용
  // (linear/radial/angle/reflected/diamond 5종 + dither 모두 동일 엔진 재사용)
  if (shape.fill.enabled && closed) {
    ctx.save()
    if (shape.fill.type === 'gradient' && shape.fill.gradient && shape.fill.gradientGeom) {
      ctx.clip(p2d, 'evenodd')
      const b = shapeLocalBounds(shape)
      const gc = renderGradientToCanvas(
        Math.max(1, Math.ceil(b.x + b.width)),
        Math.max(1, Math.ceil(b.y + b.height)),
        shape.fill.gradient,
        shape.fill.gradientGeom,
        { fg: '#000000', bg: '#ffffff', transparency: true },
      )
      ctx.drawImage(gc, 0, 0)
    } else {
      ctx.fillStyle = shape.fill.color
      ctx.fill(p2d, 'evenodd')
    }
    ctx.restore()
  }

  const s = shape.stroke
  if (!s.enabled || s.width <= 0) return

  ctx.save()
  ctx.strokeStyle = s.color
  ctx.lineJoin = 'miter'
  ctx.lineCap = closed ? 'butt' : 'round'

  if (!closed || s.align === 'center') {
    // Center — 열린 도형(선)은 항상 center
    ctx.lineWidth = s.width
    ctx.stroke(p2d)
  } else if (s.align === 'inside') {
    // Inside — 패스 내부로 클립 후 2배 두께 (안쪽 절반만 남음)
    ctx.clip(p2d, 'evenodd')
    ctx.lineWidth = s.width * 2
    ctx.stroke(p2d)
  } else {
    // Outside — 패스 외부(큰 사각형 XOR 패스)로 클립 후 2배 두께 (Fill 보존)
    const outside = new Path2D()
    outside.rect(-100000, -100000, 200000, 200000)
    outside.addPath(p2d)
    ctx.clip(outside, 'evenodd')
    ctx.lineWidth = s.width * 2
    ctx.stroke(p2d)
  }
  ctx.restore()
}

/**
 * Shape 크기 변경 시 로컬 Path 재생성 (parametric 도형은 재빌드, line 은 비율 스케일).
 * oldW/oldH = 기존 layer.width/height, w/h = 새 크기.
 */
export function resizeShapePath(
  shape: ShapeSpec,
  oldW: number,
  oldH: number,
  w: number,
  h: number,
): VectorPath {
  if (shape.kind === 'line') {
    const sx = oldW > 0 ? w / oldW : 1
    const sy = oldH > 0 ? h / oldH : 1
    return {
      ...shape.path,
      points: shape.path.points.map((p) => ({
        ...p,
        anchor: { x: p.anchor.x * sx, y: p.anchor.y * sy },
        inHandle: { x: p.inHandle.x * sx, y: p.inHandle.y * sy },
        outHandle: { x: p.outHandle.x * sx, y: p.outHandle.y * sy },
      })),
    }
  }
  return buildShapePath(shape.kind, w, h, shape.radius ?? 12)
}

/** Shape → 문서 크기 Bitmap 으로 Rasterize (Rasterize Shape / 내보내기용) */
export function rasterizeShape(layer: Layer, docW: number, docH: number): HTMLCanvasElement {
  const c = makeCanvas(docW, docH)
  const ctx = c.getContext('2d')
  if (ctx && layer.shape) {
    ctx.save()
    ctx.translate(layer.x, layer.y)
    drawShapeOnCanvas(ctx, layer.shape)
    ctx.restore()
  }
  return c
}

/** Shape 캐시 서명 — 기하/스타일 변경 시 RenderEngine 캐시 무효화 */
export function shapeSignature(layer: Layer): string {
  const s = layer.shape
  if (!s) return 'noshape'
  const f = s.fill
  const st = s.stroke
  // path 는 정점/핸들 좌표를 요약 (JSON 대신 경량 직렬화)
  let pathSig = `${s.path.closed ? 'c' : 'o'}:${s.path.points.length}`
  for (const p of s.path.points) {
    pathSig += `|${p.anchor.x.toFixed(1)},${p.anchor.y.toFixed(1)};${p.outHandle.x.toFixed(1)},${p.outHandle.y.toFixed(1)};${p.inHandle.x.toFixed(1)},${p.inHandle.y.toFixed(1)}`
  }
  const subSig = s.subpaths?.length ? `+${s.subpaths.length}:${s.subpaths.reduce((n, sp) => n + sp.points.length, 0)}` : ''
  const fillSig =
    f.type === 'gradient'
      ? `g:${gradientSignature(f.gradient, f.gradientGeom)}`
      : f.color
  return `${s.kind}:${f.enabled ? fillSig : 'nofill'}:${st.enabled ? `${st.color},${st.width},${st.align}` : 'nostroke'}:${pathSig}${subSig}`
}
