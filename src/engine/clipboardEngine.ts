// Clipboard Engine — 순수 픽셀 추출/삭제 로직 (Document/React 상태 없음).
// Copy/Cut/Copy Merged 가 Selection·Layer·Composite 에서 픽셀을 잘라내고,
// Cut/Clear/Delete 가 Selection 픽셀을 지운다. RenderEngine 은 건드리지 않는다.
import type { Layer, OpenDocument, Rect } from '../types'
import { boundsOf } from './selectionEngine'
import { buildSampleCanvas } from './cloneEngine'

export type Extracted = { canvas: HTMLCanvasElement; bounds: Rect }

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** 선택 마스크(doc 좌표)의 bounds 영역을 알파 캔버스로 (destination-in 용) */
function maskAlphaForBounds(mask: Uint8Array, docW: number, b: Rect): HTMLCanvasElement {
  const c = makeCanvas(b.width, b.height)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(c.width, c.height)
  for (let y = 0; y < c.height; y++) {
    const dy = b.y + y
    for (let x = 0; x < c.width; x++) {
      const dx = b.x + x
      const v = mask[dy * docW + dx]
      if (v) img.data[(y * c.width + x) * 4 + 3] = v
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Selection 내부 픽셀만 추출 (해당 소스 캔버스 = 레이어 비트맵 또는 합성). 회전 0 가정. */
function extractMasked(
  source: CanvasImageSource,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  mask: Uint8Array,
  docW: number,
  docH: number,
): Extracted | null {
  const b = boundsOf(mask, docW, docH)
  if (b.width <= 0 || b.height <= 0) return null
  const out = makeCanvas(b.width, b.height)
  const ctx = out.getContext('2d')!
  try {
    ctx.drawImage(source, srcX - b.x, srcY - b.y, srcW, srcH)
  } catch {
    return null
  }
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(maskAlphaForBounds(mask, docW, b), 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  return { canvas: out, bounds: b }
}

/** Active Layer 의 Selection 픽셀 추출 */
export function extractSelection(doc: OpenDocument, layer: Layer, mask: Uint8Array): Extracted | null {
  if (!layer.bitmap) return null
  const lw = Math.round(layer.width || doc.width)
  const lh = Math.round(layer.height || doc.height)
  return extractMasked(layer.bitmap, Math.round(layer.x), Math.round(layer.y), lw, lh, mask, doc.width, doc.height)
}

/** Active Layer 전체 픽셀 추출 (Selection 없음) */
export function extractLayer(layer: Layer): Extracted | null {
  if (!layer.bitmap) return null
  const lw = Math.round(layer.width || 0)
  const lh = Math.round(layer.height || 0)
  if (lw <= 0 || lh <= 0) return null
  const out = makeCanvas(lw, lh)
  try {
    out.getContext('2d')!.drawImage(layer.bitmap, 0, 0, lw, lh)
  } catch {
    return null
  }
  return { canvas: out, bounds: { x: Math.round(layer.x), y: Math.round(layer.y), width: lw, height: lh } }
}

/** Mask(Grayscale) 의 Selection/전체 추출 */
export function extractMask(doc: OpenDocument, layer: Layer, mask: Uint8Array | null): Extracted | null {
  if (!layer.mask) return null
  const mw = layer.mask.bitmap.width
  const mh = layer.mask.bitmap.height
  if (mask) {
    return extractMasked(layer.mask.bitmap, Math.round(layer.x), Math.round(layer.y), mw, mh, mask, doc.width, doc.height)
  }
  const out = makeCanvas(mw, mh)
  out.getContext('2d')!.drawImage(layer.mask.bitmap, 0, 0)
  return { canvas: out, bounds: { x: Math.round(layer.x), y: Math.round(layer.y), width: mw, height: mh } }
}

/** Copy Merged — 보이는 모든 레이어 합성. Selection 있으면 그 영역만. */
export function extractComposite(doc: OpenDocument, mask: Uint8Array | null): Extracted | null {
  const comp = buildSampleCanvas(doc, doc.activeLayerId, 'all')
  if (mask) {
    return extractMasked(comp, 0, 0, doc.width, doc.height, mask, doc.width, doc.height)
  }
  return { canvas: comp, bounds: { x: 0, y: 0, width: doc.width, height: doc.height } }
}

/** Selection 픽셀을 지운 새 레이어 비트맵 (Cut/Clear/Delete Selection). 회전 0 가정. */
export function eraseSelectionPixels(
  layer: Layer,
  mask: Uint8Array,
  docW: number,
  docH: number,
): HTMLCanvasElement | null {
  const lw = Math.round(layer.width || 0)
  const lh = Math.round(layer.height || 0)
  if (lw <= 0 || lh <= 0 || !layer.bitmap) return null
  const canvas = makeCanvas(lw, lh)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(layer.bitmap, 0, 0, lw, lh)

  // 선택 마스크(doc)를 레이어 로컬 알파로 옮겨 destination-out
  const sel = makeCanvas(lw, lh)
  const sctx = sel.getContext('2d')!
  const img = sctx.createImageData(lw, lh)
  const ox = Math.round(layer.x)
  const oy = Math.round(layer.y)
  for (let y = 0; y < lh; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= docH) continue
    for (let x = 0; x < lw; x++) {
      const dx = x + ox
      if (dx < 0 || dx >= docW) continue
      const v = mask[dy * docW + dx]
      if (v) img.data[(y * lw + x) * 4 + 3] = v
    }
  }
  sctx.putImageData(img, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(sel, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  return canvas
}
