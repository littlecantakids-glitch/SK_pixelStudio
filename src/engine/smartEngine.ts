// Smart Object Engine — SmartDocument 를 하나의 캔버스로 합성(비파괴)하고 version 으로 캐시한다.
// Smart Object 는 Bitmap 이 아니라 Document Reference 이다. Transform 은 RenderEngine 이 Render 시점에만
// 적용하고, 여기서는 SmartDocument 내부 Layer Stack 을 "원본 크기"로 합성한 결과만 만든다.
// 같은 SmartDocument 를 여러 Instance 가 공유하며, version 이 바뀌면 모든 Instance 가 갱신된다.
import type { Layer, OpenDocument } from '../types'
import { isMaskActive, maskAlphaCanvas } from './maskEngine'
import { applyAdjustmentLayer } from './adjustmentEngine'
import { drawShapeOnCanvas } from './shapeEngine'
import { getTextBitmap } from './textEngine'
import { BLEND_OP } from './blendModes'

export type ResolveSmart = (docId: string) => OpenDocument | undefined

const MAX_DEPTH = 8

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function applyRotation(ctx: CanvasRenderingContext2D, layer: Layer, lw: number, lh: number) {
  if (!layer.rotation) return
  const px = layer.pivotX ?? layer.x + lw / 2
  const py = layer.pivotY ?? layer.y + lh / 2
  ctx.translate(px, py)
  ctx.rotate((layer.rotation * Math.PI) / 180)
  ctx.translate(-px, -py)
}

/** 한 레이어를 문서 크기 캔버스에 렌더(마스크 포함, opacity/blend 제외) */
function renderLayer(
  doc: OpenDocument,
  layer: Layer,
  resolve: ResolveSmart,
  depth: number,
): HTMLCanvasElement | null {
  const w = doc.width
  const h = doc.height
  const lw = layer.width || w
  const lh = layer.height || h
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')
  if (!ctx) return null

  ctx.save()
  applyRotation(ctx, layer, lw, lh)
  try {
    if (layer.type === 'shape' && layer.shape) {
      ctx.translate(layer.x, layer.y)
      drawShapeOnCanvas(ctx, layer.shape)
    } else if (layer.type === 'text' && layer.text) {
      const b = getTextBitmap(layer.text)
      ctx.drawImage(b.canvas, layer.x + b.dx, layer.y + b.dy)
    } else if (layer.type === 'smartObject' && layer.smartDocId) {
      const sd = resolve(layer.smartDocId)
      if (sd && depth < MAX_DEPTH) {
        const inner = compositeDocument(sd, resolve, depth + 1)
        ctx.drawImage(inner, layer.x, layer.y, lw, lh)
      }
    } else if (layer.bitmap) {
      ctx.drawImage(layer.bitmap, layer.x, layer.y, lw, lh)
    }
  } catch {
    /* noop */
  }
  ctx.restore()

  if (isMaskActive(layer)) {
    ctx.save()
    applyRotation(ctx, layer, lw, lh)
    ctx.globalCompositeOperation = 'destination-in'
    try {
      ctx.drawImage(maskAlphaCanvas(layer.mask!, layer.maskDensity ?? 100, layer.maskFeather ?? 0), layer.x, layer.y, lw, lh)
    } catch {
      /* noop */
    }
    ctx.restore()
  }
  return c
}

function layerVisible(layer: Layer, byId: Map<string, Layer>): boolean {
  if (!layer.visible) return false
  if (layer.type === 'group') return false
  if (layer.parentId) {
    const parent = byId.get(layer.parentId)
    if (parent && !parent.visible) return false
  }
  return true
}

/** SmartDocument(또는 임의 Document) 를 원본 크기 캔버스로 합성 */
export function compositeDocument(doc: OpenDocument, resolve: ResolveSmart, depth = 0): HTMLCanvasElement {
  const c = makeCanvas(doc.width, doc.height)
  const ctx = c.getContext('2d')
  if (!ctx) return c
  // 배경
  if (doc.background && doc.background !== 'transparent' && doc.background !== 'image') {
    let color = '#ffffff'
    if (doc.background === 'black') color = '#000000'
    else if (doc.background.startsWith('#')) color = doc.background
    ctx.fillStyle = color
    ctx.fillRect(0, 0, c.width, c.height)
  }
  const byId = new Map(doc.layers.map((l) => [l.id, l]))
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i]
    if (!layerVisible(layer, byId)) continue
    if (layer.type === 'adjustment') {
      applyAdjustmentLayer(ctx, c.width, c.height, layer, BLEND_OP[layer.blendMode] ?? 'source-over')
      continue
    }
    const lc = renderLayer(doc, layer, resolve, depth)
    if (!lc) continue
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, (layer.opacity / 100) * (layer.fill / 100)))
    ctx.globalCompositeOperation = BLEND_OP[layer.blendMode] ?? 'source-over'
    ctx.drawImage(lc, 0, 0)
    ctx.restore()
  }
  return c
}

/** 중첩 Smart Object 까지 반영한 유효 버전 (Cache 키) */
export function effectiveVersion(doc: OpenDocument, resolve: ResolveSmart, depth = 0): number {
  let v = doc.version ?? 0
  if (depth >= MAX_DEPTH) return v
  for (const l of doc.layers) {
    if (l.type === 'smartObject' && l.smartDocId) {
      const sd = resolve(l.smartDocId)
      if (sd) v += effectiveVersion(sd, resolve, depth + 1) * 131
    }
  }
  return v
}

// ── Smart Cache (documentId + version) ─────────────────────────────
const cache = new Map<string, { ver: number; canvas: HTMLCanvasElement }>()

/** SmartDocument 합성 결과(캐시). version 이 같으면 재사용, 바뀌면 재생성 */
export function getSmartComposite(doc: OpenDocument, resolve: ResolveSmart): HTMLCanvasElement {
  const ver = effectiveVersion(doc, resolve)
  const hit = cache.get(doc.id)
  if (hit && hit.ver === ver) return hit.canvas
  const canvas = compositeDocument(doc, resolve)
  cache.set(doc.id, { ver, canvas })
  return canvas
}

export function invalidateSmartCache(docId?: string) {
  if (docId) cache.delete(docId)
  else cache.clear()
}

export function smartCacheSize(): number {
  return cache.size
}
