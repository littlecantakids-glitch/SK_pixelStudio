import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { usePathStore } from '../store/pathStore'
import type { OpenDocument, PathPoint, Vec2, VectorPath } from '../types'
import {
  buildPath2D,
  createPoint,
  createWorkPath,
  cubicAt,
  hasHandle,
  hitTestPoints,
  hitTestSegment,
  type PathHit,
} from '../engine/pathEngine'
import { getActiveEngine, type PathAnchorView } from '../engine/renderEngine'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

const WORK_PATH_NAME = '작업 패스'

/** from 기준으로 to 를 45° 배수 방향으로 스냅 (Shift 제약) */
function snap45(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 0.001) return to
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len }
}

const clonePoint = (p: PathPoint): PathPoint => ({
  ...p,
  anchor: { ...p.anchor },
  inHandle: { ...p.inHandle },
  outHandle: { ...p.outHandle },
})
const clonePath = (p: VectorPath): VectorPath => ({ ...p, points: p.points.map(clonePoint) })

/**
 * Pen Tool — Vector Path 생성/편집.
 * Click=Anchor, Drag=Bezier Handle, Alt=Handle 분리, Ctrl=Anchor/Handle 이동,
 * Shift=45° 스냅, 첫 Anchor 클릭=Close, Enter=완료, ESC=취소, Delete=Anchor 삭제, Double Click=완료.
 */
export function usePenTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const pathStore = usePathStore()

  const docRef = useRef<OpenDocument | null>(doc)
  const toolRef = useRef(activeTool)
  const psRef = useRef(pathStore)
  docRef.current = doc
  toolRef.current = activeTool
  psRef.current = pathStore

  const spaceRef = useRef(false)
  const lastCursor = useRef<Vec2 | null>(null)
  const hoverRef = useRef<{ pathId: string; pointId: string } | null>(null)
  /** 현재 빌드 중인 Path id (append 대상). null = 빌드 종료 */
  const building = useRef<string | null>(null)

  const drag = useRef<{
    mode: 'newHandle' | 'anchor' | 'in' | 'out' | null
    pathId: string
    pointId: string
    moved: boolean
    label: string
  }>({ mode: null, pathId: '', pointId: '', moved: false, label: '' })

  const paths = () => docRef.current?.paths ?? []
  const activePath = (): VectorPath | null => {
    const d = docRef.current
    if (!d?.activePathId) return null
    return (d.paths ?? []).find((p) => p.id === d.activePathId) ?? null
  }

  const setLive = (nextPaths: VectorPath[], activePathId?: string | null) =>
    dispatch({ type: 'SET_PATHS', paths: nextPaths, activePathId })
  const commit = (label: string) => dispatch({ type: 'COMMIT_PATHS', label })
  const applyPaths = (nextPaths: VectorPath[], label: string, activePathId?: string | null) =>
    dispatch({ type: 'APPLY_PATHS', paths: nextPaths, activePathId, label })

  const replacePath = (list: VectorPath[], next: VectorPath): VectorPath[] =>
    list.map((p) => (p.id === next.id ? next : p))

  const selectOnly = (path: VectorPath, pointId: string | null): VectorPath => ({
    ...path,
    points: path.points.map((p) => ({ ...p, selected: p.id === pointId })),
  })

  // ── Overlay 빌드 ─────────────────────────────────────────────
  const pushOverlay = () => {
    const engine = getActiveEngine()
    const d = docRef.current
    if (!engine || !d) return
    const isPen = toolRef.current === 'pen'
    const list = (d.paths ?? []).filter((p) => p.visible)
    const active = active_()
    if (!active && !isPen) {
      engine.setPathOverlay(null)
      return
    }
    if (list.length === 0 && !active) {
      engine.setPathOverlay(null)
      return
    }
    const outlines = list.filter((p) => p.id !== active?.id).map((p) => buildPath2D(p))
    const activeOutline = active ? buildPath2D(active) : null

    // Anchor/Handle 은 Pen 도구일 때만 (다른 도구에선 Outline 만)
    const anchors: PathAnchorView[] = []
    if (isPen && active) {
      const hover = hoverRef.current
      for (const pt of active.points) {
        const showHandles = pt.selected || hasHandle(pt, 'in') || hasHandle(pt, 'out')
        anchors.push({
          ax: pt.anchor.x,
          ay: pt.anchor.y,
          inx: pt.inHandle.x,
          iny: pt.inHandle.y,
          hasIn: hasHandle(pt, 'in'),
          outx: pt.outHandle.x,
          outy: pt.outHandle.y,
          hasOut: hasHandle(pt, 'out'),
          showHandles,
          selected: pt.selected,
          hover: hover?.pathId === active.id && hover.pointId === pt.id,
        })
      }
    }

    // 고무줄 미리보기 (빌드 중 + 커서 존재)
    let rubber: { p2d: Path2D } | null = null
    if (
      isPen &&
      active &&
      building.current === active.id &&
      !active.closed &&
      active.points.length > 0 &&
      lastCursor.current &&
      psRef.current.rubberBand &&
      !drag.current.mode
    ) {
      const last = active.points[active.points.length - 1]
      const cur = lastCursor.current
      const p2d = new Path2D()
      p2d.moveTo(last.anchor.x, last.anchor.y)
      if (hasHandle(last, 'out')) p2d.bezierCurveTo(last.outHandle.x, last.outHandle.y, cur.x, cur.y, cur.x, cur.y)
      else p2d.lineTo(cur.x, cur.y)
      rubber = { p2d }
    }

    engine.setPathOverlay({
      screenScale: vp.getScale(),
      outlines,
      activeOutline,
      anchors,
      rubber,
    })
  }
  const active_ = activePath

  // ── Pointer 이벤트 ───────────────────────────────────────────
  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    const tol = () => 7 / Math.max(0.01, vp.getScale())

    function begin(e: PointerEvent) {
      if (toolRef.current !== 'pen' || e.button !== 0 || spaceRef.current) return
      const d = docRef.current
      if (!d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const pos: Vec2 = { x: p.x, y: p.y }
      const ctrl = e.ctrlKey || e.metaKey
      const alt = e.altKey
      const shift = e.shiftKey
      const list = paths()
      const active = active_()

      el!.setPointerCapture(e.pointerId)

      // ── Ctrl: Direct Select (Anchor/Handle 이동) ──────────────
      if (ctrl) {
        for (const path of [active, ...list.filter((x) => x !== active)].filter(Boolean) as VectorPath[]) {
          const hit = hitTestPoints(path, pos, tol())
          if (hit) {
            beginPointDrag(path, hit, false)
            return
          }
        }
        return
      }

      // ── 빌드 중 ───────────────────────────────────────────────
      if (active && building.current === active.id && !active.closed) {
        // 첫 Anchor 클릭 → Close
        const first = active.points[0]
        if (
          active.points.length >= 2 &&
          Math.hypot(pos.x - first.anchor.x, pos.y - first.anchor.y) <= tol()
        ) {
          const closed = selectOnly({ ...clonePath(active), closed: true }, null)
          building.current = null
          applyPaths(replacePath(list, closed), '패스 닫기', active.id)
          drag.current = { mode: null, pathId: '', pointId: '', moved: false, label: '' }
          pushOverlay()
          return
        }

        // Alt: 기존 Anchor 위 → Convert(핸들 정리) / Handle 위 → break
        const ptHit = hitTestPoints(active, pos, tol())
        if (alt && ptHit) {
          beginPointDrag(active, ptHit, true)
          return
        }

        // 자동 삭제: 기존 Anchor 위 클릭 → Delete Anchor
        if (psRef.current.autoAddDelete && ptHit?.kind === 'anchor') {
          const np = { ...clonePath(active), points: active.points.filter((x) => x.id !== ptHit.pointId) }
          if (np.points.length === 0) {
            building.current = null
            applyPaths(list.filter((x) => x.id !== active.id), 'Anchor 삭제', null)
          } else {
            applyPaths(replacePath(list, np), 'Anchor 삭제', active.id)
          }
          drag.current = { mode: null, pathId: '', pointId: '', moved: false, label: '' }
          pushOverlay()
          return
        }

        // 자동 추가: 세그먼트 위 클릭 → Add Anchor
        const segHit = hitTestSegment(active, pos, tol())
        if (psRef.current.autoAddDelete && segHit?.kind === 'segment') {
          addAnchorOnSegment(active, segHit, list)
          return
        }

        // 기본: 새 Anchor 추가 + Handle Drag 시작
        appendAnchor(active, pos, shift, list)
        return
      }

      // ── 빌드 아님 ─────────────────────────────────────────────
      // 빈 활성 패스(패널에서 새로 만든)가 있으면 거기에 이어서 그린다
      if (active && active.points.length === 0) {
        building.current = active.id
        appendAnchor(active, pos, shift, list)
        return
      }
      // 새 Work Path 시작 (기존 Work Path 는 교체)
      const keep = list.filter((x) => x.name !== WORK_PATH_NAME)
      const path = createWorkPath()
      const first = createPoint(pos)
      first.selected = true
      path.points = [first]
      const next = [...keep, path]
      building.current = path.id
      drag.current = { mode: 'newHandle', pathId: path.id, pointId: first.id, moved: false, label: '패스 만들기' }
      setLive(next, path.id)
      pushOverlay()
    }

    /** 세그먼트 위 t 지점에 Anchor 추가 (곡선 분할 근사 — 위치만 삽입) */
    function addAnchorOnSegment(
      path: VectorPath,
      seg: Extract<PathHit, { kind: 'segment' }>,
      list: VectorPath[],
    ) {
      const i = seg.index
      const a = path.points[i]
      const b = path.points[(i + 1) % path.points.length]
      const at = cubicAt(a.anchor, a.outHandle, b.inHandle, b.anchor, seg.t)
      const np = clonePath(path)
      const insert = createPoint(at, 'smooth')
      insert.selected = true
      np.points.splice(i + 1, 0, insert)
      np.points = np.points.map((x) => ({ ...x, selected: x.id === insert.id }))
      applyPaths(replacePath(list, np), 'Anchor 추가', path.id)
      drag.current = { mode: null, pathId: '', pointId: '', moved: false, label: '' }
      pushOverlay()
    }

    /** 새 Anchor 를 끝에 추가하고 Handle Drag 준비 */
    function appendAnchor(path: VectorPath, pos: Vec2, shift: boolean, list: VectorPath[]) {
      const np = clonePath(path)
      const prev = np.points[np.points.length - 1]
      const at = shift && prev ? snap45(prev.anchor, pos) : pos
      const pt = createPoint(at)
      np.points.push(pt)
      np.points = np.points.map((x) => ({ ...x, selected: x.id === pt.id }))
      drag.current = {
        mode: 'newHandle',
        pathId: path.id,
        pointId: pt.id,
        moved: false,
        label: np.points.length <= 1 ? '패스 만들기' : 'Anchor 추가',
      }
      setLive(replacePath(list, np), path.id)
      pushOverlay()
    }

    /** Anchor/Handle Drag 시작 (Ctrl 이동 또는 Alt break) */
    function beginPointDrag(path: VectorPath, hit: PathHit, alt: boolean) {
      if (!hit) return
      const selected = selectOnly(clonePath(path), 'pointId' in hit ? hit.pointId : null)
      const list = paths()
      const mode = hit.kind === 'anchor' ? 'anchor' : hit.kind === 'in' ? 'in' : 'out'
      drag.current = {
        mode: mode as 'anchor' | 'in' | 'out',
        pathId: path.id,
        pointId: 'pointId' in hit ? hit.pointId : '',
        moved: false,
        label: alt ? '점 변환' : mode === 'anchor' ? 'Anchor 이동' : 'Handle 이동',
      }
      setLive(replacePath(list, selected), path.id)
      pushOverlay()
    }

    function move(e: PointerEvent) {
      const dg = drag.current
      const d = docRef.current
      if (!dg.mode || !d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const pos: Vec2 = { x: p.x, y: p.y }
      const alt = e.altKey
      const shift = e.shiftKey
      const path = (d.paths ?? []).find((x) => x.id === dg.pathId)
      if (!path) return
      const np = clonePath(path)
      const pt = np.points.find((x) => x.id === dg.pointId)
      if (!pt) return
      dg.moved = true

      if (dg.mode === 'newHandle') {
        // Drag → out handle 생성, 반대편 in handle 대칭 (Alt = 분리/코너)
        const target = shift ? snap45(pt.anchor, pos) : pos
        pt.outHandle = { ...target }
        if (alt) {
          pt.inHandle = { ...pt.anchor }
          pt.type = 'corner'
        } else {
          pt.inHandle = { x: 2 * pt.anchor.x - target.x, y: 2 * pt.anchor.y - target.y }
          pt.type = 'symmetric'
        }
      } else if (dg.mode === 'anchor') {
        const dx = pos.x - pt.anchor.x
        const dy = pos.y - pt.anchor.y
        pt.anchor = { x: pos.x, y: pos.y }
        pt.inHandle = { x: pt.inHandle.x + dx, y: pt.inHandle.y + dy }
        pt.outHandle = { x: pt.outHandle.x + dx, y: pt.outHandle.y + dy }
      } else {
        // in / out handle 이동
        const which = dg.mode
        const target = shift ? snap45(pt.anchor, pos) : pos
        if (which === 'out') pt.outHandle = { ...target }
        else pt.inHandle = { ...target }
        if (alt) {
          pt.type = 'corner' // 분리 (반대편 유지)
          dg.label = '점 변환'
        } else if (pt.type !== 'corner') {
          // smooth/symmetric → 반대편 대칭
          const opp = which === 'out' ? 'inHandle' : 'outHandle'
          const src = which === 'out' ? pt.outHandle : pt.inHandle
          pt[opp] = { x: 2 * pt.anchor.x - src.x, y: 2 * pt.anchor.y - src.y }
        }
      }
      setLive(replacePath(d.paths ?? [], np), path.id)
      lastCursor.current = pos
      pushOverlay()
    }

    function end(e: PointerEvent) {
      const dg = drag.current
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      if (!dg.mode) return
      // 새 Anchor 추가는 항상 기록, 이동/핸들은 실제 움직였을 때만 (noop History 방지)
      if (dg.mode === 'newHandle' || dg.moved) commit(dg.label)
      drag.current = { mode: null, pathId: '', pointId: '', moved: false, label: '' }
      pushOverlay()
    }

    function hoverMove(e: PointerEvent) {
      if (drag.current.mode) return
      if (toolRef.current !== 'pen') return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      lastCursor.current = { x: p.x, y: p.y }
      const active = active_()
      if (active) {
        const hit = hitTestPoints(active, { x: p.x, y: p.y }, tol())
        hoverRef.current = hit && 'pointId' in hit ? { pathId: active.id, pointId: hit.pointId } : null
      } else {
        hoverRef.current = null
      }
      pushOverlay()
    }

    function dblclick() {
      if (toolRef.current !== 'pen') return
      finishPath(true)
    }

    el.addEventListener('pointerdown', begin)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    el.addEventListener('pointermove', hoverMove)
    el.addEventListener('dblclick', dblclick)
    return () => {
      el.removeEventListener('pointerdown', begin)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      el.removeEventListener('pointermove', hoverMove)
      el.removeEventListener('dblclick', dblclick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch])

  /** 빌드 종료 (Enter/DoubleClick). removeDup: 더블클릭 시 마지막 중복 Anchor 제거 */
  const finishPath = (removeDup: boolean) => {
    const active = active_()
    if (!active || building.current !== active.id) {
      building.current = null
      return
    }
    building.current = null
    if (removeDup && active.points.length >= 2) {
      const n = active.points.length
      const a = active.points[n - 1].anchor
      const b = active.points[n - 2].anchor
      if (Math.hypot(a.x - b.x, a.y - b.y) < 2) {
        const np = { ...clonePath(active), points: active.points.slice(0, n - 1) }
        applyPaths(replacePath(paths(), np), '패스 완료', active.id)
        pushOverlay()
        return
      }
    }
    commit('패스 완료')
    pushOverlay()
  }

  // 키보드
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      if (!e.ctrlKey && !e.metaKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'pen' })
        return
      }
      if (toolRef.current !== 'pen') return
      const active = active_()
      if (e.key === 'Enter') {
        e.preventDefault()
        finishPath(false)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        // 취소 — 빌드 중인 Work Path 폐기
        if (active && building.current === active.id) {
          building.current = null
          applyPaths(paths().filter((x) => x.id !== active.id), '패스 취소', null)
        } else {
          building.current = null
        }
        pushOverlay()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && active) {
        e.preventDefault()
        const selCount = active.points.filter((p) => p.selected).length
        const remaining = selCount
          ? active.points.filter((p) => !p.selected)
          : active.points.slice(0, -1) // 선택 없으면 마지막 Anchor 삭제
        if (remaining.length === 0) {
          building.current = null
          applyPaths(paths().filter((x) => x.id !== active.id), 'Anchor 삭제', null)
        } else {
          const np = { ...clonePath(active), points: remaining }
          applyPaths(replacePath(paths(), np), 'Anchor 삭제', active.id)
        }
        pushOverlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])

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

  // 도구/문서/Path 변화 시 Overlay 갱신, 도구 이탈 시 빌드 종료
  useEffect(() => {
    if (activeTool !== 'pen') {
      building.current = null
      hoverRef.current = null
    }
    pushOverlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, doc?.id, doc?.activePathId, doc?.paths])
}
