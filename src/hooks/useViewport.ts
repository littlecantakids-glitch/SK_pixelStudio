import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorDispatch } from '../state'
import type { ToolId } from '../types'
import { clampScale } from '../types/viewport'

type Cam = { offsetX: number; offsetY: number; scale: number }
type CursorKind =
  | 'default'
  | 'grab'
  | 'grabbing'
  | 'zoom-in'
  | 'zoom-out'
  | 'move'
  | 'crosshair'
  | 'text'

type Args = {
  docId: string | null
  docWidth: number
  docHeight: number
  activeTool: ToolId
}

/**
 * Photoshop식 Viewport 카메라. Canvas는 움직이지 않고 카메라(offset/scale)만 이동.
 * React state는 최소화하고 refs + requestAnimationFrame 으로 부드럽게 구동한다.
 */
export function useViewport({ docId, docWidth, docHeight, activeTool }: Args) {
  const dispatch = useEditorDispatch()

  const containerRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<HTMLDivElement>(null)
  const hThumbRef = useRef<HTMLDivElement>(null)
  const vThumbRef = useRef<HTMLDivElement>(null)

  // 카메라 상태(refs) — 렌더 유발 없이 매 프레임 갱신
  const cur = useRef<Cam>({ offsetX: 0, offsetY: 0, scale: 1 })
  const tgt = useRef<Cam>({ offsetX: 0, offsetY: 0, scale: 1 })
  const rafId = useRef<number | null>(null)
  const lastPct = useRef<number>(-1)

  // 문서별 카메라 위치 보존
  const camStore = useRef<Map<string, Cam>>(new Map())

  // 인터랙션 refs
  const activeToolRef = useRef<ToolId>(activeTool)
  const spaceRef = useRef(false)
  const altRef = useRef(false)
  const panningRef = useRef(false)
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  const [scalePercent, setScalePercent] = useState(100)
  const [cursor, setCursor] = useState<CursorKind>('default')

  useEffect(() => {
    activeToolRef.current = activeTool
    setCursor(computeCursor())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])

  function computeCursor(): CursorKind {
    if (panningRef.current) return 'grabbing'
    if (spaceRef.current) return 'grab'
    const t = activeToolRef.current
    if (t === 'hand') return 'grab'
    if (t === 'zoom') return altRef.current ? 'zoom-out' : 'zoom-in'
    if (t === 'move') return 'move'
    if (t === 'text') return 'text'
    if (
      t === 'marquee' ||
      t === 'lasso' ||
      t === 'brush' ||
      t === 'eraser' ||
      t === 'stamp' ||
      t === 'pen' ||
      t === 'healing' ||
      t === 'shape' ||
      t === 'gradient'
    )
      return 'crosshair'
    return 'default'
  }

  const size = useCallback(() => {
    const el = containerRef.current
    return { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 }
  }, [])

  const updateScrollbars = useCallback(
    (c: Cam) => {
      const { w: cw, h: ch } = size()
      if (!cw || !ch) return
      // 가로
      const visL = -c.offsetX / c.scale
      const visR = (cw - c.offsetX) / c.scale
      const cMinX = Math.min(0, visL)
      const cMaxX = Math.max(docWidth, visR)
      const lenX = cMaxX - cMinX || 1
      if (hThumbRef.current) {
        hThumbRef.current.style.left = `${((visL - cMinX) / lenX) * 100}%`
        hThumbRef.current.style.width = `${((visR - visL) / lenX) * 100}%`
      }
      // 세로
      const visT = -c.offsetY / c.scale
      const visB = (ch - c.offsetY) / c.scale
      const cMinY = Math.min(0, visT)
      const cMaxY = Math.max(docHeight, visB)
      const lenY = cMaxY - cMinY || 1
      if (vThumbRef.current) {
        vThumbRef.current.style.top = `${((visT - cMinY) / lenY) * 100}%`
        vThumbRef.current.style.height = `${((visB - visT) / lenY) * 100}%`
      }
    },
    [docWidth, docHeight, size],
  )

  const apply = useCallback(() => {
    const c = cur.current
    if (cameraRef.current) {
      cameraRef.current.style.transform = `translate(${c.offsetX}px, ${c.offsetY}px) scale(${c.scale})`
    }
    updateScrollbars(c)
    const pct = Math.round(c.scale * 100)
    if (pct !== lastPct.current) {
      lastPct.current = pct
      setScalePercent(pct)
    }
  }, [updateScrollbars])

  const onSettle = useCallback(() => {
    if (docId) camStore.current.set(docId, { ...cur.current })
    // 탭/상태 표시용 문서 zoom 동기화 (저빈도)
    dispatch({ type: 'SET_ZOOM', zoom: cur.current.scale * 100 })
  }, [docId, dispatch])

  const tick = useCallback(() => {
    const c = cur.current
    const t = tgt.current
    c.offsetX += (t.offsetX - c.offsetX) * 0.25
    c.offsetY += (t.offsetY - c.offsetY) * 0.25
    c.scale += (t.scale - c.scale) * 0.25
    const done =
      Math.abs(t.offsetX - c.offsetX) < 0.3 &&
      Math.abs(t.offsetY - c.offsetY) < 0.3 &&
      Math.abs(t.scale - c.scale) < 0.0005
    if (done) {
      c.offsetX = t.offsetX
      c.offsetY = t.offsetY
      c.scale = t.scale
    }
    apply()
    if (done) {
      rafId.current = null
      onSettle()
    } else {
      rafId.current = requestAnimationFrame(tick)
    }
  }, [apply, onSettle])

  const ensureRAF = useCallback(() => {
    if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
  }, [tick])

  const setImmediate = useCallback(
    (cam: Cam) => {
      cur.current = { ...cam }
      tgt.current = { ...cam }
      apply()
    },
    [apply],
  )

  const fitToScreen = useCallback(
    (animate = true) => {
      const { w: cw, h: ch } = size()
      if (!cw || !ch || !docWidth || !docHeight) return
      const s = clampScale(Math.min(cw / docWidth, ch / docHeight) * 0.92)
      const cam: Cam = {
        scale: s,
        offsetX: (cw - docWidth * s) / 2,
        offsetY: (ch - docHeight * s) / 2,
      }
      if (animate) {
        tgt.current = cam
        ensureRAF()
      } else {
        setImmediate(cam)
        onSettle()
      }
    },
    [size, docWidth, docHeight, ensureRAF, setImmediate, onSettle],
  )

  const actualSize = useCallback(() => {
    const { w: cw, h: ch } = size()
    tgt.current = {
      scale: 1,
      offsetX: (cw - docWidth) / 2,
      offsetY: (ch - docHeight) / 2,
    }
    ensureRAF()
  }, [size, docWidth, docHeight, ensureRAF])

  // 특정 화면 좌표(sx, sy)를 기준으로 확대/축소 (마우스 위치 고정)
  const zoomAtPoint = useCallback(
    (newScale: number, sx: number, sy: number) => {
      const base = tgt.current
      const s = clampScale(newScale)
      const cx = (sx - base.offsetX) / base.scale
      const cy = (sy - base.offsetY) / base.scale
      tgt.current = { scale: s, offsetX: sx - cx * s, offsetY: sy - cy * s }
      ensureRAF()
    },
    [ensureRAF],
  )

  const zoomInCenter = useCallback(() => {
    const { w, h } = size()
    zoomAtPoint(tgt.current.scale * 1.3, w / 2, h / 2)
  }, [size, zoomAtPoint])

  // 화면(client) 좌표 → 캔버스(문서) 좌표 역변환. 도구(Move 등)에서 사용.
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const c = cur.current
    return {
      x: (clientX - r.left - c.offsetX) / c.scale,
      y: (clientY - r.top - c.offsetY) / c.scale,
    }
  }, [])

  const getScale = useCallback(() => cur.current.scale, [])

  const zoomOutCenter = useCallback(() => {
    const { w, h } = size()
    zoomAtPoint(tgt.current.scale / 1.3, w / 2, h / 2)
  }, [size, zoomAtPoint])

  // 문서 전환/크기 변경 시: 저장된 카메라 복원 or Fit
  useEffect(() => {
    if (!docId) return
    const el = containerRef.current
    if (!el) return
    const saved = camStore.current.get(docId)
    if (saved) {
      setImmediate(saved)
    } else {
      // 레이아웃 확정 후 fit
      requestAnimationFrame(() => fitToScreen(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, docWidth, docHeight])

  // 이벤트 바인딩 (문서별로 1회) — 인터랙션 입력은 ref로 읽어 재바인딩 최소화
  useEffect(() => {
    const el = containerRef.current
    if (!el || !docId) return

    const rect = () => el.getBoundingClientRect()

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const r = rect()
      const sx = e.clientX - r.left
      const sy = e.clientY - r.top
      if (e.ctrlKey || e.metaKey) {
        // 마우스 위치 기준 줌 (한 스텝당 완만하게, 과도한 점프 방지)
        let factor = Math.exp(-e.deltaY * 0.0015)
        factor = Math.min(1.2, Math.max(0.83, factor))
        zoomAtPoint(tgt.current.scale * factor, sx, sy)
      } else {
        let dx = e.deltaX
        let dy = e.deltaY
        if (e.shiftKey && dx === 0) {
          dx = dy
          dy = 0
        }
        tgt.current = {
          ...tgt.current,
          offsetX: tgt.current.offsetX - dx,
          offsetY: tgt.current.offsetY - dy,
        }
        ensureRAF()
      }
    }

    function onPointerDown(e: PointerEvent) {
      const tool = activeToolRef.current
      const wantPan = e.button === 1 || spaceRef.current || tool === 'hand'
      if (wantPan) {
        e.preventDefault()
        panningRef.current = true
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          ox: cur.current.offsetX,
          oy: cur.current.offsetY,
        }
        el!.setPointerCapture(e.pointerId)
        setCursor('grabbing')
      } else if (tool === 'zoom' && e.button === 0) {
        const r = rect()
        const factor = e.altKey ? 1 / 2 : 2
        zoomAtPoint(tgt.current.scale * factor, e.clientX - r.left, e.clientY - r.top)
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!panningRef.current) return
      const nx = panStart.current.ox + (e.clientX - panStart.current.x)
      const ny = panStart.current.oy + (e.clientY - panStart.current.y)
      cur.current.offsetX = nx
      cur.current.offsetY = ny
      tgt.current.offsetX = nx
      tgt.current.offsetY = ny
      apply()
    }

    function endPan(e: PointerEvent) {
      if (!panningRef.current) return
      panningRef.current = false
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      onSettle()
      setCursor(computeCursor())
    }

    function onDblClick() {
      const tool = activeToolRef.current
      if (tool === 'hand') fitToScreen(true)
      else if (tool === 'zoom') actualSize()
    }

    function isTyping(t: EventTarget | null) {
      const el = t as HTMLElement | null
      const tag = el?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        fitToScreen(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        actualSize()
      } else if (e.code === 'Space' && !spaceRef.current) {
        e.preventDefault()
        spaceRef.current = true
        setCursor('grab')
      } else if (e.key === 'Alt') {
        altRef.current = true
        setCursor(computeCursor())
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        spaceRef.current = false
        setCursor(computeCursor())
      } else if (e.key === 'Alt') {
        altRef.current = false
        setCursor(computeCursor())
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endPan)
    el.addEventListener('dblclick', onDblClick)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endPan)
      el.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, docWidth, docHeight])

  // 언마운트 시 rAF 정리
  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current)
    }
  }, [])

  return {
    containerRef,
    cameraRef,
    hThumbRef,
    vThumbRef,
    scalePercent,
    cursor,
    fitToScreen,
    actualSize,
    zoomInCenter,
    zoomOutCenter,
    screenToCanvas,
    getScale,
  }
}
