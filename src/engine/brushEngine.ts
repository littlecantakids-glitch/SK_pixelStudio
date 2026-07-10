// Brush Engine — 재사용 가능한 스탬프 기반 페인팅 로직 (순수 canvas 연산).
// Eraser / Clone Stamp / Healing / Mask Paint 가 composite/색상만 바꿔 재사용한다.

export type BrushOptions = {
  size: number
  hardness: number // 0~100
  flow: number // 0~100 (한 dab의 불투명도)
  color: string // #rrggbb
  /** 'source-over' = 그리기, 'destination-out' = 지우기(Eraser) */
  composite: GlobalCompositeOperation
  /** 펜 태블릿 필압 0~1 (마우스 = 1). flow 에 곱해진다. */
  pressure?: number
}

export type Point = { x: number; y: number }

/**
 * Brush Mode → Canvas 합성 연산. 스트로크 버퍼를 레이어(base) 위에 그릴 때 적용한다.
 * Brush / Eraser / Clone Stamp 가 동일하게 재사용한다 (Photoshop Blend 함수와 매핑).
 */
export const BRUSH_MODE_OP: Record<
  'normal' | 'multiply' | 'screen' | 'overlay' | 'softlight' | 'hardlight' | 'darken' | 'lighten' | 'erase',
  GlobalCompositeOperation
> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  softlight: 'soft-light',
  hardlight: 'hard-light',
  darken: 'darken',
  lighten: 'lighten',
  erase: 'destination-out',
}

/** Bilinear/High-Quality 리샘플링 활성화 — 회전/확대 상태의 계단 현상 최소화 */
export function enableHQSampling(ctx: CanvasRenderingContext2D) {
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v =
    h.length === 3
      ? h.split('').map((c) => c + c).join('')
      : h.padEnd(6, '0').slice(0, 6)
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

/** 한 개의 브러시 dab(원형 스탬프)을 찍는다. hardness 로 가장자리 부드러움 제어. */
export function stampDab(ctx: CanvasRenderingContext2D, x: number, y: number, o: BrushOptions) {
  const r = o.size / 2
  if (r < 0.35) return
  const [red, g, b] = hexToRgb(o.color)
  const a = Math.max(0, Math.min(1, (o.flow / 100) * (o.pressure ?? 1)))
  ctx.save()
  ctx.globalCompositeOperation = o.composite
  if (o.hardness >= 100 || r < 1.2) {
    // 완전 하드 엣지
    ctx.fillStyle = `rgba(${red},${g},${b},${a})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const inner = Math.max(0, Math.min(0.98, o.hardness / 100))
    const grad = ctx.createRadialGradient(x, y, r * inner, x, y, r)
    grad.addColorStop(0, `rgba(${red},${g},${b},${a})`)
    grad.addColorStop(1, `rgba(${red},${g},${b},0)`)
    // 안쪽 solid 부분
    ctx.fillStyle = `rgba(${red},${g},${b},${a})`
    ctx.beginPath()
    ctx.arc(x, y, r * inner, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** spacing(브러시 크기 대비 비율) 간격으로 from→to 구간을 dab 으로 채운다. */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  o: BrushOptions,
  spacingRatio = 0.15,
) {
  const spacing = Math.max(1, o.size * spacingRatio)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.round(dist / spacing))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    stampDab(ctx, from.x + dx * t, from.y + dy * t, o)
  }
}

/** doc(캔버스) 좌표 → 레이어 로컬(비트맵) 좌표. 회전/피벗 역변환 포함. */
export function docToLayerLocal(
  docX: number,
  docY: number,
  layer: { x: number; y: number; width: number; height: number; rotation: number; pivotX?: number; pivotY?: number },
): Point {
  const rot = layer.rotation || 0
  const px = layer.pivotX ?? layer.x + layer.width / 2
  const py = layer.pivotY ?? layer.y + layer.height / 2
  const rad = (-rot * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const vx = docX - px
  const vy = docY - py
  const rx = px + (vx * cos - vy * sin)
  const ry = py + (vx * sin + vy * cos)
  return { x: rx - layer.x, y: ry - layer.y }
}
