import { useEffect, useRef } from 'react'
import type { Layer, OpenDocument } from '../../types'
import { drawShapeOnCanvas, shapeSignature } from '../../engine/shapeEngine'
import { drawTextOnCanvas, textSignature } from '../../engine/textEngine'
import { getSmartComposite } from '../../engine/smartEngine'

const BOX_W = 36
const BOX_H = 28

/** 레이어 비트맵을 축소해 썸네일 렌더 (변경 시 자동 갱신). Photoshop처럼 활성 시 흰색 테두리 */
export function LayerThumbnail({
  layer,
  active = false,
  onMouseDown,
  onDoubleClick,
  resolveSmart,
}: {
  layer: Layer
  active?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
  /** Smart Object 썸네일용 SmartDocument 조회자 */
  resolveSmart?: (id: string) => OpenDocument | undefined
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = BOX_W * dpr
    canvas.height = BOX_H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Shape Layer — Bitmap 대신 Vector 를 축소 렌더 (실시간 썸네일)
    if (layer.type === 'shape' && layer.shape) {
      const iw = layer.width || 1
      const ih = layer.height || 1
      const scale = Math.min((BOX_W * dpr) / iw, (BOX_H * dpr) / ih) * 0.86
      const w = iw * scale
      const h = ih * scale
      ctx.save()
      ctx.translate((BOX_W * dpr - w) / 2, (BOX_H * dpr - h) / 2)
      ctx.scale(scale, scale)
      try {
        drawShapeOnCanvas(ctx, layer.shape)
      } catch {
        /* noop */
      }
      ctx.restore()
      return
    }

    // Type Layer — Bitmap 대신 Text 를 축소 렌더 (실시간 썸네일)
    if (layer.type === 'text' && layer.text) {
      const iw = layer.width || 1
      const ih = layer.height || 1
      const scale = Math.min((BOX_W * dpr) / iw, (BOX_H * dpr) / ih) * 0.86
      ctx.save()
      ctx.translate((BOX_W * dpr - iw * scale) / 2, (BOX_H * dpr - ih * scale) / 2)
      ctx.scale(scale, scale)
      try {
        drawTextOnCanvas(ctx, layer.text)
      } catch {
        /* noop */
      }
      ctx.restore()
      return
    }

    // Smart Object — 참조 SmartDocument 합성 결과를 축소 렌더
    if (layer.type === 'smartObject' && layer.smartDocId && resolveSmart) {
      const sd = resolveSmart(layer.smartDocId)
      if (sd) {
        const src = getSmartComposite(sd, resolveSmart)
        const iw = src.width || 1
        const ih = src.height || 1
        const scale = Math.min((BOX_W * dpr) / iw, (BOX_H * dpr) / ih)
        const w = iw * scale
        const h = ih * scale
        try {
          ctx.drawImage(src, (BOX_W * dpr - w) / 2, (BOX_H * dpr - h) / 2, w, h)
        } catch {
          /* noop */
        }
      }
      return
    }

    if (!layer.bitmap) return

    const src = layer.bitmap as HTMLImageElement & HTMLCanvasElement
    const iw = src.naturalWidth || src.width || 0
    const ih = src.naturalHeight || src.height || 0
    if (!iw || !ih) return
    const scale = Math.min((BOX_W * dpr) / iw, (BOX_H * dpr) / ih)
    const w = iw * scale
    const h = ih * scale
    const x = (BOX_W * dpr - w) / 2
    const y = (BOX_H * dpr - h) / 2
    try {
      ctx.drawImage(src, x, y, w, h)
    } catch {
      /* 렌더 실패 무시 */
    }
  }, [
    layer.bitmap,
    layer.width,
    layer.height,
    layer.type,
    layer.shape ? shapeSignature(layer) : '',
    layer.text ? textSignature(layer) : '',
    layer.smartDocId,
    layer.smartDocId ? resolveSmart?.(layer.smartDocId)?.version ?? 0 : 0,
  ])

  const isSmart = layer.type === 'smartObject'
  return (
    <span
      className={`layer-thumb${active ? ' layer-thumb--active' : ''}${isSmart ? ' layer-thumb--smart' : ''}`}
      title={isSmart ? '고급 개체 (더블클릭하여 편집)' : '레이어 비트맵'}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={ref} style={{ width: BOX_W, height: BOX_H }} />
      {isSmart && <span className="layer-thumb__smart-badge" />}
    </span>
  )
}
