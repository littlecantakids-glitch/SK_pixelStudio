// Layer Engine — React와 분리된 순수 레이어 로직.
// Canvas는 레이어를 직접 수정하지 않으며, 모든 편집은 이 엔진의 순수 함수로 처리한다.
import type { AdjustmentType, Layer } from '../types'
import { cloneLayerMask, createLayerMask, MASK_DEFAULTS } from './maskEngine'
import { ADJUSTMENT_LABELS, defaultSettings } from './adjustmentEngine'

let seq = 0
export function genId(prefix = 'layer'): string {
  seq += 1
  return `${prefix}-${Date.now()}-${seq}`
}

/** "레이어 N" 다음 번호 계산 */
export function nextLayerName(layers: Layer[]): string {
  let max = 0
  for (const l of layers) {
    const m = /^레이어 (\d+)$/.exec(l.name) ?? /^Layer (\d+)$/.exec(l.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `레이어 ${max + 1}`
}

export function createRasterLayer(name: string, width: number, height: number): Layer {
  return {
    id: genId(),
    name,
    type: 'raster',
    visible: true,
    locked: false,
    selected: true,
    opacity: 100,
    fill: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    ...MASK_DEFAULTS,
  }
}

/**
 * Adjustment Layer 생성 — Photoshop처럼 흰색(전체 적용) Layer Mask 를 함께 생성한다.
 * Bitmap 없음: RenderEngine 이 아래 합성 결과에 실시간 계산만 적용한다.
 */
export function createAdjustmentLayer(
  adjustment: AdjustmentType,
  layers: Layer[],
  width: number,
  height: number,
): Layer {
  const base = ADJUSTMENT_LABELS[adjustment]
  let max = 0
  for (const l of layers) {
    const m = new RegExp(`^${base} (\\d+)$`).exec(l.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return {
    id: genId('adj'),
    name: `${base} ${max + 1}`,
    type: 'adjustment',
    adjustment,
    adjustmentSettings: defaultSettings(adjustment),
    visible: true,
    locked: false,
    selected: true,
    opacity: 100,
    fill: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    ...MASK_DEFAULTS,
    mask: createLayerMask(width, height),
  }
}

export function createGroup(name: string): Layer {
  return {
    id: genId('group'),
    name,
    type: 'group',
    visible: true,
    locked: false,
    selected: true,
    opacity: 100,
    fill: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    ...MASK_DEFAULTS,
    children: [],
    collapsed: false,
  }
}

/** 비트맵을 독립 캔버스로 복제(Duplicate 시 Bitmap까지 복사) */
function cloneBitmap(src: CanvasImageSource): CanvasImageSource {
  const anySrc = src as HTMLImageElement & HTMLCanvasElement
  const w = anySrc.naturalWidth || anySrc.width || 0
  const h = anySrc.naturalHeight || anySrc.height || 0
  if (!w || !h) return src
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.drawImage(src, 0, 0)
  return canvas
}

export function duplicateLayer(layer: Layer): Layer {
  const isBg = layer.type === 'background'
  return {
    ...layer,
    id: genId(),
    name: `${layer.name} 복사`,
    // 배경 레이어의 복제본은 이동 가능한 일반 레이어가 된다 (Photoshop 동작)
    type: isBg ? 'image' : layer.type,
    locked: false,
    selected: true,
    bitmap: layer.bitmap ? cloneBitmap(layer.bitmap) : undefined,
    mask: layer.mask ? cloneLayerMask(layer.mask) : undefined,
    adjustmentSettings: layer.adjustmentSettings ? { ...layer.adjustmentSettings } : undefined,
  }
}

/** 배경 레이어는 항상 맨 아래(배열의 마지막)에 고정 */
export function pinBackground(layers: Layer[]): Layer[] {
  const bg = layers.filter((l) => l.type === 'background')
  const rest = layers.filter((l) => l.type !== 'background')
  return [...rest, ...bg]
}

/** from → to 로 순서 변경 (배열 인덱스, 0 = 최상단) */
export function reorder(layers: Layer[], from: number, to: number): Layer[] {
  const next = [...layers]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return pinBackground(next)
}

export function isBackground(layer: Layer | undefined): boolean {
  return layer?.type === 'background'
}
