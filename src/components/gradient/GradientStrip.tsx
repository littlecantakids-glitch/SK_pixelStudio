import { useEffect, useRef } from 'react'
import { useEditor } from '../../state'
import { renderGradientStrip } from '../../engine/gradientEngine'
import type { Gradient } from '../../types'

/**
 * Gradient 스트립 썸네일 — Options Bar 프리셋 버튼 / Preset Picker / Editor 바가 공유.
 * 체커보드 배경 위에 그려 Opacity Stop(투명)을 시각화한다.
 */
export function GradientStrip({
  gradient,
  width,
  height,
  reverse = false,
  className,
}: {
  gradient: Gradient
  width: number
  height: number
  reverse?: boolean
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { foregroundColor, backgroundColor } = useEditor()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const strip = renderGradientStrip(canvas.width, canvas.height, gradient, {
      fg: foregroundColor,
      bg: backgroundColor,
      reverse,
      transparency: true,
    })
    ctx.drawImage(strip, 0, 0)
  }, [gradient, width, height, reverse, foregroundColor, backgroundColor])

  return (
    <span className={`grad-strip${className ? ` ${className}` : ''}`} style={{ width, height }}>
      <canvas ref={ref} style={{ width, height, display: 'block' }} />
    </span>
  )
}
