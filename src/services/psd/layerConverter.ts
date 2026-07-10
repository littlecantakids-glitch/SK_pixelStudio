// Layer Converter — Parser 결과(PSDLayerImage, bottom→top)를 편집기 Layer Stack 으로 변환한다.
// Parser(순수 데이터)와 Editor(Layer/Document)를 잇는 유일한 어댑터 모듈.
//
// - 순서: PSD 레코드는 최하단→최상단, 편집기 배열은 index 0 = 최상단 →
//   Group Tree 를 만든 뒤 위에서부터 직렬화한다 (단순 reverse 아님).
// - 그룹: Section Divider(lsct) 타입 3 = 그룹 시작(bottom), 1/2 = 그룹 헤더(top).
//   Stack 으로 중첩 구조를 복원하고, 닫힌 그룹(2)은 collapsed 로 가져온다.
// - 지원하지 않는 타입(Text/Shape/SO/Adjustment/Fill)은 픽셀이 있으면 Raster
//   Fallback, 없으면 Unsupported Placeholder 로 안전하게 가져온다.
import type { Layer } from '../../types'
import { MASK_DEFAULTS } from '../../engine/maskEngine'
import { convertBlendKey, isPassThrough } from './blendModeConverter'
import type { PSDFile, PSDLayerImage, PSDLayerKind } from './types'

export type ConvertResult = {
  /** 편집기 순서 (index 0 = 최상단). 빈 배열이면 레이어 없음 → Composite 사용 */
  layers: Layer[]
  activeLayerId: string | null
  warnings: string[]
}

const KIND_LABELS: Record<PSDLayerKind, string> = {
  raster: '래스터',
  text: '텍스트',
  shape: '모양',
  smartObject: '고급 개체',
  adjustment: '조정',
  fill: '칠',
}

type TreeNode =
  | { kind: 'layer'; img: PSDLayerImage }
  | { kind: 'group'; header: PSDLayerImage; children: TreeNode[] }

/** Composite Crop Fallback 에 필요한 문서 컨텍스트 */
type ConvertContext = {
  composite: HTMLCanvasElement
  docWidth: number
  docHeight: number
}

/**
 * Smart Object 변형이 identity(변형 없음)인지 — quad 4모서리가 Layer Bounds
 * 사각형(좌상→우상→우하→좌하)과 0.5px 이내로 일치하면 identity.
 * quad 가 다르면 Scale/Rotate/Perspective 가 적용된 것 — 이때 채널 픽셀은
 * 원본(미변형) 비트맵일 수 있으므로 그대로 배치하면 Photoshop 과 다르게 보인다.
 */
function isIdentityTransform(
  t: NonNullable<PSDLayerImage['record']['smartTransform']>,
  rec: PSDLayerImage['record'],
): boolean {
  if (t.warped) return false
  if (!t.quad) return true // quad 없이 warp 만 검사된 경우 — 변형 정보 없음
  const q = t.quad
  const eps = 0.51
  const near = (a: number, b: number) => Math.abs(a - b) <= eps
  return (
    near(q[0], rec.left) && near(q[1], rec.top) &&
    near(q[2], rec.right) && near(q[3], rec.top) &&
    near(q[4], rec.right) && near(q[5], rec.bottom) &&
    near(q[6], rec.left) && near(q[7], rec.bottom)
  )
}

/**
 * 자체 픽셀이 없는 레이어의 최후 수단 — Composite Image 에서 Layer Bounds
 * 영역을 잘라 Bounds 크기 캔버스로 만든다. "편집은 못해도 보이게".
 * 숨김 레이어는 Composite 에 반영되어 있지 않으므로(다른 내용이 찍힘) 잘라내지 않는다.
 */
function cropCompositeFallback(
  rec: PSDLayerImage['record'],
  ctx: ConvertContext,
): HTMLCanvasElement | null {
  if (!rec.visible || rec.width <= 0 || rec.height <= 0) return null
  // 문서와의 교차 영역만 유효
  const x0 = Math.max(rec.left, 0)
  const y0 = Math.max(rec.top, 0)
  const x1 = Math.min(rec.right, ctx.docWidth)
  const y1 = Math.min(rec.bottom, ctx.docHeight)
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = rec.width
  canvas.height = rec.height
  const c2d = canvas.getContext('2d')
  if (!c2d) return null
  // 문서 밖으로 나간 부분은 투명으로 남기고, 교차 영역만 Bounds 로컬 좌표에 배치
  c2d.drawImage(ctx.composite, x0, y0, w, h, x0 - rec.left, y0 - rec.top, w, h)
  return canvas
}

let importSeq = 0

/**
 * PSD 레코드 순서(bottom→top)와 편집기 렌더 순서(index 0 = top)를 매핑하는 변환기.
 * Group Tree 복원 → 위에서부터 직렬화 → Background 판별 → Active Layer 선정.
 */
export function normalizePsdLayerOrder(psd: PSDFile): ConvertResult {
  const warnings: string[] = []
  const source = psd.layerMaskInfo.layers
  if (source.length === 0) return { layers: [], activeLayerId: null, warnings }

  importSeq += 1
  const idPrefix = `psd${importSeq.toString(36)}-${Date.now().toString(36)}`

  // 픽셀 없는 레이어의 Composite Crop Fallback 용 컨텍스트
  const ctx: ConvertContext = {
    composite: psd.composite.canvas,
    docWidth: psd.header.width,
    docHeight: psd.header.height,
  }

  // ── 1) Group Tree 복원 (bottom→top 순회, Stack 기반) ──
  const rootChildren: TreeNode[] = []
  const stack: TreeNode[][] = [rootChildren]

  for (const img of source) {
    const st = img.record.sectionType
    if (st === 3) {
      // 그룹 경계(bottom) — 새 그룹 열기
      stack.push([])
    } else if (st === 1 || st === 2) {
      // 그룹 헤더(top) — 스택에서 자식 목록을 닫는다
      if (stack.length > 1) {
        const children = stack.pop()!
        stack[stack.length - 1].push({ kind: 'group', header: img, children })
      } else {
        // 경계 없는 헤더 — 잘못된 그룹 구조. 빈 그룹으로 복구
        warnings.push(`"${img.record.name}": 그룹 경계가 없어 빈 그룹으로 가져왔습니다`)
        stack[0].push({ kind: 'group', header: img, children: [] })
      }
    } else {
      stack[stack.length - 1].push({ kind: 'layer', img })
    }
  }

  // 닫히지 않은 그룹 — 내용물을 상위로 승격 (잘못된 그룹 구조 복구)
  while (stack.length > 1) {
    const orphan = stack.pop()!
    warnings.push('닫히지 않은 그룹 구조를 발견해 상위로 병합했습니다')
    stack[stack.length - 1].push(...orphan)
  }

  // ── 2) Tree → 편집기 배열 직렬화 (최상단부터, 그룹 행 다음에 자식) ──
  const layers: Layer[] = []
  let seq = 0
  const nextId = () => `${idPrefix}-${++seq}`

  const emit = (nodes: TreeNode[], parentId: string | undefined) => {
    // nodes 는 bottom→top — 편집기는 top 부터 기록
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      if (node.kind === 'layer') {
        layers.push(convertRasterLayer(node.img, nextId(), parentId, warnings, ctx))
      } else {
        const group = convertGroupLayer(node.header, nextId(), parentId, warnings)
        layers.push(group)
        const before = layers.length
        emit(node.children, group.id)
        group.children = layers.slice(before).filter((l) => l.parentId === group.id).map((l) => l.id)
      }
    }
  }
  emit(rootChildren, undefined)

  // ── 3) Background 판별 — 확신할 수 있을 때만 background 로 복원 ──
  detectBackground(layers, psd)

  // ── 4) Active Layer — 최상단의 보이는 편집 가능 레이어 하나만 선택 ──
  const active =
    layers.find((l) => l.visible && !l.locked && l.type !== 'group' && !l.unsupported) ??
    layers.find((l) => l.type !== 'group') ??
    layers[0]
  for (const l of layers) l.selected = l.id === active?.id

  return { layers, activeLayerId: active?.id ?? null, warnings }
}

/* ============================================================
   개별 변환
   ============================================================ */

function baseLayer(id: string, name: string): Layer {
  return {
    id,
    name,
    type: 'raster',
    visible: true,
    locked: false,
    selected: false,
    opacity: 100,
    fill: 100,
    blendMode: 'normal',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    ...MASK_DEFAULTS,
  }
}

function convertRasterLayer(
  img: PSDLayerImage,
  id: string,
  parentId: string | undefined,
  warnings: string[],
  ctx: ConvertContext,
): Layer {
  const rec = img.record
  const blend = convertBlendKey(rec.blendKey, rec.name)
  if (blend.warning) warnings.push(blend.warning)

  const layer = baseLayer(id, rec.name)
  layer.parentId = parentId
  layer.visible = rec.visible
  layer.locked = rec.lock.all
  layer.lockTransparent = rec.lock.transparency
  layer.opacity = Math.round((rec.opacity / 255) * 1000) / 10 // 소수 1자리 유지
  layer.blendMode = blend.mode
  layer.x = rec.left
  layer.y = rec.top
  layer.width = rec.width
  layer.height = rec.height
  layer.clipped = rec.clipping
  layer.psdMeta = {
    blendKey: rec.blendKey,
    infoKeys: rec.infoKeys,
    lockTransparency: rec.lock.transparency,
    lockPixels: rec.lock.composite,
    lockPosition: rec.lock.position,
    ...(rec.smartTransform?.quad ? { transformQuad: rec.smartTransform.quad } : {}),
    ...(rec.smartTransform?.warped ? { warped: true } : {}),
  }

  // Smart Object / Placed Layer 에 Scale·Rotate·Perspective·Warp 변형이 있으면
  // 채널 픽셀이 원본(미변형) 비트맵일 수 있다 — 그대로 배치하면 Photoshop 화면과
  // 다르게 보이므로(사다리꼴 왜곡), Photoshop 이 저장한 화면 결과(Composite Pixel)를
  // 우선한다. Transform 재계산/재변형은 하지 않는다.
  const transformed =
    rec.smartTransform !== null && !isIdentityTransform(rec.smartTransform, rec)

  if (transformed) {
    const crop = cropCompositeFallback(rec, ctx)
    if (crop) {
      layer.bitmap = crop
      layer.blendMode = 'normal'
      layer.opacity = 100
      layer.unsupported = {
        originalType: KIND_LABELS[rec.kind],
        reason:
          '변형(Transform/Warp)이 적용된 레이어 — Photoshop 화면 결과(합성 이미지)로 가져왔습니다',
      }
      warnings.push(
        `"${rec.name}": 변형된 ${KIND_LABELS[rec.kind]} 레이어를 합성 이미지 픽셀로 가져왔습니다`,
      )
      return layer
    }
    // Crop 불가(숨김 등)면 아래의 채널 픽셀 경로로 진행 (숨김이라 화면 영향 없음)
  }

  if (img.canvas) {
    // 1순위 — Layer 자체 픽셀 (Text/Shape/SO/Fill 포함): Raster 로 그대로 가져온다
    layer.bitmap = img.canvas
    if (rec.kind !== 'raster') {
      layer.unsupported = {
        originalType: KIND_LABELS[rec.kind],
        reason: '래스터 이미지로 가져왔습니다 (원본 타입 편집은 후속 지원)',
      }
      warnings.push(
        `"${rec.name}": ${KIND_LABELS[rec.kind]} 레이어를 래스터로 가져왔습니다`,
      )
    }
    return layer
  }

  // 2순위 — 자체 픽셀은 없지만(디코딩 실패/채널 없음) Composite 에는 보이는 레이어:
  // Composite 에서 Bounds 영역을 잘라 Raster 로 가져온다. "편집은 못해도 보이게".
  const crop = cropCompositeFallback(rec, ctx)
  if (crop) {
    layer.bitmap = crop
    // Composite 조각에는 혼합/불투명도가 이미 구워져 있다 — 다시 적용하면 이중 적용이라
    // 렌더는 표준/100% 로 고정한다 (원본 blendKey/잠금은 psdMeta 에 보존됨).
    layer.blendMode = 'normal'
    layer.opacity = 100
    layer.unsupported = {
      originalType: KIND_LABELS[rec.kind],
      reason: img.error
        ? `채널을 읽지 못해 합성 이미지에서 잘라 가져왔습니다 (${img.error})`
        : '픽셀 데이터가 없어 합성 이미지에서 잘라 가져왔습니다 (원본 편집 불가)',
    }
    warnings.push(
      `"${rec.name}": ${KIND_LABELS[rec.kind]} 레이어를 합성 이미지 조각으로 가져왔습니다`,
    )
    return layer
  }

  // 3순위 — 픽셀이 전혀 없음 (Bounds 0 이거나 문서 밖, 숨김) → Unsupported Placeholder
  if (img.error) {
    layer.unsupported = { originalType: KIND_LABELS[rec.kind], reason: img.error }
  } else if (rec.kind !== 'raster') {
    layer.unsupported = {
      originalType: KIND_LABELS[rec.kind],
      reason: '픽셀 데이터가 없어 자리 표시자로 가져왔습니다',
    }
    warnings.push(`"${rec.name}": ${KIND_LABELS[rec.kind]} 레이어 (픽셀 없음)`)
  }
  return layer
}

function convertGroupLayer(
  header: PSDLayerImage,
  id: string,
  parentId: string | undefined,
  warnings: string[],
): Layer {
  const rec = header.record
  const passThrough = isPassThrough(rec.sectionBlendKey ?? rec.blendKey)
  const key = rec.sectionBlendKey ?? rec.blendKey
  const blend = passThrough ? { mode: 'normal' as const, warning: null } : convertBlendKey(key, rec.name)
  if (blend.warning) warnings.push(blend.warning)

  const layer = baseLayer(id, rec.name)
  layer.type = 'group'
  layer.parentId = parentId
  layer.visible = rec.visible
  layer.locked = rec.lock.all
  layer.opacity = Math.round((rec.opacity / 255) * 1000) / 10
  layer.blendMode = blend.mode
  layer.collapsed = rec.sectionType === 2 // 닫힌 그룹은 접힌 상태로
  layer.children = []
  layer.psdMeta = { blendKey: key, infoKeys: rec.infoKeys, passThrough }
  return layer
}

/**
 * Background Layer 판별 — Photoshop Background 특성:
 * 최하단 + 그룹 밖 + Alpha 채널 없음 + 문서 전체 커버 + 투명도 잠금.
 * 하나라도 확신할 수 없으면 raster 로 유지한다.
 */
function detectBackground(layers: Layer[], psd: PSDFile): void {
  const bottom = layers[layers.length - 1]
  if (!bottom || bottom.type !== 'raster' || bottom.parentId || !bottom.bitmap) return

  const img = psd.layerMaskInfo.layers.find(
    (l) => l.record.left === bottom.x && l.record.top === bottom.y && l.record.name === bottom.name,
  )
  if (!img) return
  const rec = img.record

  const coversDocument =
    rec.left <= 0 &&
    rec.top <= 0 &&
    rec.right >= psd.header.width &&
    rec.bottom >= psd.header.height
  const hasAlpha = rec.channels.some((c) => c.id === -1)
  const isOpaque = rec.opacity === 255
  const isProtected = rec.lock.transparency || rec.lock.all

  if (coversDocument && !hasAlpha && isOpaque && isProtected && rec.blendKey === 'norm') {
    bottom.type = 'background'
    bottom.locked = true
  }
}
