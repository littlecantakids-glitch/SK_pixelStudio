import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor } from '../state'
import { useBrushStore } from '../store/brushStore'
import { getActiveEngine } from '../engine/renderEngine'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

/**
 * Photoshop식 원형 브러시 커서.
 * - RenderEngine Overlay Renderer 가 Document 좌표로 그리므로 Zoom/Pan 상태와 무관하게 정확하다.
 * - 캔버스 안: 시스템 커서 숨기고 원형 표시 / 캔버스 밖: 숨김
 * - Locked Layer: not-allowed 커서
 */
export function useBrushCursor(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const brush = useBrushStore()

  const stateRef = useRef({ activeTool, doc, brush })
  stateRef.current = { activeTool, doc, brush }

  // 마지막 포인터 위치 (크기 변경 시 제자리 갱신용)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    const setCursorAttr = (v: 'none' | 'locked' | null) => {
      if (v) el.dataset.brushCursor = v
      else delete el.dataset.brushCursor
    }

    const hide = () => {
      lastPos.current = null
      setCursorAttr(null)
      getActiveEngine()?.setBrushCursor(null)
    }

    const update = (clientX: number, clientY: number) => {
      const { activeTool: tool, doc: d, brush: b } = stateRef.current
      const engine = getActiveEngine()
      // Clone Stamp / Healing / Pen 등은 각 도구 훅이 커서/오버레이를 전담하므로
      // 여기서 setBrushCursor(null) 로 지우면 안 된다 (충돌 방지) — 아무것도 하지 않고 반환.
      if (tool !== 'brush' && tool !== 'eraser') return
      if (!d || !engine) {
        hide()
        return
      }
      const p = vp.screenToCanvas(clientX, clientY)
      lastPos.current = { x: clientX, y: clientY }
      const inside = p.x >= 0 && p.y >= 0 && p.x <= d.width && p.y <= d.height
      if (!inside) {
        setCursorAttr(null)
        engine.setBrushCursor(null)
        return
      }
      const layer = d.layers.find((l) => l.id === d.activeLayerId)
      const paintingMask = d.activeTarget === 'mask' && !!layer?.mask
      const locked =
        !layer ||
        layer.locked ||
        layer.type === 'group' ||
        (!paintingMask && layer.type === 'background')
      if (locked) {
        // Locked Layer — not-allowed 커서, 원형 숨김
        setCursorAttr('locked')
        engine.setBrushCursor(null)
        return
      }
      setCursorAttr('none')
      engine.setBrushCursor({
        x: p.x,
        y: p.y,
        size: b.size,
        hardness: b.hardness,
        screenScale: vp.getScale(),
      })
    }

    const onMove = (e: PointerEvent) => update(e.clientX, e.clientY)
    const onLeave = () => hide()
    const onDown = (e: PointerEvent) => update(e.clientX, e.clientY)

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerleave', onLeave)
      hide()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp])

  // [ / ] 등으로 크기/경도가 바뀌면 커서를 제자리에서 갱신, 도구 전환 시 숨김
  useEffect(() => {
    const el = vp.containerRef.current
    if (activeTool !== 'brush' && activeTool !== 'eraser') {
      if (el) delete el.dataset.brushCursor
      getActiveEngine()?.setBrushCursor(null)
      lastPos.current = null
      return
    }
    const pos = lastPos.current
    if (!pos) return
    const engine = getActiveEngine()
    const d = doc
    if (!engine || !d) return
    const p = vp.screenToCanvas(pos.x, pos.y)
    if (p.x < 0 || p.y < 0 || p.x > d.width || p.y > d.height) return
    engine.setBrushCursor({
      x: p.x,
      y: p.y,
      size: brush.size,
      hardness: brush.hardness,
      screenScale: vp.getScale(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, brush.size, brush.hardness, doc?.activeLayerId, doc?.activeTarget])
}
