import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useShapeStore } from '../store/shapeStore'
import type { Layer, OpenDocument, ShapeKind, Vec2 } from '../types'
import {
  createShapeLayer,
  defaultFill,
  defaultStroke,
  lineShapeGeom,
  nextShapeName,
  rectShapeGeom,
  shapeLabel,
  type ShapeGeom,
} from '../engine/shapeEngine'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

/** Shift+U 로 순환하는 실제 구현 도형 (polygon/custom 은 Flyout 전용) */
const CYCLE: ShapeKind[] = ['rectangle', 'roundRect', 'ellipse', 'line']

/** from 기준 45° 배수 스냅 (Line Shift) */
function snap45(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 0.001) return to
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len }
}

/** Drag 사각형 계산 — Shift=정비율, Alt=중앙 기준 */
function dragRect(start: Vec2, cur: Vec2, shift: boolean, alt: boolean) {
  let dx = cur.x - start.x
  let dy = cur.y - start.y
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    dx = (dx < 0 ? -1 : 1) * m
    dy = (dy < 0 ? -1 : 1) * m
  }
  if (alt) {
    return { x: start.x - Math.abs(dx), y: start.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 }
  }
  return { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), w: Math.abs(dx), h: Math.abs(dy) }
}

/**
 * Shape Tool — Photoshop Vector Shape System.
 * Rectangle / Rounded Rectangle / Ellipse / Line 을 Drag 로 생성한다.
 * 모든 Shape 는 Pen Tool 과 동일한 Path Engine(VectorPath)을 사용하고, Bitmap 이 아닌
 * Vector Layer 로 저장되어 RenderEngine 이 실시간 렌더한다.
 * Shift=정비율/45°스냅, Alt=중앙 기준. Drag 중 실시간 미리보기 → mouseup 시 History 1개.
 */
export function useShapeTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const shapeStore = useShapeStore()

  const docRef = useRef<OpenDocument | null>(doc)
  const toolRef = useRef(activeTool)
  const ssRef = useRef(shapeStore)
  docRef.current = doc
  toolRef.current = activeTool
  ssRef.current = shapeStore

  const spaceRef = useRef(false)

  const drag = useRef<{
    active: boolean
    draftId: string | null
    start: Vec2
    kind: ShapeKind
    committed: boolean
  }>({ active: false, draftId: null, start: { x: 0, y: 0 }, kind: 'rectangle', committed: false })

  /** 현재 store 설정으로 draft 도형 스펙 빌드 */
  const buildLayer = (kind: ShapeKind, geom: ShapeGeom): Layer => {
    const s = ssRef.current
    const d = docRef.current!
    const fill = defaultFill(s.fillColor)
    fill.enabled = s.fillEnabled
    // Line 은 Fill 영역이 없으므로 항상 Stroke 로 그린다 (최소 1px 보장)
    const isLine = kind === 'line'
    const stroke = defaultStroke(
      s.strokeColor,
      isLine ? Math.max(1, s.strokeWidth) : s.strokeWidth,
      s.strokeAlign,
      isLine ? true : s.strokeEnabled,
    )
    return createShapeLayer({
      name: nextShapeName(d.layers, kind),
      geom,
      kind,
      fill,
      stroke,
      radius: kind === 'roundRect' ? s.radius : undefined,
      sides: kind === 'polygon' ? s.sides : undefined,
    })
  }

  const geomFor = (kind: ShapeKind, start: Vec2, cur: Vec2, shift: boolean, alt: boolean): ShapeGeom => {
    if (kind === 'line') {
      const b = shift ? snap45(start, cur) : cur
      return lineShapeGeom(start, b)
    }
    const r = dragRect(start, cur, shift, alt)
    return rectShapeGeom(kind, r.x, r.y, r.w, r.h, ssRef.current.radius)
  }

  // ── Pointer 이벤트 ───────────────────────────────────────────
  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function begin(e: PointerEvent) {
      if (toolRef.current !== 'shape' || e.button !== 0 || spaceRef.current) return
      const d = docRef.current
      if (!d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const kind = ssRef.current.kind
      const start = { x: p.x, y: p.y }
      // 시작 시 최소 크기 draft (Drag 로 확장)
      const geom = kind === 'line' ? lineShapeGeom(start, { x: start.x + 1, y: start.y + 1 }) : rectShapeGeom(kind, start.x, start.y, 1, 1, ssRef.current.radius)
      const layer = buildLayer(kind, geom)
      drag.current = { active: true, draftId: layer.id, start, kind, committed: false }
      dispatch({ type: 'INSERT_SHAPE', layer })
      el!.setPointerCapture(e.pointerId)
    }

    function move(e: PointerEvent) {
      const dg = drag.current
      if (!dg.active || !dg.draftId) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const geom = geomFor(dg.kind, dg.start, { x: p.x, y: p.y }, e.shiftKey, e.altKey)
      dispatch({
        type: 'UPDATE_SHAPE',
        id: dg.draftId,
        patch: {
          x: geom.x,
          y: geom.y,
          width: geom.width,
          height: geom.height,
          shape: patchShapePath(dg.draftId, geom),
        },
      })
    }

    /** draft 레이어의 shape 스펙에 새 path/기하를 반영 (fill/stroke 유지) */
    function patchShapePath(id: string, geom: ShapeGeom) {
      const d = docRef.current
      const layer = d?.layers.find((l) => l.id === id)
      const base = layer?.shape
      if (!base) return undefined
      return { ...base, path: geom.path }
    }

    function end(e: PointerEvent) {
      const dg = drag.current
      if (!dg.active) return
      dg.active = false
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      const d = docRef.current
      const id = dg.draftId
      if (!d || !id) return
      const layer = d.layers.find((l) => l.id === id)
      const w = layer?.width ?? 0
      const h = layer?.height ?? 0
      const tooSmall = dg.kind === 'line' ? w < 2 && h < 2 : w < 2 || h < 2
      if (tooSmall || !layer?.shape) {
        dispatch({ type: 'REMOVE_DRAFT', id })
      } else {
        // 확정 — 현재 상태를 History 1개로 기록
        dispatch({
          type: 'UPDATE_SHAPE',
          id,
          patch: {},
          label: `${shapeLabel(dg.kind)} 만들기`,
        })
      }
      drag.current.draftId = null
    }

    el.addEventListener('pointerdown', begin)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    return () => {
      el.removeEventListener('pointerdown', begin)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch])

  // Space(팬) 추적
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

  // U → Shape Tool, Shift+U → 다음 Shape 순환
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault()
        if (e.shiftKey && toolRef.current === 'shape') {
          const cur = ssRef.current.kind
          const idx = CYCLE.indexOf(cur)
          const next = CYCLE[(idx + 1) % CYCLE.length]
          ssRef.current.setKind(next)
        } else {
          dispatch({ type: 'SET_TOOL', tool: 'shape' })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
