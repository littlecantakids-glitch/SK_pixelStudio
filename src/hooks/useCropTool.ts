import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useCropStore } from '../store/cropStore'
import { straightenAngle } from '../engine/cropEngine'
import type { OpenDocument, Rect } from '../types'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function handlePos(box: Rect, h: HandleId): { x: number; y: number } {
  const { x, y, width: w, height: hh } = box
  switch (h) {
    case 'nw': return { x, y }
    case 'n': return { x: x + w / 2, y }
    case 'ne': return { x: x + w, y }
    case 'e': return { x: x + w, y: y + hh / 2 }
    case 'se': return { x: x + w, y: y + hh }
    case 's': return { x: x + w / 2, y: y + hh }
    case 'sw': return { x, y: y + hh }
    case 'w': return { x, y: y + hh / 2 }
  }
}

/**
 * Crop Tool — Photoshop Crop & Straighten.
 * 핸들 Drag = 크기 조절, 내부 Drag = 이동, 외부 Drag = 회전, Straighten = 수평선 Drag.
 * Commit 전까지 Layer 를 수정하지 않는다 (Overlay + store 만 변경, Enter/DblClick 시 CROP dispatch).
 */
export function useCropTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const crop = useCropStore()

  const toolRef = useRef(activeTool)
  const docRef = useRef<OpenDocument | null>(doc)
  const cropRef = useRef(crop)
  toolRef.current = activeTool
  docRef.current = doc
  cropRef.current = crop

  const spaceRef = useRef(false)
  const drag = useRef<{
    mode: 'handle' | 'move' | 'rotate' | 'straighten' | null
    handle: HandleId | null
    start: { x: number; y: number }
    startBox: Rect
    startAngle: number
    startPointerAngle: number
  }>({ mode: null, handle: null, start: { x: 0, y: 0 }, startBox: { x: 0, y: 0, width: 0, height: 0 }, startAngle: 0, startPointerAngle: 0 })

  const commit = () => {
    const c = cropRef.current
    if (!c.active) return
    dispatch({ type: 'CROP', box: c.box, angle: c.angle, deleteCropped: c.deleteCropped })
    c.cancel()
  }

  // Crop 세션 초기화/종료
  useEffect(() => {
    if (activeTool === 'crop') {
      if (doc && (!crop.active || crop.docId !== doc.id)) {
        crop.begin(doc.id, { x: 0, y: 0, width: doc.width, height: doc.height })
      }
    } else if (crop.active) {
      crop.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, doc?.id])

  // Space 추적
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
    const tol = () => 9 / Math.max(0.01, vp.getScale())

    function begin(e: PointerEvent) {
      if (toolRef.current !== 'crop' || e.button !== 0 || spaceRef.current) return
      const c = cropRef.current
      if (!c.active) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const box = c.box
      const t = tol()

      if (c.straighten) {
        drag.current = { mode: 'straighten', handle: null, start: p, startBox: box, startAngle: c.angle, startPointerAngle: 0 }
        el!.setPointerCapture(e.pointerId)
        return
      }

      // 핸들 히트 테스트
      for (const h of HANDLES) {
        const hp = handlePos(box, h)
        if (Math.abs(p.x - hp.x) <= t && Math.abs(p.y - hp.y) <= t) {
          drag.current = { mode: 'handle', handle: h, start: p, startBox: box, startAngle: c.angle, startPointerAngle: 0 }
          el!.setPointerCapture(e.pointerId)
          return
        }
      }

      const inside = p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height
      if (inside) {
        drag.current = { mode: 'move', handle: null, start: p, startBox: box, startAngle: c.angle, startPointerAngle: 0 }
      } else {
        const cx = box.x + box.width / 2
        const cy = box.y + box.height / 2
        drag.current = {
          mode: 'rotate',
          handle: null,
          start: p,
          startBox: box,
          startAngle: c.angle,
          startPointerAngle: Math.atan2(p.y - cy, p.x - cx),
        }
      }
      el!.setPointerCapture(e.pointerId)
    }

    function move(e: PointerEvent) {
      const dg = drag.current
      if (!dg.mode) return
      const c = cropRef.current
      const p = vp.screenToCanvas(e.clientX, e.clientY)

      if (dg.mode === 'move') {
        c.setBox({ ...dg.startBox, x: dg.startBox.x + (p.x - dg.start.x), y: dg.startBox.y + (p.y - dg.start.y) })
        return
      }
      if (dg.mode === 'rotate') {
        const cx = dg.startBox.x + dg.startBox.width / 2
        const cy = dg.startBox.y + dg.startBox.height / 2
        const a = Math.atan2(p.y - cy, p.x - cx)
        c.setAngle(dg.startAngle + ((a - dg.startPointerAngle) * 180) / Math.PI)
        return
      }
      if (dg.mode === 'straighten') {
        // 미리보기: 실시간 각도 계산
        c.setAngle(straightenAngle(dg.start.x, dg.start.y, p.x, p.y))
        return
      }
      if (dg.mode === 'handle' && dg.handle) {
        const b = dg.startBox
        let x0 = b.x
        let y0 = b.y
        let x1 = b.x + b.width
        let y1 = b.y + b.height
        if (dg.handle.includes('w')) x0 = p.x
        if (dg.handle.includes('e')) x1 = p.x
        if (dg.handle.includes('n')) y0 = p.y
        if (dg.handle.includes('s')) y1 = p.y
        const nx = Math.min(x0, x1)
        const ny = Math.min(y0, y1)
        c.setBox({ x: nx, y: ny, width: Math.max(8, Math.abs(x1 - x0)), height: Math.max(8, Math.abs(y1 - y0)) })
      }
    }

    function end(e: PointerEvent) {
      if (!drag.current.mode) return
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      // Straighten 은 한 번 쓰고 모드 해제
      if (drag.current.mode === 'straighten') cropRef.current.setStraighten(false)
      drag.current.mode = null
    }

    function dbl() {
      if (toolRef.current === 'crop') commit()
    }

    el.addEventListener('pointerdown', begin)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    el.addEventListener('dblclick', dbl)
    return () => {
      el.removeEventListener('pointerdown', begin)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      el.removeEventListener('dblclick', dbl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch])

  // 키보드: C 도구, Enter 커밋, ESC 취소(전체 복귀)
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C') && !e.shiftKey) {
        // Ctrl+C 는 복사이므로 제외 (위에서 ctrl 걸러짐)
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'crop' })
        return
      }
      if (toolRef.current !== 'crop' || !cropRef.current.active) return
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        const d = docRef.current
        if (d) cropRef.current.begin(d.id, { x: 0, y: 0, width: d.width, height: d.height })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])
}
