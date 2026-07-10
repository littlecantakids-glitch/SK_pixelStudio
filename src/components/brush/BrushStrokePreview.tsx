import { useEffect, useRef } from 'react'
import { drawSegment, type BrushOptions } from '../../engine/brushEngine'

/**
 * Brush Preview Stroke — 실제 Brush Engine(drawSegment)으로 S-커브를 그려
 * Size / Hardness / Opacity / Flow / Spacing 변경을 그대로 미리 보여준다.
 */
export function BrushStrokePreview({
  width = 264,
  height = 72,
  size,
  hardness,
  opacity,
  flow,
  spacing,
}: {
  width?: number
  height?: number
  size: number
  hardness: number
  opacity: number
  flow: number
  spacing: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 미리보기 안에 들어가도록 표시용 크기 축소 (실제 파라미터 비율은 유지)
    const displaySize = Math.min(size, height * 0.7) * dpr
    const opts: BrushOptions = {
      size: displaySize,
      hardness,
      flow,
      color: '#e8e8e8',
      composite: 'source-over',
    }

    // S-커브를 따라 스트로크
    const buffer = document.createElement('canvas')
    buffer.width = canvas.width
    buffer.height = canvas.height
    const bctx = buffer.getContext('2d')!
    const pad = displaySize / 2 + 6 * dpr
    const w = canvas.width - pad * 2
    const cy = canvas.height / 2
    const amp = (canvas.height - displaySize) / 2.6
    let last = { x: pad, y: cy }
    const steps = 40
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const p = { x: pad + w * t, y: cy - Math.sin(t * Math.PI * 2) * amp }
      drawSegment(bctx, last, p, opts, Math.max(0.02, spacing / 100))
      last = p
    }
    // Opacity 는 Photoshop처럼 스트로크 전체에 한 번 적용
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity / 100))
    ctx.drawImage(buffer, 0, 0)
    ctx.globalAlpha = 1
  }, [width, height, size, hardness, opacity, flow, spacing])

  return (
    <canvas
      ref={ref}
      className="brush-popup__stroke"
      style={{ width, height, display: 'block' }}
    />
  )
}
