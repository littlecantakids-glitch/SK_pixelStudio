import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useMoveStore } from '../store/moveStore'
import { useOpenStore } from '../store/openStore'
import { useTransformStore } from '../store/transformStore'
import type { Layer, OpenDocument } from '../types'
import {
  canMoveLayer,
  constrainAxis,
  hitTestLayer,
  screenDeltaToCanvas,
} from '../tools/MoveTool'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

/**
 * Move Tool: Active Layer(들)를 드래그/화살표로 이동한다.
 * Canvas/Viewport는 움직이지 않으며 layer.x / layer.y 만 변경한다.
 * 드래그/키 이동 종료 시에만 History를 1개 기록한다.
 */
export function useMoveTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { autoSelect, setDragging } = useMoveStore()
  const { toast } = useOpenStore()
  const transform = useTransformStore()

  // 최신 값을 참조로 유지 (리스너 재바인딩 최소화)
  const toolRef = useRef(activeTool)
  const docRef = useRef<OpenDocument | null>(doc)
  const autoRef = useRef(autoSelect)
  const transformActiveRef = useRef(transform.active)
  toolRef.current = activeTool
  docRef.current = doc
  autoRef.current = autoSelect
  transformActiveRef.current = transform.active

  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    appliedX: 0,
    appliedY: 0,
    before: [] as Layer[],
    beforeActiveId: '',
  })
  const spaceRef = useRef(false)

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }

    function onPointerDown(e: PointerEvent) {
      if (toolRef.current !== 'move' || e.button !== 0 || spaceRef.current) return
      if (transformActiveRef.current) return
      const d = docRef.current
      if (!d) return

      let target = d.layers.find((l) => l.id === d.activeLayerId) ?? null
      if (autoRef.current) {
        const { x, y } = vp.screenToCanvas(e.clientX, e.clientY)
        const hit = hitTestLayer(d.layers, x, y)
        if (hit) {
          dispatch({ type: 'SELECT_LAYER', id: hit.id })
          target = hit
        }
      }

      if (!canMoveLayer(target)) {
        if (target && (target.locked || target.type === 'background')) {
          toast('Layer is locked.', 'error')
        }
        return
      }

      drag.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        appliedX: 0,
        appliedY: 0,
        before: d.layers,
        beforeActiveId: d.activeLayerId,
      }
      setDragging(true)
      el!.setPointerCapture(e.pointerId)
    }

    function onPointerMove(e: PointerEvent) {
      const s = drag.current
      if (!s.active) return
      let totalDx = e.clientX - s.startX
      let totalDy = e.clientY - s.startY
      if (e.shiftKey) {
        const c = constrainAxis(totalDx, totalDy)
        totalDx = c.dx
        totalDy = c.dy
      }
      const { dx, dy } = screenDeltaToCanvas(totalDx, totalDy, vp.getScale())
      const ddx = dx - s.appliedX
      const ddy = dy - s.appliedY
      if (ddx !== 0 || ddy !== 0) {
        dispatch({ type: 'MOVE_ACTIVE', dx: ddx, dy: ddy })
        s.appliedX = dx
        s.appliedY = dy
      }
    }

    function onPointerUp(e: PointerEvent) {
      const s = drag.current
      if (!s.active) return
      s.active = false
      setDragging(false)
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      if (s.appliedX !== 0 || s.appliedY !== 0) {
        dispatch({ type: 'COMMIT_MOVE' })
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') spaceRef.current = true
      if (transformActiveRef.current) return // 변형 중에는 이동 도구 화살표 비활성
      if (toolRef.current !== 'move' || isTyping(e.target)) return
      const d = docRef.current
      if (!d) return
      let dx = 0
      let dy = 0
      const step = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      else return
      const active = d.layers.find((l) => l.id === d.activeLayerId)
      if (!canMoveLayer(active)) {
        if (active && (active.locked || active.type === 'background')) {
          toast('Layer is locked.', 'error')
        }
        return
      }
      e.preventDefault()
      dispatch({ type: 'MOVE_ACTIVE', dx, dy })
      dispatch({ type: 'COMMIT_MOVE' })
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') spaceRef.current = false
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [vp, dispatch, toast, setDragging])
}
