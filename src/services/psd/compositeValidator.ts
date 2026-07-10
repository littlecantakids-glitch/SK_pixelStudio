// Composite Validator (개발용) — PSD 에 저장된 Composite Image 와
// 변환된 Layer Stack 을 단순 합성한 결과를 비교해 Import 품질을 수치화하고,
// Pixel 단위 비교가 가능한 Difference Overlay 캔버스를 생성한다.
// Blend fallback/미지원 기능 때문에 완전히 같을 수는 없지만,
// 순서/위치/투명도/변형 버그를 즉시 드러내는 안전망 역할을 한다.
import type { Layer } from '../../types'
import { BLEND_OP } from '../../engine/blendModes'

export type CompositeValidation = {
  /** RGB 평균 오차 (0~255) */
  meanError: number
  /** RGB 최대 오차 (0~255) */
  maxError: number
  /** 오차 8 초과 픽셀 비율 (0~100) */
  diffPercent: number
  /** 비교에 사용한 해상도 */
  sampleSize: string
  /** Photoshop 이 저장한 Composite (다운샘플) */
  reference: HTMLCanvasElement
  /** 현재 Import 결과 렌더 (다운샘플) */
  rendered: HTMLCanvasElement
  /** Difference Overlay — 회색조 원본 위에 오차 픽셀을 빨강으로 강조 */
  diff: HTMLCanvasElement
}

/** 비교용 최대 해상도 — 성능을 위해 다운샘플 (Debug Overlay 도 이 해상도 공유) */
const SAMPLE_MAX = 1024

export function validateComposite(
  composite: HTMLCanvasElement,
  layers: Layer[],
  docWidth: number,
  docHeight: number,
): CompositeValidation | null {
  const scale = Math.min(1, SAMPLE_MAX / Math.max(docWidth, docHeight))
  const w = Math.max(1, Math.round(docWidth * scale))
  const h = Math.max(1, Math.round(docHeight * scale))

  // 1) Layer Stack 단순 합성 (bottom → top, 그룹 통과)
  const rendered = document.createElement('canvas')
  rendered.width = w
  rendered.height = h
  const ctx = rendered.getContext('2d')
  if (!ctx) return null
  ctx.save()
  ctx.scale(scale, scale)

  const byId = new Map(layers.map((l) => [l.id, l]))
  const isVisible = (l: Layer): boolean => {
    if (!l.visible) return false
    let pid = l.parentId
    for (let i = 0; pid && i < 64; i++) {
      const p = byId.get(pid)
      if (!p) break
      if (!p.visible) return false
      pid = p.parentId
    }
    return true
  }

  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    if (l.type === 'group' || !l.bitmap || !isVisible(l)) continue
    ctx.globalAlpha = Math.max(0, Math.min(1, l.opacity / 100))
    ctx.globalCompositeOperation = BLEND_OP[l.blendMode] ?? 'source-over'
    try {
      ctx.drawImage(l.bitmap, l.x, l.y, l.width, l.height)
    } catch {
      /* 빈 비트맵 등 — 검증 목적이므로 무시 */
    }
  }
  ctx.restore()

  // 2) Composite 다운샘플
  const reference = document.createElement('canvas')
  reference.width = w
  reference.height = h
  const refCtx = reference.getContext('2d')
  if (!refCtx) return null
  refCtx.drawImage(composite, 0, 0, w, h)

  // 3) 픽셀 비교 + Difference Overlay 생성
  //    (alpha premultiply 차이 완화를 위해 RGB×A 로 비교)
  const a = ctx.getImageData(0, 0, w, h).data
  const b = refCtx.getImageData(0, 0, w, h).data
  const diffData = new Uint8ClampedArray(w * h * 4)
  let sum = 0
  let max = 0
  let diffCount = 0
  const pixels = w * h
  for (let i = 0; i < pixels; i++) {
    const p = i * 4
    const aa = a[p + 3] / 255
    const ba = b[p + 3] / 255
    let pixelMax = 0
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[p + c] * aa - b[p + c] * ba)
      sum += d
      if (d > pixelMax) pixelMax = d
    }
    if (pixelMax > max) max = pixelMax
    if (pixelMax > 8) diffCount++

    // Overlay: 원본을 어두운 회색조로 깔고, 오차를 빨강 강도로 표시
    const gray = (b[p] * 0.299 + b[p + 1] * 0.587 + b[p + 2] * 0.114) * ba * 0.35
    diffData[p] = Math.min(255, gray + (pixelMax > 8 ? 90 + pixelMax * 0.65 : 0))
    diffData[p + 1] = gray
    diffData[p + 2] = gray
    diffData[p + 3] = 255
  }

  const diff = document.createElement('canvas')
  diff.width = w
  diff.height = h
  diff.getContext('2d')?.putImageData(new ImageData(diffData, w, h), 0, 0)

  return {
    meanError: Math.round((sum / (pixels * 3)) * 100) / 100,
    maxError: Math.round(max),
    diffPercent: Math.round((diffCount / pixels) * 10000) / 100,
    sampleSize: `${w}×${h}`,
    reference,
    rendered,
    diff,
  }
}
