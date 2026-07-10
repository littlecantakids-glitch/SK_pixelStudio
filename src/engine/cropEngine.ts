// Crop Engine — Crop/Straighten Commit 시 레이어 변환 계산 (순수 로직).
// 비파괴(기본): 레이어 위치/회전만 조정하고 Bitmap 은 유지 (RenderEngine 이 캔버스 경계에서 클립).
// 파괴적(Delete Cropped Pixels): Bitmap 레이어를 새 문서 크기로 구워 바깥 픽셀을 삭제한다.
import type { Layer, Rect } from '../types'

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** 변환이 적용된 bitmap 레이어를 새 문서 크기(nw×nh) 캔버스로 굽는다 (crop + rotation 반영) */
function bakeLayer(layer: Layer, nw: number, nh: number): HTMLCanvasElement | undefined {
  if (!layer.bitmap) return undefined
  const c = makeCanvas(nw, nh)
  const ctx = c.getContext('2d')
  if (!ctx) return undefined
  const lw = layer.width || nw
  const lh = layer.height || nh
  ctx.save()
  if (layer.rotation) {
    const px = layer.pivotX ?? layer.x + lw / 2
    const py = layer.pivotY ?? layer.y + lh / 2
    ctx.translate(px, py)
    ctx.rotate((layer.rotation * Math.PI) / 180)
    ctx.translate(-px, -py)
  }
  try {
    ctx.drawImage(layer.bitmap, layer.x, layer.y, lw, lh)
  } catch {
    /* noop */
  }
  ctx.restore()
  return c
}

const BAKEABLE = new Set<Layer['type']>(['raster', 'image', 'background'])

/**
 * Crop/Straighten 결과 레이어 계산.
 * box: 문서 좌표 Crop 영역, angle: 이미지에 적용할 회전(도), deleteCropped: 바깥 픽셀 삭제 여부.
 */
export function buildCroppedLayers(
  layers: Layer[],
  box: Rect,
  angle: number,
  deleteCropped: boolean,
): Layer[] {
  const nw = Math.max(1, Math.round(box.width))
  const nh = Math.max(1, Math.round(box.height))
  return layers.map((l) => {
    // Crop 원점 이동 + (회전이 있으면) 새 문서 중심 기준 회전
    const base: Layer = {
      ...l,
      x: l.x - box.x,
      y: l.y - box.y,
      rotation: angle ? (l.rotation || 0) + angle : l.rotation,
      pivotX: angle ? nw / 2 : l.pivotX != null ? l.pivotX - box.x : undefined,
      pivotY: angle ? nh / 2 : l.pivotY != null ? l.pivotY - box.y : undefined,
    }
    if (deleteCropped && l.bitmap && BAKEABLE.has(l.type)) {
      const baked = bakeLayer(base, nw, nh)
      if (baked) {
        return {
          ...base,
          bitmap: baked,
          x: 0,
          y: 0,
          width: nw,
          height: nh,
          rotation: 0,
          pivotX: undefined,
          pivotY: undefined,
          type: l.type === 'background' ? 'raster' : l.type,
        }
      }
    }
    return base
  })
}

/** Straighten 두 점 → 수평이 되도록 이미지에 적용할 회전각(도) */
export function straightenAngle(ax: number, ay: number, bx: number, by: number): number {
  const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
  // 드래그 선이 수평이 되도록 이미지를 -deg 회전
  return -deg
}
