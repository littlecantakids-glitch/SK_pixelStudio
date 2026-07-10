// Free Transform 순수 수학 엔진 — Viewport/Layer와 분리. bitmap은 굽지 않고 metadata만 계산.
import type { Layer } from '../types'

export type Box = { cx: number; cy: number; hw: number; hh: number; rot: number } // rot: 도

export type Handle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'

const HANDLE_DIR: Record<Handle, { x: number; y: number }> = {
  'top-left': { x: -1, y: -1 },
  top: { x: 0, y: -1 },
  'top-right': { x: 1, y: -1 },
  right: { x: 1, y: 0 },
  'bottom-right': { x: 1, y: 1 },
  bottom: { x: 0, y: 1 },
  'bottom-left': { x: -1, y: 1 },
  left: { x: -1, y: 0 },
}

const deg2rad = (d: number) => (d * Math.PI) / 180

export function rotateVec(x: number, y: number, deg: number) {
  const r = deg2rad(deg)
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: x * c - y * s, y: x * s + y * c }
}

export function rotatePoint(px: number, py: number, cx: number, cy: number, deg: number) {
  const v = rotateVec(px - cx, py - cy, deg)
  return { x: cx + v.x, y: cy + v.y }
}

/** 여러 레이어의 공통 축정렬 바운딩 박스 */
export function commonBox(layers: Layer[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const l of layers) {
    const w = l.width || 0
    const h = l.height || 0
    minX = Math.min(minX, l.x)
    minY = Math.min(minY, l.y)
    maxX = Math.max(maxX, l.x + w)
    maxY = Math.max(maxY, l.y + h)
  }
  if (!isFinite(minX)) return { cx: 0, cy: 0, hw: 0, hh: 0, rot: 0 }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    hw: (maxX - minX) / 2,
    hh: (maxY - minY) / 2,
    rot: 0,
  }
}

export function boxRect(box: Box) {
  return { x: box.cx - box.hw, y: box.cy - box.hh, width: box.hw * 2, height: box.hh * 2 }
}

/** 핸들 드래그로 크기 조절. mouse는 캔버스 좌표. */
export function scaleBox(
  box0: Box,
  handle: Handle,
  mouseX: number,
  mouseY: number,
  opts: { keepAspect: boolean; fromCenter: boolean },
): Box {
  const dir = HANDLE_DIR[handle]
  const isCorner = dir.x !== 0 && dir.y !== 0

  // 앵커(고정점) 로컬 좌표
  const anchorLocal = opts.fromCenter
    ? { x: 0, y: 0 }
    : { x: -dir.x * box0.hw, y: -dir.y * box0.hh }
  const anchorWorldV = rotateVec(anchorLocal.x, anchorLocal.y, box0.rot)
  const anchorWorld = { x: box0.cx + anchorWorldV.x, y: box0.cy + anchorWorldV.y }

  // 마우스를 앵커 기준 로컬 벡터로 변환
  const rel = rotateVec(mouseX - anchorWorld.x, mouseY - anchorWorld.y, -box0.rot)

  let fullW = box0.hw * 2
  let fullH = box0.hh * 2
  if (dir.x !== 0) fullW = opts.fromCenter ? Math.abs(rel.x) * 2 : Math.abs(rel.x)
  if (dir.y !== 0) fullH = opts.fromCenter ? Math.abs(rel.y) * 2 : Math.abs(rel.y)

  // 비율 유지
  if (opts.keepAspect) {
    const sW = fullW / (box0.hw * 2)
    const sH = fullH / (box0.hh * 2)
    let s: number
    if (isCorner) s = Math.max(sW, sH)
    else if (dir.x !== 0) s = sW
    else s = sH
    fullW = box0.hw * 2 * s
    fullH = box0.hh * 2 * s
  }

  fullW = Math.max(1, fullW)
  fullH = Math.max(1, fullH)

  const newHw = fullW / 2
  const newHh = fullH / 2

  // 새 중심 = 앵커 + dir 방향으로 half 만큼 (fromCenter면 중심 고정)
  let cx = box0.cx
  let cy = box0.cy
  if (!opts.fromCenter) {
    const offLocal = { x: dir.x * newHw, y: dir.y * newHh }
    const offWorld = rotateVec(offLocal.x, offLocal.y, box0.rot)
    cx = anchorWorld.x + offWorld.x
    cy = anchorWorld.y + offWorld.y
  }

  return { cx, cy, hw: newHw, hh: newHh, rot: box0.rot }
}

/** 회전. pivot 기준으로 각도 변경(+중심 궤도). */
export function rotateBox(
  box0: Box,
  startX: number,
  startY: number,
  curX: number,
  curY: number,
  pivotX: number,
  pivotY: number,
  snap: boolean,
): Box {
  const a0 = Math.atan2(startY - pivotY, startX - pivotX)
  const a1 = Math.atan2(curY - pivotY, curX - pivotX)
  let deltaDeg = ((a1 - a0) * 180) / Math.PI
  let newRot = box0.rot + deltaDeg
  if (snap) newRot = Math.round(newRot / 15) * 15
  deltaDeg = newRot - box0.rot
  const c = rotatePoint(box0.cx, box0.cy, pivotX, pivotY, deltaDeg)
  return { cx: c.x, cy: c.y, hw: box0.hw, hh: box0.hh, rot: newRot }
}

/**
 * 원본 레이어들을 box0(시작 공통박스, rot=0) → box1(현재)로 매핑.
 * 항상 원본 기준으로 재계산하므로 누적 오차/중복 회전이 없다.
 */
export function applyBoxToLayers(
  original: Layer[],
  targetIds: Set<string>,
  box0: Box,
  box1: Box,
): Layer[] {
  // 중심 기준 스케일 계수 (box0.rot 은 항상 0)
  const sx = box1.hw / (box0.hw || 1)
  const sy = box1.hh / (box0.hh || 1)
  return original.map((l) => {
    if (!targetIds.has(l.id)) return l
    const ocx = l.x + l.width / 2
    const ocy = l.y + l.height / 2
    // box0 중심 기준 오프셋을 스케일 후, box1 회전만큼 회전 (그룹 스케일+회전 정확)
    const offX = (ocx - box0.cx) * sx
    const offY = (ocy - box0.cy) * sy
    const rot = rotateVec(offX, offY, box1.rot)
    const fcx = box1.cx + rot.x
    const fcy = box1.cy + rot.y
    const newW = Math.max(1, l.width * sx)
    const newH = Math.max(1, l.height * sy)
    return {
      ...l,
      x: fcx - newW / 2,
      y: fcy - newH / 2,
      width: newW,
      height: newH,
      rotation: l.rotation + box1.rot,
      // 각 레이어는 자신의 (회전된) 중심을 pivot 으로 회전 → 그룹 회전과 동일
      pivotX: fcx,
      pivotY: fcy,
      scaleX: (l.scaleX ?? 1) * sx,
      scaleY: (l.scaleY ?? 1) * sy,
    }
  })
}
