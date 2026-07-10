// Text Engine — Photoshop Type Layer System 의 순수 로직 (React 상태 없음).
// Text 는 Bitmap 이 아니라 언제든 수정 가능한 Vector(Type) Layer 이다.
// Rasterize 전까지 픽셀을 생성하지 않으며, RenderEngine 이 이 엔진으로 실시간 렌더한다.
//
//   TextSpec → measure(폭/높이/줄) → drawTextOnCanvas(멀티라인/정렬/자간/행간/비율)
//   향후 Vertical Type / Warp / Text on Path / OpenType 가 이 구조를 확장한다.
import type { Layer, TextSpec, TextWarp, Vec2 } from '../types'
import { genId } from './layerEngine'
import { MASK_DEFAULTS } from './maskEngine'
import { ensureFont } from './fontManager'

/** 측정 전용 오프스크린 컨텍스트 (재사용) */
let measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas')
    measureCtx = c.getContext('2d')!
  }
  return measureCtx
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

export const DEFAULT_TEXT: Omit<TextSpec, 'content' | 'color'> = {
  orientation: 'horizontal',
  fontFamily: 'Arial',
  fontSize: 72,
  fontWeight: 400,
  fontStyle: 'normal',
  tracking: 0,
  leading: 0,
  alignment: 'left',
  antiAlias: 'smooth',
  baselineShift: 0,
  hScale: 100,
  vScale: 100,
}

/** CSS/Canvas font 문자열 */
export function fontString(spec: TextSpec): string {
  const style = spec.fontStyle === 'italic' ? 'italic ' : ''
  return `${style}${spec.fontWeight} ${spec.fontSize}px "${spec.fontFamily}", sans-serif`
}

/** 실제 행간(px) — 0 이면 자동(fontSize * 1.2). Baseline Grid 사용 시 격자 배수로 스냅 */
export function leadingOf(spec: TextSpec): number {
  const base = spec.leading > 0 ? spec.leading : spec.fontSize * 1.2
  const g = spec.baselineGrid ?? 0
  if (g > 0) return Math.max(g, Math.round(base / g) * g)
  return base
}

/** 자간(px) — Photoshop Tracking(1/1000 em) → px */
export function trackingPx(spec: TextSpec): number {
  return (spec.tracking / 1000) * spec.fontSize
}

export function textLines(spec: TextSpec): string[] {
  return spec.content.split('\n')
}

export function warpActive(spec: TextSpec): boolean {
  const w = spec.warp
  return !!w && w.style !== 'none' && (w.bend !== 0 || w.horizontal !== 0 || w.vertical !== 0)
}

/**
 * 표시 줄 계산 — Paragraph(Area) Text 면 box.width 에 맞춰 자동 줄바꿈.
 * 공백 단위 greedy wrap + 긴 토큰/CJK 는 글자 단위 wrap.
 */
export function layoutLines(spec: TextSpec): string[] {
  const raw = textLines(spec)
  if (!spec.box || isVertical(spec)) return raw
  const ctx = getMeasureCtx()
  ctx.font = fontString(spec)
  const tpx = trackingPx(spec)
  const maxW = Math.max(1, spec.box.width)
  const measure = (str: string) => ctx.measureText(str).width + tpx * Math.max(0, str.length - 1)
  const out: string[] = []
  for (const para of raw) {
    if (para === '') {
      out.push('')
      continue
    }
    // 공백 기준 토큰 (공백 유지)
    const tokens = para.match(/\s+|\S+/g) ?? [para]
    let line = ''
    const pushChar = (token: string) => {
      // 한 토큰이 너무 길면 글자 단위로 분해
      for (const ch of token) {
        if (line && measure(line + ch) > maxW) {
          out.push(line)
          line = ch
        } else {
          line += ch
        }
      }
    }
    for (const tk of tokens) {
      if (!line) {
        if (measure(tk) > maxW) pushChar(tk)
        else line = tk
      } else if (measure(line + tk) <= maxW) {
        line += tk
      } else if (measure(tk) > maxW) {
        out.push(line)
        line = ''
        pushChar(tk)
      } else {
        out.push(line)
        line = tk.trimStart()
      }
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

/** OpenType / 고급 문자 기능 — canvas 지원 범위 적용 (kerning / small-caps) */
function applyFontFeatures(ctx: CanvasRenderingContext2D, spec: TextSpec) {
  const ot = spec.openType
  const c = ctx as CanvasRenderingContext2D & { fontKerning?: string; fontVariantCaps?: string }
  c.fontKerning = ot ? (ot.kerning ? 'normal' : 'none') : 'normal'
  if ('fontVariantCaps' in ctx) c.fontVariantCaps = ot?.smallCaps ? 'small-caps' : 'normal'
}

export type TextMetrics = { width: number; height: number; lineWidths: number[]; ascent: number }

export function isVertical(spec: TextSpec): boolean {
  return spec.orientation === 'vertical'
}

// ── 캐시 (Glyph/Text Bitmap Cache + Measure Cache) ─────────────────
// 위치/회전과 무관한 로컬 렌더 결과를 서명(localKey)으로 캐시한다.
// LayerCache 가 비워져도(브러시/마스크 미리보기) 재-rasterize 없이 재사용 → 대용량 문서 최적화.
export type TextBitmap = { canvas: HTMLCanvasElement; dx: number; dy: number }
const measureCache = new Map<string, TextMetrics>()
const bitmapCache = new Map<string, TextBitmap>()
const MEASURE_CAP = 600
const BITMAP_CAP = 160

/** 위치/회전을 제외한 렌더/측정 서명 (캐시 키) */
function localKey(spec: TextSpec): string {
  const o = spec.openType
  const w = spec.warp
  return [
    spec.content,
    spec.orientation ?? 'h',
    spec.fontFamily,
    spec.fontSize,
    spec.fontWeight,
    spec.fontStyle,
    spec.tracking,
    spec.leading,
    spec.color,
    spec.alignment,
    spec.antiAlias,
    spec.baselineShift,
    spec.hScale,
    spec.vScale,
    spec.box ? `${spec.box.width}x${spec.box.height}` : '_',
    w ? `${w.style}${w.bend},${w.horizontal},${w.vertical}` : '_',
    o ? `${o.kerning}${o.smallCaps}${o.ligatures}${o.fractions}${o.oldStyle}${o.stylisticSet}` : '_',
    spec.baselineGrid ?? 0,
  ].join('|')
}

function lruSet<T>(map: Map<string, T>, key: string, val: T, cap: number) {
  map.set(key, val)
  if (map.size > cap) {
    const first = map.keys().next().value
    if (first !== undefined) map.delete(first)
  }
}

/** Glyph/Text Bitmap Cache + Measure Cache 초기화 (폰트 로드 등으로 무효화될 때) */
export function clearTextCaches() {
  measureCache.clear()
  bitmapCache.clear()
}

export function textCacheStats(): { bitmaps: number; measures: number } {
  return { bitmaps: bitmapCache.size, measures: measureCache.size }
}

/** 세로쓰기 글자 세로 간격(px) */
export function charAdvance(spec: TextSpec): number {
  return spec.fontSize + trackingPx(spec)
}

/** Text 측정 — 캐시된 결과 반환 (동일 서명이면 재계산 없음) */
export function measureTextSpec(spec: TextSpec): TextMetrics {
  const key = localKey(spec)
  const hit = measureCache.get(key)
  if (hit) return hit
  const m = measureUncached(spec)
  lruSet(measureCache, key, m, MEASURE_CAP)
  return m
}

/** Text 측정(실계산) — hScale/vScale/tracking/leading 반영한 레이아웃 크기 (가로/세로쓰기 지원) */
function measureUncached(spec: TextSpec): TextMetrics {
  ensureFont(spec.fontFamily)
  const ctx = getMeasureCtx()
  ctx.font = fontString(spec)
  const tpx = trackingPx(spec)
  const lines = layoutLines(spec)
  const leading = leadingOf(spec)
  const hs = spec.hScale / 100
  const vs = spec.vScale / 100
  const lineWidths = lines.map((line) => {
    const base = ctx.measureText(line).width
    return base + tpx * Math.max(0, line.length - 1)
  })

  // Paragraph(Area) Text — 박스 크기 고정
  if (spec.box && !isVertical(spec)) {
    return {
      width: Math.max(1, Math.ceil(spec.box.width * hs)),
      height: Math.max(1, Math.ceil(spec.box.height * vs)),
      lineWidths,
      ascent: spec.fontSize * 0.8,
    }
  }

  if (isVertical(spec)) {
    // 세로쓰기: 각 줄 = 세로 열, 열은 오른쪽→왼쪽으로 배치
    const cols = Math.max(1, lines.length)
    const maxLen = Math.max(1, ...lines.map((l) => [...l].length), 1)
    const colWidth = leading // 열 간격 = 행간
    const baseWidth = cols * colWidth
    const baseHeight = maxLen * charAdvance(spec)
    return {
      width: Math.max(1, Math.ceil(baseWidth * hs)),
      height: Math.max(1, Math.ceil(baseHeight * vs)),
      lineWidths,
      ascent: spec.fontSize * 0.8,
    }
  }

  const baseWidth = Math.max(1, ...lineWidths, 1)
  const baseHeight = Math.max(1, lines.length) * leading
  return {
    width: Math.max(1, Math.ceil(baseWidth * hs)),
    height: Math.max(1, Math.ceil(baseHeight * vs)),
    lineWidths,
    ascent: spec.fontSize * 0.8,
  }
}

/**
 * Text 를 canvas 에 그린다 (ctx 는 이미 레이어 원점으로 translate 된 상태 = 로컬 좌표).
 * 멀티라인 + 정렬 + 자간 + 행간 + 가로/세로 비율 + 기준선 이동. RenderEngine/Thumbnail 공유.
 */
export function drawTextOnCanvas(
  ctx: CanvasRenderingContext2D,
  spec: TextSpec,
  resolvedPath?: Vec2[],
) {
  // Text on Path 우선
  if (spec.pathId && resolvedPath && resolvedPath.length >= 2) {
    drawTextOnPath(ctx, spec, resolvedPath)
    return
  }
  // Warp 없으면 바로 그린다
  if (!warpActive(spec)) {
    drawNatural(ctx, spec)
    return
  }
  // Warp — 자연 텍스트를 임시 캔버스에 그린 뒤 열 단위로 변형
  const m = measureTextSpec(spec)
  const tw = Math.max(1, m.width)
  const th = Math.max(1, m.height)
  const temp = makeCanvas(tw, th)
  const tctx = temp.getContext('2d')
  if (!tctx) return
  drawNatural(tctx, spec)
  const { canvas: warped, offsetY } = applyWarp(temp, spec.warp!)
  ctx.drawImage(warped, 0, offsetY)
}

/**
 * Glyph/Text Bitmap Cache — 위치 독립 로컬 렌더 결과 캔버스를 캐시한다.
 * RenderEngine 이 이 비트맵을 drawImage 로 합성 → 재-rasterize 비용 제거(대용량 문서 최적화).
 * Warp 는 캐시된 warp 결과(dx/dy offset 포함)까지 재사용. Text-on-Path 는 직접 렌더(캐시 제외).
 * (GPU 텍스트 렌더링 대비: 이 캔버스를 그대로 텍스처로 업로드할 수 있는 구조)
 */
export function getTextBitmap(spec: TextSpec): TextBitmap {
  ensureFont(spec.fontFamily)
  const key = localKey(spec)
  const hit = bitmapCache.get(key)
  if (hit) {
    // LRU 갱신
    bitmapCache.delete(key)
    bitmapCache.set(key, hit)
    return hit
  }
  const m = measureTextSpec(spec)
  const natural = makeCanvas(Math.max(1, m.width), Math.max(1, m.height))
  const nctx = natural.getContext('2d')
  let out: TextBitmap = { canvas: natural, dx: 0, dy: 0 }
  if (nctx) {
    drawNatural(nctx, spec)
    if (warpActive(spec)) {
      const { canvas, offsetY } = applyWarp(natural, spec.warp!)
      out = { canvas, dx: 0, dy: offsetY }
    }
  }
  lruSet(bitmapCache, key, out, BITMAP_CAP)
  return out
}

/** 자연(가로/세로/단락) 텍스트 렌더 — 로컬 원점(0,0) 기준 */
function drawNatural(ctx: CanvasRenderingContext2D, spec: TextSpec) {
  ensureFont(spec.fontFamily)
  // Subpixel/품질 힌트
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const tr = ctx as CanvasRenderingContext2D & { textRendering?: string }
  tr.textRendering = spec.antiAlias === 'none' ? 'optimizeSpeed' : 'geometricPrecision'
  const lines = layoutLines(spec)
  if (lines.length === 0) return
  const metrics = measureTextSpec(spec)
  const leading = leadingOf(spec)
  const tpx = trackingPx(spec)
  const hs = spec.hScale / 100
  const vs = spec.vScale / 100

  if (isVertical(spec)) {
    drawVerticalText(ctx, spec, metrics, hs, vs)
    return
  }

  // 정렬 기준이 되는 미(未)스케일 박스 폭
  const baseWidth = metrics.width / hs

  ctx.save()
  if (hs !== 1 || vs !== 1) ctx.scale(hs, vs)
  ctx.font = fontString(spec)
  applyFontFeatures(ctx, spec)
  ctx.fillStyle = spec.color
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = spec.alignment
  // 자간 (지원 브라우저) — 미지원 시 measure 근사만 반영
  const hasLetterSpacing = 'letterSpacing' in ctx
  if (hasLetterSpacing) {
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tpx}px`
    } catch {
      /* noop */
    }
  }
  if (spec.antiAlias === 'none') {
    ;(ctx as CanvasRenderingContext2D & { textRendering?: string }).textRendering = 'optimizeSpeed'
  }

  const x = spec.alignment === 'left' ? 0 : spec.alignment === 'center' ? baseWidth / 2 : baseWidth
  for (let i = 0; i < lines.length; i++) {
    const y = metrics.ascent + i * leading - spec.baselineShift
    // letterSpacing 미지원 브라우저에서 tracking 근사 (문자별 배치)
    if (!hasLetterSpacing && tpx !== 0) {
      drawTrackedLine(ctx, lines[i], x, y, tpx, spec.alignment, metrics.lineWidths[i])
    } else {
      ctx.fillText(lines[i], x, y)
    }
  }
  if (hasLetterSpacing) {
    try {
      ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
    } catch {
      /* noop */
    }
  }
  ctx.restore()
}

/** 세로쓰기 렌더 — 각 줄을 세로 열로, 열은 오른쪽→왼쪽, 글자는 위→아래 */
function drawVerticalText(
  ctx: CanvasRenderingContext2D,
  spec: TextSpec,
  metrics: TextMetrics,
  hs: number,
  vs: number,
) {
  const lines = textLines(spec)
  const leading = leadingOf(spec)
  const adv = charAdvance(spec)
  const baseWidth = metrics.width / hs
  ctx.save()
  if (hs !== 1 || vs !== 1) ctx.scale(hs, vs)
  ctx.font = fontString(spec)
  ctx.fillStyle = spec.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  if (spec.antiAlias === 'none') {
    ;(ctx as CanvasRenderingContext2D & { textRendering?: string }).textRendering = 'optimizeSpeed'
  }
  for (let c = 0; c < lines.length; c++) {
    const chars = [...lines[c]]
    // 열은 오른쪽부터 (첫 줄 = 가장 오른쪽 열)
    const colX = baseWidth - (c + 0.5) * leading
    // 세로 정렬: left=위, center=가운데, right=아래 (Photoshop 세로 조판 관례)
    const colHeight = chars.length * adv
    const maxHeight = metrics.height / vs
    const offY =
      spec.alignment === 'center'
        ? (maxHeight - colHeight) / 2
        : spec.alignment === 'right'
          ? maxHeight - colHeight
          : 0
    for (let j = 0; j < chars.length; j++) {
      ctx.fillText(chars[j], colX, offY + j * adv - spec.baselineShift)
    }
  }
  ctx.restore()
}

/** letterSpacing 미지원 폴백 — 문자 단위 배치 */
function drawTrackedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  tpx: number,
  align: TextSpec['alignment'],
  lineWidth: number,
) {
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  let cx = align === 'left' ? x : align === 'center' ? x - lineWidth / 2 : x - lineWidth
  for (const ch of line) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + tpx
  }
  ctx.textAlign = prevAlign
}

// ── Warp Text ─────────────────────────────────────────────────────
/** style별 상/하단 가장자리 변위 프로파일 (t: 0~1 → -1~1) */
function warpEnvelope(style: TextWarp['style'], t: number): { top: number; bot: number } {
  const c = 1 - (2 * t - 1) ** 2 // 0(끝)~1(중앙) 포물선
  const r = 2 * t - 1 // -1~1 선형
  const s2 = Math.sin(t * Math.PI * 2)
  switch (style) {
    case 'arc':
      return { top: -c, bot: -c }
    case 'arch':
      return { top: -c, bot: -c * 0.35 }
    case 'arcUpper':
      return { top: -c, bot: 0 }
    case 'arcLower':
      return { top: 0, bot: c }
    case 'bulge':
      return { top: -c, bot: c }
    case 'shellLower':
      return { top: c * 0.3, bot: c }
    case 'shellUpper':
      return { top: -c, bot: -c * 0.3 }
    case 'flag':
      return { top: s2, bot: s2 }
    case 'wave':
      return { top: s2, bot: -s2 }
    case 'fish':
      return { top: -c, bot: c * (1 - t) }
    case 'rise':
      return { top: r, bot: r }
    default:
      return { top: 0, bot: 0 }
  }
}

/** 자연 텍스트 캔버스를 Warp 변형 (열 단위 세로 이동/스케일). offsetY 만큼 위로 배치 */
function applyWarp(src: HTMLCanvasElement, warp: TextWarp): { canvas: HTMLCanvasElement; offsetY: number } {
  const w = src.width
  const h = src.height
  const amp = (warp.bend / 100) * h * 0.6
  const hd = warp.horizontal / 100
  const vd = warp.vertical / 100
  const margin = Math.ceil(Math.abs(amp) + Math.abs(hd) * h * 0.5) + 2
  const dest = makeCanvas(w, h + margin * 2)
  const dctx = dest.getContext('2d')
  if (!dctx) return { canvas: src, offsetY: 0 }
  dctx.imageSmoothingEnabled = true
  dctx.imageSmoothingQuality = 'high'
  for (let x = 0; x < w; x++) {
    const t = w > 1 ? x / (w - 1) : 0
    const env = warpEnvelope(warp.style, t)
    const slant = hd * (t - 0.5) * h // 가로 왜곡 = 기울기
    let top = margin + amp * env.top + slant
    let bot = margin + h + amp * env.bot + slant
    // 세로 왜곡 = 좌우로 갈수록 높이 스케일
    const scale = 1 + vd * (t - 0.5)
    const mid = (top + bot) / 2
    const half = ((bot - top) / 2) * scale
    top = mid - half
    bot = mid + half
    dctx.drawImage(src, x, 0, 1, h, x, top, 1, Math.max(0.5, bot - top))
  }
  return { canvas: dest, offsetY: -margin }
}

// ── Text on Path ──────────────────────────────────────────────────
/** 폴리라인 누적 길이 기준으로 거리 d 위치의 점 + 접선 각도 */
function pointAtDistance(poly: Vec2[], seg: number[], total: number, d: number): { x: number; y: number; angle: number } | null {
  if (d < 0 || d > total || poly.length < 2) return null
  let acc = 0
  for (let i = 0; i + 1 < poly.length; i++) {
    const len = seg[i]
    if (acc + len >= d) {
      const f = len > 0 ? (d - acc) / len : 0
      const a = poly[i]
      const b = poly[i + 1]
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      }
    }
    acc += len
  }
  return null
}

/** Text on Path 렌더 — 각 글자를 패스를 따라 배치(위치 + 접선 회전) */
function drawTextOnPath(ctx: CanvasRenderingContext2D, spec: TextSpec, poly: Vec2[]) {
  const seg: number[] = []
  let total = 0
  for (let i = 0; i + 1 < poly.length; i++) {
    const l = Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y)
    seg.push(l)
    total += l
  }
  const chars = [...spec.content.replace(/\n/g, ' ')]
  const tpx = trackingPx(spec)
  ctx.save()
  ctx.font = fontString(spec)
  ctx.fillStyle = spec.color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  applyFontFeatures(ctx, spec)
  let dist = 0
  for (const ch of chars) {
    const cw = ctx.measureText(ch).width
    const at = pointAtDistance(poly, seg, total, dist + cw / 2)
    if (!at) break
    ctx.save()
    ctx.translate(at.x, at.y)
    ctx.rotate(at.angle)
    ctx.fillText(ch, -cw / 2, -spec.baselineShift)
    ctx.restore()
    dist += cw + tpx
  }
  ctx.restore()
}

/** Type Layer 생성 — Bitmap 없음, text 스펙만 보유 (RenderEngine 이 실시간 렌더) */
export function createTextLayer(opts: {
  name: string
  x: number
  y: number
  spec: TextSpec
}): Layer {
  const { name, x, y, spec } = opts
  const m = measureTextSpec(spec)
  return {
    id: genId('text'),
    name,
    type: 'text',
    visible: true,
    locked: false,
    selected: true,
    opacity: 100,
    fill: 100,
    blendMode: 'normal',
    x,
    y,
    width: m.width,
    height: m.height,
    rotation: 0,
    ...MASK_DEFAULTS,
    text: { ...spec },
  }
}

/** Type Layer 이름 — 내용 첫 줄(최대 24자), 비면 '텍스트' */
export function textLayerName(content: string): string {
  const first = content.split('\n')[0]?.trim() ?? ''
  if (!first) return '텍스트'
  return first.length > 24 ? `${first.slice(0, 24)}…` : first
}

/** Text → 문서 크기 Bitmap 으로 Rasterize (Rasterize Type / 내보내기용) */
export function rasterizeText(layer: Layer, docW: number, docH: number): HTMLCanvasElement {
  const c = makeCanvas(docW, docH)
  const ctx = c.getContext('2d')
  if (ctx && layer.text) {
    ctx.save()
    ctx.translate(layer.x, layer.y)
    drawTextOnCanvas(ctx, layer.text)
    ctx.restore()
  }
  return c
}

/** Text 캐시 서명 — 스펙/기하 변경 시 RenderEngine 캐시 무효화 */
export function textSignature(layer: Layer): string {
  const t = layer.text
  if (!t) return 'notext'
  return [
    t.content,
    t.orientation ?? 'horizontal',
    t.fontFamily,
    t.fontSize,
    t.fontWeight,
    t.fontStyle,
    t.tracking,
    t.leading,
    t.color,
    t.alignment,
    t.antiAlias,
    t.baselineShift,
    t.hScale,
    t.vScale,
    t.box ? `box${t.box.width}x${t.box.height}` : 'point',
    t.warp ? `${t.warp.style},${t.warp.bend},${t.warp.horizontal},${t.warp.vertical}` : 'nowarp',
    t.pathId ?? 'nopath',
    t.openType ? `${t.openType.kerning}${t.openType.smallCaps}${t.openType.ligatures}${t.openType.fractions}${t.openType.oldStyle}${t.openType.stylisticSet}` : 'noot',
    t.fillGradient
      ? `fg:${t.fillGradient.gradient.type}:${t.fillGradient.gradient.stops
          .map((s) => `${s.position.toFixed(3)}${s.color}${s.opacity}`)
          .join(';')}:${t.fillGradient.geom.x0},${t.fillGradient.geom.y0},${t.fillGradient.geom.x1},${t.fillGradient.geom.y1}`
      : 'nofg',
    `@${Math.round(layer.x)},${Math.round(layer.y)}`,
    layer.rotation,
  ].join('|')
}
