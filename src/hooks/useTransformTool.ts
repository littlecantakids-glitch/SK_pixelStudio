import { useCallback, useEffect, useRef } from 'react'
import { useTransformStore } from '../store/transformStore'
import { rotateBox, scaleBox, type Box, type Handle } from '../engine/transformEngine'

type ViewportApi = {
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

export type GestureMode = 'move' | 'scale' | 'rotate' | 'pivot'

const CORNERS: Handle[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export function useTransformTool(vp: ViewportApi) {
  const transform = useTransformStore()

  // 최신 상태 참조
  const tRef = useRef(transform)
  tRef.current = transform

  const gesture = useRef<{
    active: boolean
    mode: GestureMode
    handle: Handle | null
    startX: number
    startY: number
    box0: Box | null
    pivot0: { x: number; y: number } | null
  }>({ active: false, mode: 'move', handle: null, startX: 0, startY: 0, box0: null, pivot0: null })

  const beginGesture = useCallback(
    (mode: GestureMode, handle: Handle | null, clientX: number, clientY: number) => {
      const t = tRef.current
      if (!t.active || !t.box) return
      const p = vp.screenToCanvas(clientX, clientY)
      gesture.current = {
        active: true,
        mode,
        handle,
        startX: p.x,
        startY: p.y,
        box0: t.box,
        pivot0: t.pivot,
      }
    },
    [vp],
  )

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const g = gesture.current
      if (!g.active || !g.box0) return
      const t = tRef.current
      const p = vp.screenToCanvas(e.clientX, e.clientY)

      if (g.mode === 'move') {
        let dx = p.x - g.startX
        let dy = p.y - g.startY
        // Shift: 더 많이 움직인 축으로 고정
        if (e.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0
          else dx = 0
        }
        t.setBox({ ...g.box0, cx: g.box0.cx + dx, cy: g.box0.cy + dy })
        if (g.pivot0) t.setPivot(g.pivot0.x + dx, g.pivot0.y + dy)
      } else if (g.mode === 'scale' && g.handle) {
        const isCorner = CORNERS.includes(g.handle)
        const keepAspect = isCorner ? !e.shiftKey : e.shiftKey
        const next = scaleBox(g.box0, g.handle, p.x, p.y, {
          keepAspect,
          fromCenter: e.altKey,
        })
        t.setBox(next)
        t.setPivot(next.cx, next.cy)
      } else if (g.mode === 'rotate' && g.pivot0) {
        const next = rotateBox(
          g.box0,
          g.startX,
          g.startY,
          p.x,
          p.y,
          g.pivot0.x,
          g.pivot0.y,
          e.shiftKey,
        )
        t.setBox(next)
      } else if (g.mode === 'pivot') {
        t.setPivot(p.x, p.y)
      }
    }

    function onUp() {
      gesture.current.active = false
    }

    function isTyping(target: EventTarget | null) {
      const tag = (target as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }

    function onKey(e: KeyboardEvent) {
      const t = tRef.current
      // Shift+Ctrl+T: 자유 변형 시작 (T 는 문자 도구가 사용하므로 이관, 입력 중 제외)
      if ((e.key === 't' || e.key === 'T') && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        if (isTyping(e.target)) return
        e.preventDefault()
        if (!t.active) t.begin()
        return
      }
      if (!t.active) return
      if (e.key === 'Enter') {
        e.preventDefault()
        t.commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        t.cancel()
      } else if (e.key.startsWith('Arrow') && t.box) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        let dx = 0
        let dy = 0
        if (e.key === 'ArrowLeft') dx = -step
        else if (e.key === 'ArrowRight') dx = step
        else if (e.key === 'ArrowUp') dy = -step
        else if (e.key === 'ArrowDown') dy = step
        t.setBox({ ...t.box, cx: t.box.cx + dx, cy: t.box.cy + dy })
        if (t.pivot) t.setPivot(t.pivot.x + dx, t.pivot.y + dy)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [vp])

  return { beginGesture }
}
