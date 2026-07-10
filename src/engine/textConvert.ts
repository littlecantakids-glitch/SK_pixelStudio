// Text → Vector 변환 — Rasterize Type / Convert to Shape / Convert to Path (Outline).
// 폰트 아웃라인 파서가 없으므로, Type Layer 를 래스터화한 알파를 윤곽선 추적(boundaryContours)해
// 글자 실루엣과 동일한 벡터 윤곽을 만든다 (구멍은 even-odd 로 처리).
import type { Layer, ShapeSpec, VectorPath } from '../types'
import { rasterizeText } from './textEngine'
import { boundaryContours } from './selectionEngine'
import { createPoint, newPathId } from './pathEngine'

/** Type Layer 를 문서 크기 알파 마스크로 (alpha>threshold = 255) */
function textAlphaMask(layer: Layer, docW: number, docH: number, threshold = 40): Uint8Array {
  const c = rasterizeText(layer, docW, docH)
  const ctx = c.getContext('2d')
  const m = new Uint8Array(docW * docH)
  if (!ctx) return m
  const data = ctx.getImageData(0, 0, docW, docH).data
  for (let i = 0; i < docW * docH; i++) if (data[i * 4 + 3] > threshold) m[i] = 255
  return m
}

/** 윤곽 루프([x0,y0,...])에서 너무 가까운 점 제거 (경량화) */
function simplifyLoop(loop: number[], minDist = 1.6): number[] {
  const out: number[] = []
  let lx = NaN
  let ly = NaN
  for (let i = 0; i < loop.length; i += 2) {
    const x = loop[i]
    const y = loop[i + 1]
    if (out.length >= 2 && Math.hypot(x - lx, y - ly) < minDist) continue
    out.push(x, y)
    lx = x
    ly = y
  }
  return out
}

/** Type Layer → 윤곽 루프 배열 (문서 좌표) */
export function textContours(layer: Layer, docW: number, docH: number): number[][] {
  if (!layer.text) return []
  const mask = textAlphaMask(layer, docW, docH)
  return boundaryContours(mask, docW, docH)
    .map((l) => simplifyLoop(l))
    .filter((l) => l.length >= 6)
}

/** 윤곽 루프 → VectorPath (corner 정점, 닫힌 패스, ox/oy 만큼 로컬 이동) */
function loopToPath(loop: number[], ox: number, oy: number, name: string): VectorPath {
  const points = []
  for (let i = 0; i < loop.length; i += 2) {
    points.push(createPoint({ x: loop[i] - ox, y: loop[i + 1] - oy }, 'corner'))
  }
  return { id: newPathId(), name, closed: true, visible: true, points }
}

export type TextShapeResult = { spec: ShapeSpec; x: number; y: number; width: number; height: number }

/** Type Layer → Shape Spec (윤곽 = path + subpaths, 로컬 좌표는 bbox 원점 기준) */
export function textToShapeSpec(layer: Layer, docW: number, docH: number): TextShapeResult | null {
  const contours = textContours(layer, docW, docH)
  if (!contours.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const l of contours) {
    for (let i = 0; i < l.length; i += 2) {
      minX = Math.min(minX, l[i])
      maxX = Math.max(maxX, l[i])
      minY = Math.min(minY, l[i + 1])
      maxY = Math.max(maxY, l[i + 1])
    }
  }
  const paths = contours.map((l, i) => loopToPath(l, minX, minY, i === 0 ? '모양' : `서브패스 ${i}`))
  const color = layer.text?.color ?? '#000000'
  const spec: ShapeSpec = {
    kind: 'custom',
    path: paths[0],
    subpaths: paths.slice(1),
    fill: { type: 'solid', color, enabled: true },
    stroke: { color: '#000000', width: 1, align: 'center', enabled: false },
  }
  return { spec, x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

/** Type Layer → Work Path 목록 (문서 좌표, 각 윤곽이 하나의 패스) */
export function textToWorkPaths(layer: Layer, docW: number, docH: number): VectorPath[] {
  return textContours(layer, docW, docH).map((l) => loopToPath(l, 0, 0, '작업 패스'))
}
