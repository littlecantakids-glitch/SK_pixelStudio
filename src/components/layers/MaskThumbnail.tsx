import { useEffect, useRef } from 'react'
import type { Layer } from '../../types'

const BOX_W = 36
const BOX_H = 28

/**
 * Layer Mask 썸네일 — Grayscale 마스크를 축소 렌더.
 * 클릭 = Mask Active / Shift+클릭 = 비활성 토글 / Alt+클릭 = Mask만 크게 보기.
 * 비활성 시 Photoshop처럼 빨간 X 표시.
 */
export function MaskThumbnail({
  layer,
  active = false,
  onMouseDown,
}: {
  layer: Layer
  active?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const mask = layer.mask

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !mask) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = BOX_W * dpr
    canvas.height = BOX_H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const iw = mask.bitmap.width
    const ih = mask.bitmap.height
    if (!iw || !ih) return
    const scale = Math.min((BOX_W * dpr) / iw, (BOX_H * dpr) / ih)
    const w = iw * scale
    const h = ih * scale
    const x = (BOX_W * dpr - w) / 2
    const y = (BOX_H * dpr - h) / 2
    try {
      ctx.drawImage(mask.bitmap, x, y, w, h)
    } catch {
      /* 렌더 실패 무시 */
    }
  }, [mask, mask?.bitmap, layer.maskEnabled])

  if (!mask) return null

  return (
    <span
      className={`layer-thumb layer-thumb--mask${active ? ' layer-thumb--active' : ''}`}
      title="레이어 마스크 (Shift+클릭: 비활성, Alt+클릭: 마스크 보기)"
      onMouseDown={onMouseDown}
    >
      <canvas ref={ref} style={{ width: BOX_W, height: BOX_H }} />
      {!layer.maskEnabled && <span className="layer-thumb__x" />}
    </span>
  )
}
