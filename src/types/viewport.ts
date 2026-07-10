// Viewport(카메라) 좌표계. Canvas는 고정, 카메라만 이동/확대한다.
export type Viewport = {
  offsetX: number
  offsetY: number
  scale: number
  minScale: number
  maxScale: number
  isPanning: boolean
  lastMouseX: number
  lastMouseY: number
}

export const MIN_SCALE = 0.01 // 1%
export const MAX_SCALE = 32 // 3200%

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}
