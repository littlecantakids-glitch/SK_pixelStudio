import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useSelectionStore } from '../store/selectionStore'
import { emptySelection, type Layer, type OpenDocument, type Rect, type SelectionMode, type SelectionState } from '../types'
import {
  allMask,
  boundsOf,
  combine,
  ellipseMask,
  invertMask,
  isEmpty,
  polygonMask,
  rectMask,
  translateMask,
} from '../engine/selectionEngine'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

function norm(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  }
}

export function useSelectionTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const sel = useSelectionStore()

  const docRef = useRef<OpenDocument | null>(doc)
  const toolRef = useRef(activeTool)
  const selRef = useRef(sel)
  docRef.current = doc
  toolRef.current = activeTool
  selRef.current = sel

  const drag = useRef<{
    mode: 'draw' | 'move' | 'lasso' | null
    x0: number
    y0: number
    origMask: Uint8Array | null
    origSel: SelectionState | null
  }>({ mode: null, x0: 0, y0: 0, origMask: null, origSel: null })
  const spaceRef = useRef(false)

  // Space(팬 도구 임시전환) 추적 — 눌린 동안엔 선택을 그리지 않음
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    const isSelectionTool = () =>
      toolRef.current === 'marquee' || toolRef.current === 'lasso'

    function commitShape(mask: Uint8Array, label: string) {
      const d = docRef.current
      if (!d) return
      const s = selRef.current
      const op = s.operation
      const combined = combine(d.selection.mask, mask, op)
      const active = !isEmpty(combined)
      const modeMap: Record<string, SelectionMode> = {
        marquee: s.marqueeMode === 'ellipse' ? 'ellipse' : 'rectangle',
        lasso: s.lassoMode === 'polygon' ? 'polygon' : 'lasso',
      }
      const selection: SelectionState = {
        active,
        mode: modeMap[toolRef.current] ?? 'rectangle',
        operation: op,
        bounds: active ? boundsOf(combined, d.width, d.height) : { x: 0, y: 0, width: 0, height: 0 },
        mask: active ? combined : null,
        width: d.width,
        height: d.height,
        feather: s.feather,
        antiAlias: s.antiAlias,
      }
      dispatch({ type: 'SET_SELECTION', selection, label })
    }

    // ---- 사각형/타원 마퀴 ----
    function onPointerDown(e: PointerEvent) {
      if (!isSelectionTool() || e.button !== 0 || spaceRef.current) return
      const d = docRef.current
      if (!d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)

      // 기존 선택 내부를 (수식어 없이) 드래그하면 선택 영역 이동
      const insideSel =
        d.selection.active &&
        d.selection.mask &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < d.width &&
        p.y < d.height &&
        d.selection.mask[Math.floor(p.y) * d.width + Math.floor(p.x)] > 0
      if (insideSel && selRef.current.operation === 'new' && !e.shiftKey && !e.altKey) {
        drag.current = {
          mode: 'move',
          x0: p.x,
          y0: p.y,
          origMask: d.selection.mask,
          origSel: d.selection,
        }
        el!.setPointerCapture(e.pointerId)
        return
      }

      if (toolRef.current === 'lasso' && selRef.current.lassoMode === 'polygon') {
        // 폴리곤: 클릭으로 점 추가
        const cur = selRef.current.draft
        if (cur && cur.kind === 'polygon') {
          sel.setDraft({ kind: 'polygon', points: [...cur.points, [p.x, p.y]], cursor: [p.x, p.y] })
        } else {
          sel.setDraft({ kind: 'polygon', points: [[p.x, p.y]], cursor: [p.x, p.y] })
        }
        return
      }

      el!.setPointerCapture(e.pointerId)
      if (toolRef.current === 'lasso') {
        drag.current = { mode: 'lasso', x0: p.x, y0: p.y, origMask: null, origSel: null }
        sel.setDraft({ kind: 'lasso', points: [[p.x, p.y]] })
      } else {
        drag.current = { mode: 'draw', x0: p.x, y0: p.y, origMask: null, origSel: null }
        const kind = selRef.current.marqueeMode === 'ellipse' ? 'ellipse' : 'rect'
        sel.setDraft({ kind, x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      }
    }

    function onPointerMove(e: PointerEvent) {
      const g = drag.current
      const d = docRef.current
      if (!d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)

      // 폴리곤 러버밴드
      if (g.mode === null && toolRef.current === 'lasso' && selRef.current.lassoMode === 'polygon') {
        const cur = selRef.current.draft
        if (cur && cur.kind === 'polygon') {
          sel.setDraft({ ...cur, cursor: [p.x, p.y] })
        }
        return
      }

      if (g.mode === 'move' && g.origMask) {
        const dx = p.x - g.x0
        const dy = p.y - g.y0
        const moved = translateMask(g.origMask, d.width, d.height, dx, dy)
        const bounds = boundsOf(moved, d.width, d.height)
        dispatch({
          type: 'MOVE_SELECTION',
          selection: { ...d.selection, mask: moved, bounds, active: !isEmpty(moved) },
        })
      } else if (g.mode === 'draw') {
        let x1 = p.x
        let y1 = p.y
        // Shift: 정사각형/원, Alt: 중심 기준
        if (e.shiftKey) {
          const s = Math.max(Math.abs(x1 - g.x0), Math.abs(y1 - g.y0))
          x1 = g.x0 + Math.sign(x1 - g.x0) * s
          y1 = g.y0 + Math.sign(y1 - g.y0) * s
        }
        const kind = selRef.current.marqueeMode === 'ellipse' ? 'ellipse' : 'rect'
        if (e.altKey) {
          sel.setDraft({ kind, x0: g.x0 - (x1 - g.x0), y0: g.y0 - (y1 - g.y0), x1, y1 })
        } else {
          sel.setDraft({ kind, x0: g.x0, y0: g.y0, x1, y1 })
        }
      } else if (g.mode === 'lasso') {
        const cur = selRef.current.draft
        if (cur && cur.kind === 'lasso') {
          const last = cur.points[cur.points.length - 1]
          if (Math.hypot(p.x - last[0], p.y - last[1]) >= 1.5) {
            sel.setDraft({ kind: 'lasso', points: [...cur.points, [p.x, p.y]] })
          }
        }
      }
    }

    function onPointerUp(e: PointerEvent) {
      const g = drag.current
      const d = docRef.current
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      if (!d) {
        drag.current.mode = null
        return
      }

      if (g.mode === 'move') {
        dispatch({ type: 'COMMIT_SELECTION', label: '선택 영역 이동' })
      } else if (g.mode === 'draw') {
        const cur = selRef.current.draft
        if (cur && (cur.kind === 'rect' || cur.kind === 'ellipse')) {
          const r = norm(cur.x0, cur.y0, cur.x1, cur.y1)
          if (r.width < 1 || r.height < 1) {
            // 클릭만 한 경우: new 면 선택 해제
            if (selRef.current.operation === 'new' && d.selection.active) {
              dispatch({
                type: 'SET_SELECTION',
                selection: emptySelection(d.width, d.height),
                label: '선택 해제',
              })
            }
          } else {
            const shape = cur.kind === 'ellipse' ? ellipseMask(d.width, d.height, r) : rectMask(d.width, d.height, r)
            commitShape(shape, cur.kind === 'ellipse' ? '타원 선택' : '사각형 선택')
          }
        }
        sel.setDraft(null)
      } else if (g.mode === 'lasso') {
        const cur = selRef.current.draft
        if (cur && cur.kind === 'lasso' && cur.points.length >= 3) {
          commitShape(polygonMask(d.width, d.height, cur.points), '올가미 선택')
        }
        sel.setDraft(null)
      }
      drag.current.mode = null
    }

    function onDblClick() {
      // 폴리곤 완료
      if (toolRef.current === 'lasso' && selRef.current.lassoMode === 'polygon') {
        const d = docRef.current
        const cur = selRef.current.draft
        if (d && cur && cur.kind === 'polygon' && cur.points.length >= 3) {
          commitShape(polygonMask(d.width, d.height, cur.points), '다각형 선택')
        }
        sel.setDraft(null)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    el.addEventListener('dblclick', onDblClick)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('dblclick', onDblClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch])

  // ---- 키보드 ----
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      const d = docRef.current
      const ctrl = e.ctrlKey || e.metaKey
      const s = selRef.current

      // 도구 전환 M / L
      if (!ctrl && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'marquee' })
        s.setMarqueeMode(e.shiftKey ? 'ellipse' : 'rectangle')
        return
      }
      if (!ctrl && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'lasso' })
        s.setLassoMode(e.shiftKey ? 'polygon' : 'lasso')
        return
      }
      if (!d) return

      // Ctrl+A 전체 선택
      if (ctrl && (e.key === 'a' || e.key === 'A') && !e.shiftKey) {
        e.preventDefault()
        const mask = allMask(d.width, d.height)
        dispatch({
          type: 'SET_SELECTION',
          selection: {
            ...emptySelection(d.width, d.height),
            active: true,
            mask,
            bounds: { x: 0, y: 0, width: d.width, height: d.height },
            feather: s.feather,
            antiAlias: s.antiAlias,
          },
          label: '모두 선택',
        })
        return
      }
      // Ctrl+D 선택 해제
      if (ctrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        if (d.selection.active) {
          dispatch({
            type: 'SET_SELECTION',
            selection: emptySelection(d.width, d.height),
            label: '선택 해제',
          })
        }
        return
      }
      // Ctrl+Shift+I 반전
      if (ctrl && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        if (d.selection.active && d.selection.mask) {
          const inv = invertMask(d.selection.mask)
          dispatch({
            type: 'SET_SELECTION',
            selection: {
              ...d.selection,
              mask: inv,
              bounds: boundsOf(inv, d.width, d.height),
              active: !isEmpty(inv),
            },
            label: '선택 반전',
          })
        }
        return
      }
      // ESC: 진행 중 draft 취소
      if (e.key === 'Escape' && s.draft) {
        e.preventDefault()
        s.setDraft(null)
        return
      }
      // Backspace: 폴리곤 마지막 점 제거
      if (e.key === 'Backspace' && s.draft && s.draft.kind === 'polygon') {
        e.preventDefault()
        const pts = s.draft.points.slice(0, -1)
        if (pts.length === 0) s.setDraft(null)
        else s.setDraft({ ...s.draft, points: pts })
        return
      }
      // Enter: 폴리곤 완료
      if (e.key === 'Enter' && s.draft && s.draft.kind === 'polygon' && s.draft.points.length >= 3) {
        e.preventDefault()
        const mask = polygonMask(d.width, d.height, s.draft.points)
        const combined = combine(d.selection.mask, mask, s.operation)
        dispatch({
          type: 'SET_SELECTION',
          selection: {
            ...d.selection,
            mode: 'polygon',
            mask: combined,
            bounds: boundsOf(combined, d.width, d.height),
            active: !isEmpty(combined),
            operation: s.operation,
          },
          label: '다각형 선택',
        })
        s.setDraft(null)
        return
      }
      // Delete: 선택 영역이 있으면 활성 레이어의 선택 픽셀 삭제
      if ((e.key === 'Delete' || e.key === 'Backspace') && d.selection.active && d.selection.mask) {
        const layer = d.layers.find((l) => l.id === d.activeLayerId)
        if (layer && !layer.locked && layer.type !== 'background' && layer.bitmap) {
          e.preventDefault()
          const erased = eraseSelection(layer, d.selection.mask, d.width, d.height)
          if (erased) {
            dispatch({
              type: 'APPLY_LAYERS',
              id: d.id,
              layers: d.layers.map((l) => (l.id === layer.id ? { ...l, bitmap: erased } : l)),
              label: '선택 영역 삭제',
            })
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}

/** 선택 영역 픽셀을 지운 새 비트맵 캔버스 생성 (회전 0 가정) */
function eraseSelection(
  layer: Layer,
  mask: Uint8Array,
  docW: number,
  docH: number,
): HTMLCanvasElement | null {
  const lw = Math.round(layer.width || 0)
  const lh = Math.round(layer.height || 0)
  if (lw <= 0 || lh <= 0 || !layer.bitmap) return null
  const canvas = document.createElement('canvas')
  canvas.width = lw
  canvas.height = lh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(layer.bitmap, 0, 0, lw, lh)

  // 선택 마스크(doc 좌표)를 레이어 로컬로 옮겨 알파 캔버스 생성
  const selCanvas = document.createElement('canvas')
  selCanvas.width = lw
  selCanvas.height = lh
  const sctx = selCanvas.getContext('2d')
  if (!sctx) return null
  const img = sctx.createImageData(lw, lh)
  const ox = Math.round(layer.x)
  const oy = Math.round(layer.y)
  for (let y = 0; y < lh; y++) {
    const dy = y + oy
    if (dy < 0 || dy >= docH) continue
    for (let x = 0; x < lw; x++) {
      const dx = x + ox
      if (dx < 0 || dx >= docW) continue
      if (mask[dy * docW + dx]) {
        const i = (y * lw + x) * 4
        img.data[i + 3] = 255
      }
    }
  }
  sctx.putImageData(img, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(selCanvas, 0, 0)
  return canvas
}
