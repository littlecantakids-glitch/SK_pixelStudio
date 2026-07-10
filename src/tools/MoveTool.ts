// Move Tool 순수 로직 — Canvas/Viewport와 분리. layer.x / layer.y 만 변경한다.
import type { Layer } from '../types'

export function canMoveLayer(layer: Layer | null | undefined): boolean {
  return !!layer && layer.type !== 'background' && !layer.locked
}

/** Shift 드래그: 수평/수직 중 우세한 축으로만 이동 */
export function constrainAxis(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy }
}

/** 화면(스크린) 이동량을 캔버스 좌표 이동량으로 변환 (카메라 scale 반영) */
export function screenDeltaToCanvas(
  screenDx: number,
  screenDy: number,
  scale: number,
): { dx: number; dy: number } {
  const s = scale || 1
  return { dx: screenDx / s, dy: screenDy / s }
}

/** 캔버스 좌표(cx, cy)에서 최상단의 이동 가능/표시 레이어를 히트 테스트 (Auto Select) */
export function hitTestLayer(layers: Layer[], cx: number, cy: number): Layer | null {
  for (const layer of layers) {
    if (!layer.visible) continue
    if (layer.type === 'group') continue
    const w = layer.width || 0
    const h = layer.height || 0
    if (w <= 0 || h <= 0) continue
    if (cx >= layer.x && cx <= layer.x + w && cy >= layer.y && cy <= layer.y + h) {
      return layer
    }
  }
  return null
}
