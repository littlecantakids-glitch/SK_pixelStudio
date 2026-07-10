import type { Layer, OpenDocument } from '../../types'
import { SUPPORTS_TRANSPARENCY, type SaveOptions } from '../../types/save'
import { isMaskActive, maskAlphaCanvas } from '../../engine/maskEngine'
import { applyAdjustmentLayer } from '../../engine/adjustmentEngine'
import { BLEND_OP } from '../../engine/blendModes'

/** 배경색으로 채운다. */
function fillBackground(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  background: string,
) {
  let color = '#ffffff'
  if (background === 'black') color = '#000000'
  else if (background === 'transparent' || background === 'image') color = '#ffffff'
  else if (background?.startsWith('#')) color = background
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

/** 그룹 가시성까지 고려한 실제 렌더 여부 */
function isRenderable(layer: Layer, byId: Map<string, Layer>): boolean {
  if (!layer.visible) return false
  if (layer.type === 'group') return false // 그룹 자체는 비트맵 없음
  if (layer.parentId) {
    const parent = byId.get(layer.parentId)
    if (parent && !parent.visible) return false
  }
  return true
}

/**
 * Layer Stack을 순서대로 합성한다.
 * 배열 index 0 = 최상단이므로, 아래(마지막)부터 그린다.
 * fillBg=true면 먼저 배경색을 채운다(투명 미유지 시).
 */
function drawLayers(
  canvas: HTMLCanvasElement,
  doc: OpenDocument,
  fillBg: boolean,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D 컨텍스트를 생성할 수 없습니다.')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (fillBg) fillBackground(ctx, canvas, doc.background)

  const byId = new Map(doc.layers.map((l) => [l.id, l]))
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i]
    if (!isRenderable(layer, byId)) continue
    if (layer.type === 'adjustment') {
      // Adjustment 는 아래 합성 결과에 실시간 계산만 적용 (Bitmap 수정 없음)
      applyAdjustmentLayer(
        ctx,
        canvas.width,
        canvas.height,
        layer,
        BLEND_OP[layer.blendMode] ?? 'source-over',
      )
      continue
    }
    if (!layer.bitmap) continue
    const w = layer.width || canvas.width
    const h = layer.height || canvas.height

    // Layer Bitmap → Layer Mask 를 임시 캔버스에서 합성 (Bitmap Alpha × Mask Gray)
    let source: CanvasImageSource = layer.bitmap
    if (isMaskActive(layer)) {
      const masked = document.createElement('canvas')
      masked.width = Math.max(1, Math.round(w))
      masked.height = Math.max(1, Math.round(h))
      const mctx = masked.getContext('2d')
      if (mctx) {
        try {
          mctx.drawImage(layer.bitmap, 0, 0, masked.width, masked.height)
          mctx.globalCompositeOperation = 'destination-in'
          mctx.drawImage(
            maskAlphaCanvas(layer.mask!, layer.maskDensity ?? 100, layer.maskFeather ?? 0),
            0,
            0,
            masked.width,
            masked.height,
          )
        } catch {
          /* 렌더 실패 무시 */
        }
        source = masked
      }
    }

    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, (layer.opacity / 100) * (layer.fill / 100)))
    ctx.globalCompositeOperation = BLEND_OP[layer.blendMode] ?? 'source-over'
    // 회전 변형(pivot 기준). bitmap은 굽지 않고 draw 시 스케일/회전만 적용.
    if (layer.rotation) {
      const px = layer.pivotX ?? layer.x + w / 2
      const py = layer.pivotY ?? layer.y + h / 2
      ctx.translate(px, py)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      ctx.translate(-px, -py)
    }
    try {
      ctx.drawImage(source, layer.x, layer.y, w, h)
    } catch {
      /* 렌더 실패 무시 */
    }
    ctx.restore()
  }
}

/** 화면용 합성 (투명 배경 유지) */
export function compositeLayers(canvas: HTMLCanvasElement, doc: OpenDocument) {
  const fillBg = doc.background !== 'transparent' && doc.background !== 'image'
  drawLayers(canvas, doc, fillBg)
}

/** 내보내기용 합성 (포맷별 투명 처리 규칙 적용) */
export function renderVisibleLayers(
  canvas: HTMLCanvasElement,
  doc: OpenDocument,
  options: SaveOptions,
) {
  const keepTransparent =
    SUPPORTS_TRANSPARENCY[options.format] &&
    (doc.background === 'transparent' || options.transparency)
  drawLayers(canvas, doc, !keepTransparent)
}
