import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useWandStore } from '../store/wandStore'
import { useSelectionStore } from '../store/selectionStore'
import { getActiveEngine } from '../engine/renderEngine'
import { floodFillEngine } from '../engine/floodFillEngine'
import { boundsOf, combine, isEmpty } from '../engine/selectionEngine'
import { readPixels } from '../engine/samplingEngine'
import type { Layer, SelectionOperation, SelectionState } from '../types'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

/**
 * Magic Wand Tool — Paint Bucket 과 동일한 Color Matching Engine(FloodFillEngine)으로
 * Selection 을 생성한다. 기존 Selection Engine(combine/boundsOf/Marching Ants)을 그대로 사용.
 * - Tolerance / Contiguous / Anti-Alias / Sample All Layers
 * - Shift = Add · Alt = Subtract · Shift+Alt = Intersect (Photoshop)
 * - Mask 편집 중 = Mask Gray 기준, Smart Object = Render 결과 기준
 * - Selection 생성은 History 를 만들지 않는다 (MOVE_SELECTION)
 */
export function useMagicWandTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const wand = useWandStore()
  const sel = useSelectionStore()

  const stateRef = useRef({ activeTool, doc, wand, sel })
  stateRef.current = { activeTool, doc, wand, sel }

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function down(e: PointerEvent) {
      const { activeTool: tool, doc: d, wand: w, sel: s } = stateRef.current
      if (tool !== 'wand' || e.button !== 0 || !d) return
      const engine = getActiveEngine()
      if (!engine) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const px = Math.floor(p.x)
      const py = Math.floor(p.y)
      if (px < 0 || py < 0 || px >= d.width || py >= d.height) return

      const layer = d.layers.find((l) => l.id === d.activeLayerId)
      const masking = d.activeTarget === 'mask' && !!layer?.mask

      // ── 1) Sampling — Mask Gray / RenderEngine 결과 / 현재 Layer Bitmap ──
      let img: ImageData | null = null
      let space: 'doc' | 'layer' = 'doc'
      let seedX = px
      let seedY = py
      let refLayer: Layer | null = null
      try {
        if (masking && layer) {
          img = readPixels(
            layer.mask!.bitmap, 0, 0, layer.mask!.bitmap.width, layer.mask!.bitmap.height,
          )
          space = 'layer'
          refLayer = layer
          seedX = Math.floor(px - layer.x)
          seedY = Math.floor(py - layer.y)
        } else if (w.sampleAll || !layer || layer.type === 'smartObject' || !layer.bitmap) {
          // Sample All / Smart Object / Bitmap 없는 레이어 → Render 결과 기준
          img = engine.getSampleImage(d, 0, 0, 2 * Math.max(d.width, d.height))
        } else {
          const lw = Math.max(1, Math.round(layer.width || d.width))
          const lh = Math.max(1, Math.round(layer.height || d.height))
          const c = document.createElement('canvas')
          c.width = lw
          c.height = lh
          c.getContext('2d')!.drawImage(layer.bitmap, 0, 0, lw, lh)
          img = c.getContext('2d')!.getImageData(0, 0, lw, lh)
          space = 'layer'
          refLayer = layer
          seedX = Math.floor(px - layer.x)
          seedY = Math.floor(py - layer.y)
        }
      } catch {
        img = null
      }
      if (!img) return

      // ── 2) Color Matching (Paint Bucket 공유 엔진) ──
      const coverage = floodFillEngine.fill(img, seedX, seedY, {
        tolerance: w.tolerance,
        contiguous: w.contiguous,
        antiAlias: w.antiAlias,
        eightWay: true,
      })
      if (!coverage) return

      // ── 3) 커버리지 → doc 공간 Selection Mask ──
      const mask = new Uint8Array(d.width * d.height)
      if (space === 'doc') {
        mask.set(coverage.subarray(0, mask.length))
      } else if (refLayer) {
        const ox = Math.round(refLayer.x)
        const oy = Math.round(refLayer.y)
        for (let y = 0; y < img.height; y++) {
          const dy = y + oy
          if (dy < 0 || dy >= d.height) continue
          for (let x = 0; x < img.width; x++) {
            const dx = x + ox
            if (dx < 0 || dx >= d.width) continue
            mask[dy * d.width + dx] = coverage[y * img.width + x]
          }
        }
      }

      // ── 4) Modifier — Shift=Add · Alt=Subtract · Shift+Alt=Intersect ──
      const op: SelectionOperation =
        e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : s.operation
      const combined = combine(d.selection.mask, mask, op)
      const active = !isEmpty(combined)
      const selection: SelectionState = {
        active,
        mode: d.selection.mode,
        operation: op,
        bounds: active ? boundsOf(combined, d.width, d.height) : { x: 0, y: 0, width: 0, height: 0 },
        mask: active ? combined : null,
        width: d.width,
        height: d.height,
        feather: s.feather,
        antiAlias: w.antiAlias,
      }
      // Selection 생성은 History 미기록 (Photoshop Magic Wand)
      dispatch({ type: 'MOVE_SELECTION', selection })

      let count = 0
      for (let i = 0; i < combined.length; i++) if (combined[i]) count++
      w.setStatus(
        active
          ? `${count.toLocaleString()}픽셀 선택됨 · 허용치 ${w.tolerance}${masking ? ' · 마스크 기준' : w.sampleAll ? ' · 모든 레이어' : ''}`
          : '선택 영역 없음',
      )
    }

    el.addEventListener('pointerdown', down)
    return () => el.removeEventListener('pointerdown', down)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch])

  // 커서 속성 (Wand SVG 커서)
  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return
    if (activeTool === 'wand') el.dataset.wand = '1'
    else {
      delete el.dataset.wand
      wand.setStatus(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])

  // W — Magic Wand Tool 선택
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'wand' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
