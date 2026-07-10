import { useEffect, useRef } from 'react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useTextStore } from '../store/textStore'
import { useOpenStore } from '../store/openStore'
import type { OpenDocument, TextSpec } from '../types'
import { createTextLayer } from '../engine/textEngine'
import { textLayerAt } from '../components/canvas/TextEditorOverlay'

type ViewportApi = {
  containerRef: React.RefObject<HTMLDivElement | null>
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  getScale: () => number
}

/**
 * Text Tool — Photoshop Type System.
 * Click = Caret 생성(새 Type Layer), 기존 Text Layer Click/DblClick = 편집.
 * 입력은 TextEditorOverlay(textarea)가 담당하고, 세션 종료 시 History 를 남긴다.
 * Text 는 Bitmap 이 아니라 언제든 수정 가능한 Vector(Type) Layer 이며 RenderEngine 이 실시간 렌더한다.
 */
export function useTextTool(vp: ViewportApi) {
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const text = useTextStore()
  const { toast } = useOpenStore()

  const docRef = useRef<OpenDocument | null>(doc)
  const toolRef = useRef(activeTool)
  const tsRef = useRef(text)
  docRef.current = doc
  toolRef.current = activeTool
  tsRef.current = text

  const spaceRef = useRef(false)

  const buildSpec = (): TextSpec => {
    const s = tsRef.current
    return {
      content: '',
      orientation: s.kind === 'vertical' ? 'vertical' : 'horizontal',
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      fontStyle: s.fontStyle,
      tracking: s.tracking,
      leading: s.leading,
      color: s.color,
      alignment: s.alignment,
      antiAlias: s.antiAlias,
      baselineShift: s.baselineShift,
      hScale: s.hScale,
      vScale: s.vScale,
    }
  }

  const startEdit = (layerId: string, docId: string) => {
    dispatch({ type: 'SELECT_LAYER', id: layerId })
    tsRef.current.setEditing({ layerId, docId })
  }

  const maskPlaceholder = (): boolean => {
    const kind = tsRef.current.kind
    if (kind === 'maskH' || kind === 'maskV') {
      toast('문자 마스크 도구는 준비 중입니다.', 'info')
      return true
    }
    return false
  }

  const createAt = (x: number, y: number) => {
    const d = docRef.current
    if (!d || maskPlaceholder()) return
    const layer = createTextLayer({ name: '텍스트', x, y, spec: buildSpec() })
    dispatch({ type: 'INSERT_TEXT', layer })
    tsRef.current.setEditing({ layerId: layer.id, docId: d.id })
  }

  /** Drag → Paragraph(Area) Text 박스 생성 */
  const createAreaAt = (x: number, y: number, w: number, h: number) => {
    const d = docRef.current
    if (!d || maskPlaceholder()) return
    const spec = { ...buildSpec(), orientation: 'horizontal' as const, box: { width: Math.round(w), height: Math.round(h) } }
    const layer = createTextLayer({ name: '텍스트', x, y, spec })
    dispatch({ type: 'INSERT_TEXT', layer })
    tsRef.current.setEditing({ layerId: layer.id, docId: d.id })
  }

  // ── Pointer 이벤트 ───────────────────────────────────────────
  const pending = useRef<{ x: number; y: number; dragging: boolean } | null>(null)

  useEffect(() => {
    const el = vp.containerRef.current
    if (!el) return

    function begin(e: PointerEvent) {
      if (toolRef.current !== 'text' || e.button !== 0 || spaceRef.current) return
      if ((e.target as HTMLElement).closest('.text-editor')) return
      const d = docRef.current
      if (!d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const hit = textLayerAt(d.layers, p.x, p.y)
      const editing = tsRef.current.editing
      if (hit) {
        if (editing?.layerId === hit.id) return // 이미 편집 중
        startEdit(hit.id, d.id)
        return
      }
      // 빈 곳 — Click(포인트) vs Drag(단락 박스) 판별을 위해 up 까지 대기
      pending.current = { x: p.x, y: p.y, dragging: false }
      el!.setPointerCapture(e.pointerId)
    }

    function move(e: PointerEvent) {
      const pd = pending.current
      if (!pd) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      if (Math.abs(p.x - pd.x) > 6 || Math.abs(p.y - pd.y) > 6) pd.dragging = true
    }

    function up(e: PointerEvent) {
      const pd = pending.current
      if (!pd) return
      pending.current = null
      try {
        el!.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      // 편집 중 빈 영역 클릭 → 현재 텍스트 Commit(=Edit 종료)만. 새 레이어를 만들지 않는다.
      // (내용이 있으면 유지, 빈 문자열이면 삭제 — 처리는 Overlay cleanup 이 담당)
      if (tsRef.current.editing) {
        tsRef.current.setEditing(null)
        return
      }
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      if (pd.dragging) {
        const x = Math.min(pd.x, p.x)
        const y = Math.min(pd.y, p.y)
        const w = Math.abs(p.x - pd.x)
        const h = Math.abs(p.y - pd.y)
        if (w >= 8 && h >= 8) createAreaAt(x, y, w, h)
        else createAt(pd.x, pd.y)
      } else {
        createAt(pd.x, pd.y)
      }
    }

    // 다른 도구에서 Text Layer 더블클릭 → 편집 진입 (Photoshop)
    function dblclick(e: MouseEvent) {
      if (spaceRef.current) return
      const d = docRef.current
      if (!d) return
      const p = vp.screenToCanvas(e.clientX, e.clientY)
      const hit = textLayerAt(d.layers, p.x, p.y)
      if (!hit) return
      e.preventDefault()
      e.stopPropagation()
      dispatch({ type: 'SET_TOOL', tool: 'text' })
      startEdit(hit.id, d.id)
    }

    el.addEventListener('pointerdown', begin)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('dblclick', dblclick)
    return () => {
      el.removeEventListener('pointerdown', begin)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('dblclick', dblclick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, dispatch])

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

  // T → Text Tool (입력 중에는 textarea 로 전달되어 무시됨)
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const tag = (t as HTMLElement | null)?.tagName
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
    }
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        dispatch({ type: 'SET_TOOL', tool: 'text' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  // 도구를 벗어나면 편집 세션 종료(=commit). 문서 전환 시에도 종료.
  useEffect(() => {
    if (activeTool !== 'text' && text.editing) {
      text.setEditing(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])

  useEffect(() => {
    if (text.editing && text.editing.docId !== doc?.id) {
      text.setEditing(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])
}
