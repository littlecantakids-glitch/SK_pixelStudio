// Clone Engine — Clone Stamp Tool 전용 순수 canvas 연산.
// Brush Engine 을 재사용하되(스탬프/스페이싱), 색상 대신 Source 위치의 픽셀을 복제한다.
// 핵심: Stroke 시작 시점의 Source Composite 를 Snapshot 해서 피드백(자기 참조 번짐)을 막는다.
import type { Layer, OpenDocument } from '../types'
import { isMaskActive, maskAlphaCanvas } from './maskEngine'
import { BLEND_OP } from './blendModes'

/** 샘플링 대상 범위 — Photoshop "샘플" 드롭다운 */
export type SampleMode = 'current' | 'currentBelow' | 'all'

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

/** 회전 없는 레이어 비트맵 로컬 좌표(문서 좌표 → 레이어 픽셀). Clone 은 doc/layer 축이 일치해야 정확. */
export function docToBitmapLocal(
  docX: number,
  docY: number,
  layer: { x: number; y: number },
): { x: number; y: number } {
  return { x: docX - layer.x, y: docY - layer.y }
}

/** 한 레이어(비트맵+마스크)를 대상 ctx 에 합성 (opacity/fill/blend 반영) */
function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, docW: number, docH: number) {
  if (!layer.bitmap) return
  const lw = layer.width || docW
  const lh = layer.height || docH
  // 마스크가 있으면 (Bitmap Alpha × Mask Gray) 를 임시 캔버스에서 계산 후 합성
  const maskOn = isMaskActive(layer)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, (layer.opacity / 100) * (layer.fill / 100)))
  ctx.globalCompositeOperation = BLEND_OP[layer.blendMode] ?? 'source-over'
  try {
    if (maskOn) {
      const tmp = makeCanvas(docW, docH)
      const tctx = tmp.getContext('2d')!
      tctx.drawImage(layer.bitmap, layer.x, layer.y, lw, lh)
      tctx.globalCompositeOperation = 'destination-in'
      tctx.drawImage(
        maskAlphaCanvas(layer.mask!, layer.maskDensity ?? 100, layer.maskFeather ?? 0),
        layer.x,
        layer.y,
        lw,
        lh,
      )
      ctx.drawImage(tmp, 0, 0)
    } else {
      ctx.drawImage(layer.bitmap, layer.x, layer.y, lw, lh)
    }
  } catch {
    /* noop */
  }
  ctx.restore()
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

/**
 * Sample Mode 에 맞는 Source Composite 를 문서 크기 캔버스로 Snapshot 한다.
 * - current: Active Layer 픽셀만 (투명 배경)
 * - currentBelow: Active Layer 이하 + 문서 배경 합성
 * - all: 보이는 모든 Layer + 문서 배경 합성
 * 배열 index 0 = 최상단이므로 아래(마지막)부터 합성한다.
 */
export function buildSampleCanvas(
  doc: OpenDocument,
  activeLayerId: string,
  mode: SampleMode,
): HTMLCanvasElement {
  const w = doc.width
  const h = doc.height
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  const byId = new Map(doc.layers.map((l) => [l.id, l]))
  const activeIdx = doc.layers.findIndex((l) => l.id === activeLayerId)

  if (mode === 'current') {
    const layer = doc.layers[activeIdx]
    if (layer && layer.bitmap) {
      // 단일 레이어 샘플은 blend/opacity 무시하고 실제 픽셀만 (마스크는 반영)
      const lw = layer.width || w
      const lh = layer.height || h
      const maskOn = isMaskActive(layer)
      try {
        ctx.drawImage(layer.bitmap, layer.x, layer.y, lw, lh)
        if (maskOn) {
          ctx.globalCompositeOperation = 'destination-in'
          ctx.drawImage(
            maskAlphaCanvas(layer.mask!, layer.maskDensity ?? 100, layer.maskFeather ?? 0),
            layer.x,
            layer.y,
            lw,
            lh,
          )
          ctx.globalCompositeOperation = 'source-over'
        }
      } catch {
        /* noop */
      }
    }
    return canvas
  }

  // currentBelow / all — 보이는 합성 결과를 샘플하므로 문서 배경도 채운다
  const fillBg = doc.background !== 'transparent' && doc.background !== 'image'
  if (fillBg) {
    let color = '#ffffff'
    if (doc.background === 'black') color = '#000000'
    else if (doc.background?.startsWith('#')) color = doc.background
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
  }

  for (let i = doc.layers.length - 1; i >= 0; i--) {
    if (mode === 'currentBelow' && i < activeIdx) continue // Active 위 레이어 제외
    const layer = doc.layers[i]
    if (!layerVisible(layer, byId)) continue
    if (layer.type === 'adjustment') continue // 샘플 단순화 — 보정 레이어는 건너뜀
    drawLayer(ctx, layer, w, h)
  }
  return canvas
}
