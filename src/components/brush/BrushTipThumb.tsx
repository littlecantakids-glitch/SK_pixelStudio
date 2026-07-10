import { useEffect, useRef } from 'react'

/**
 * 원형 브러시 팁 썸네일 — hardness 에 따른 가장자리 부드러움을 그대로 렌더.
 * Preset 리스트 / Options Bar 프리셋 버튼에서 재사용한다.
 */
export function BrushTipThumb({
  size = 28,
  hardness,
  brushSize,
  shape = 'round',
  className,
}: {
  /** 썸네일 픽셀 크기 */
  size?: number
  hardness: number
  /** 실제 브러시 크기 — 썸네일 안에서 상대 크기로 반영 (선택) */
  brushSize?: number
  /** 팁 모양 (UI 표시용) */
  shape?: 'round' | 'square'
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const cx = canvas.width / 2
    const cy = canvas.height / 2
    // 브러시 크기를 로그 스케일로 반영해 팁 크기 차이를 표현
    const ratio = brushSize ? Math.min(1, 0.35 + Math.log10(Math.max(1, brushSize)) * 0.22) : 0.8
    const r = (canvas.width / 2) * 0.9 * ratio

    if (shape === 'square') {
      ctx.fillStyle = '#e8e8e8'
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    } else if (hardness >= 99) {
      ctx.fillStyle = '#e8e8e8'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const inner = Math.max(0.02, hardness / 100)
      const grad = ctx.createRadialGradient(cx, cy, r * inner, cx, cy, r)
      grad.addColorStop(0, 'rgba(232,232,232,1)')
      grad.addColorStop(1, 'rgba(232,232,232,0)')
      ctx.fillStyle = 'rgba(232,232,232,1)'
      ctx.beginPath()
      ctx.arc(cx, cy, r * inner, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [size, hardness, brushSize, shape])

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  )
}
