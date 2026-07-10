import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useBucketStore } from '../store/bucketStore'
import { useOpenStore } from '../store/openStore'
import { getActiveEngine } from '../engine/renderEngine'
import { floodFillEngine, maskToAlphaCanvas } from '../engine/floodFillEngine'
import { readPixels } from '../engine/samplingEngine'
import { getPattern } from '../engine/patternEngine'
import { toMaskGray } from '../engine/maskEngine'
import { BRUSH_MODE_OP, docToLayerLocal } from '../engine/brushEngine'
import type { Layer, MaskTarget, OpenDocument } from '../types'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

/** doc 좌표 선택 마스크 → 레이어 로컬 알파 캔버스 */
function buildLocalSelection(
  doc: OpenDocument,
  layer: Layer,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  const sel = doc.selection
  if (!sel.active || !sel.mask) return null
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const ox = Math.round(layer.x)
  const oy = Math.round(layer.y)
  for (let y = 0; y < h; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= doc.height) continue
    for (let x = 0; x < w; x++) {
      const dx = x + ox
      if (dx < 0 || dx >= doc.width) continue
      img.data[(y * w + x) * 4 + 3] = sel.mask[dy * doc.width + dx]
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * Paint Bucket Tool — Flood Fill Engine(Color Matching, Magic Wand 공유) 기반 채우기.
 * - Tolerance / Contiguous / Anti-Alias / Sample All Layers / Pattern·Foreground Fill
 * - Selection 내부만 Fill, Layer Mask Fill 지원
 * - Bitmap 직접 수정 없이 working canvas → APPLY_LAYERS 로 커밋 (History 1개)
 */
export function usePaintBucketTool(vp: ViewportApi) {
  const { activeTool, foregroundColor } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const bucket = useBucketStore()
  const { toast } = useOpenStore()

  const stateRef = useRef({ activeTool, doc, bucket, fg: foregroundColor })
  stateRef.current = { activeTool, doc, bucket, fg: foregroundColor }

  // Fill Cache — 문서가 바뀌지 않은 연속 클릭에서 Sampling(재렌더/getImageData) 재사용.
  // RenderEngine 의 레이어 캐시와는 독립적인 자체 캐시 (충돌 없음).
  const sampleCache = useRef<{ key: string; img: ImageData } | null>(null)

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function down(e: PointerEvent) {
      const { activeTool: tool, doc: d, bucket: b, fg } = stateRef.current
      if (tool !== 'bucket' || e.button !== 0 || !d) return
      const engine = getActiveEngine()
      if (!engine) return
      const layer = d.layers.find((l) => l.id === d.activeLayerId)
      if (!layer || layer.type === 'group') return

      const target: MaskTarget =
        (d.activeTarget === 'mask' || layer.type === 'adjustment') && layer.mask ? 'mask' : 'bitmap'
      if (layer.locked || (target === 'bitmap' && layer.type === 'background')) {
        toast('Layer is locked.', 'error')
        return
      }
      // Smart Object — Parent Document 에서 직접 Fill 금지 (내부 편집에서 사용)
      if (target === 'bitmap' && (layer.type === 'smartObject' || layer.adjustment)) {
        toast('고급 개체는 내부 편집(더블클릭)에서 채우세요.', 'error')
        return
      }
      if (target === 'bitmap' && layer.type !== 'raster' && layer.type !== 'image') {
        toast('픽셀 레이어가 아닙니다. 래스터화 후 사용하세요.', 'error')
        return
      }

      const p = vp.screenToCanvas(e.clientX, e.clientY)
      if (p.x < 0 || p.y < 0 || p.x >= d.width || p.y >= d.height) return

      // 레이어 로컬 크기 / seed
      const w =
        target === 'mask' ? layer.mask!.bitmap.width : Math.max(1, Math.round(layer.width || d.width))
      const h =
        target === 'mask' ? layer.mask!.bitmap.height : Math.max(1, Math.round(layer.height || d.height))
      const local = docToLayerLocal(p.x, p.y, layer)

      // ── 1) Sampling — Color Matching 입력 이미지 ──
      // Sample All: RenderEngine 결과(doc 공간) / OFF: 현재 Layer Bitmap(로컬 공간) / Mask: Mask Bitmap
      // Fill Cache: history 가 변하지 않은 연속 클릭은 동일 Sampling 을 재사용
      let sampleImg: ImageData | null = null
      let fillSpace: 'doc' | 'local' = 'local'
      let seedX = Math.floor(local.x)
      let seedY = Math.floor(local.y)
      const cacheKey = `${d.id}:${d.historyIndex}:${d.history.length}:${layer.id}:${target}:${b.sampleAll}`
      try {
        if (sampleCache.current?.key === cacheKey) {
          sampleImg = sampleCache.current.img
          if (b.sampleAll && target !== 'mask') fillSpace = 'doc'
        } else if (target === 'mask') {
          sampleImg = readPixels(layer.mask!.bitmap, 0, 0, w, h)
        } else if (b.sampleAll) {
          sampleImg = engine.getSampleImage(d, 0, 0, 2 * Math.max(d.width, d.height))
          fillSpace = 'doc'
        } else {
          const src = makeCanvas(w, h)
          if (layer.bitmap) src.getContext('2d')!.drawImage(layer.bitmap, 0, 0, w, h)
          sampleImg = src.getContext('2d')!.getImageData(0, 0, w, h)
        }
      } catch {
        sampleImg = null
      }
      if (!sampleImg) return
      sampleCache.current = { key: cacheKey, img: sampleImg }
      if (fillSpace === 'doc') {
        seedX = Math.floor(p.x)
        seedY = Math.floor(p.y)
      }

      // ── 2) Color Matching (Flood Fill Engine — Queue 기반 Scanline, Magic Wand 공유) ──
      const mask = floodFillEngine.fill(sampleImg, seedX, seedY, {
        tolerance: b.tolerance,
        contiguous: b.contiguous,
        antiAlias: b.antiAlias,
        eightWay: true,
      })
      if (!mask) return
      const coverage = maskToAlphaCanvas(mask, sampleImg.width, sampleImg.height)

      // ── 3) Fill 캔버스 (전경색 / Pattern) — 커버리지 ∧ Selection 클립 ──
      const fillC = makeCanvas(w, h)
      const fctx = fillC.getContext('2d')!
      if (b.fillType === 'pattern') {
        const pat = getPattern(b.patternId)
        if (pat) fctx.fillStyle = fctx.createPattern(pat.tile, 'repeat')!
        else fctx.fillStyle = fg
      } else {
        fctx.fillStyle = target === 'mask' ? toMaskGray(fg) : fg
      }
      fctx.fillRect(0, 0, w, h)
      fctx.globalCompositeOperation = 'destination-in'
      if (fillSpace === 'doc') {
        fctx.drawImage(coverage, -Math.round(layer.x), -Math.round(layer.y))
      } else {
        fctx.drawImage(coverage, 0, 0)
      }
      const sel = buildLocalSelection(d, layer, w, h)
      if (sel) fctx.drawImage(sel, 0, 0)
      // Lock Transparent Pixels — 투명 영역 Fill 금지 (기존 알파 내부만 채움)
      if (target === 'bitmap' && layer.lockTransparent && layer.bitmap) {
        fctx.drawImage(layer.bitmap, 0, 0, w, h)
      }
      fctx.globalCompositeOperation = 'source-over'

      // ── 4) Working = 원본 + Fill 합성 (Bitmap 직접 수정 금지) ──
      const working = makeCanvas(w, h)
      const wctx = working.getContext('2d')!
      if (target === 'mask') wctx.drawImage(layer.mask!.bitmap, 0, 0, w, h)
      else if (layer.bitmap) wctx.drawImage(layer.bitmap, 0, 0, w, h)
      wctx.globalAlpha = Math.max(0, Math.min(1, b.opacity / 100))
      wctx.globalCompositeOperation =
        target === 'mask'
          ? 'source-over'
          : (BRUSH_MODE_OP as Record<string, GlobalCompositeOperation>)[b.mode] ?? 'source-over'
      wctx.drawImage(fillC, 0, 0)
      wctx.globalCompositeOperation = 'source-over'
      wctx.globalAlpha = 1

      // ── 5) Commit — History 1개, RenderEngine invalidate 는 doc 변경으로 자동 ──
      const label = b.fillType === 'pattern' ? '페인트 통 채우기 (패턴)' : '페인트 통 채우기'
      if (target === 'mask') {
        dispatch({
          type: 'APPLY_LAYERS',
          id: d.id,
          layers: d.layers.map((l) =>
            l.id === layer.id && l.mask ? { ...l, mask: { ...l.mask, bitmap: working } } : l,
          ),
          label,
          historyType: 'brush',
        })
      } else {
        dispatch({
          type: 'APPLY_LAYERS',
          id: d.id,
          layers: d.layers.map((l) => (l.id === layer.id ? { ...l, bitmap: working } : l)),
          label,
          historyType: 'brush',
        })
      }
      b.setStatus(
        `${label} 적용${d.selection.active ? ' · 선택 영역 내' : ''}${
          target === 'mask' ? ' · 레이어 마스크' : ''
        }${b.sampleAll ? ' · 모든 레이어 샘플' : ''}`,
      )
    }

    el.addEventListener('pointerdown', down)
    return () => el.removeEventListener('pointerdown', down)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch, toast])

  // 커서 속성 (Bucket SVG 커서)
  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return
    if (activeTool === 'bucket') el.dataset.bucket = '1'
    else delete el.dataset.bucket
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])
}
