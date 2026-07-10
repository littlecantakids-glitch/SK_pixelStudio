import { useEffect, useLayoutEffect, useRef } from 'react'
import { useActiveDocument, useEditorDispatch } from '../../state'
import { useTextStore } from '../../store/textStore'
import type { Layer, TextSpec } from '../../types'
import { leadingOf, measureTextSpec, textLayerName, trackingPx } from '../../engine/textEngine'

/**
 * Type Layer 편집 오버레이 — Photoshop 의 Caret/입력을 대신하는 in-canvas textarea.
 * canvas__doc(문서 좌표계) 내부에 배치되어 Viewport 카메라 CSS scale 로 Zoom 과 함께 확대된다.
 * IME(한글) 보호를 위해 uncontrolled(defaultValue) 로 두고 onInput 으로 상태를 동기화한다.
 * 편집 세션(editing.layerId)이 끝나면(cleanup) 내용에 따라 Create/Edit History 를 남긴다.
 */
export function TextEditorOverlay() {
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { editing, setEditing } = useTextStore()

  const layer = editing && doc?.id === editing.docId
    ? doc.layers.find((l) => l.id === editing.layerId) ?? null
    : null

  const ref = useRef<HTMLTextAreaElement>(null)
  // 항상 최신 Document 를 참조 (cleanup 에서 이 레이어의 실제 내용을 읽기 위함)
  const docRef = useRef(doc)
  docRef.current = doc

  const spec = layer?.text
  const layerId = layer?.id ?? null

  // 세션 시작 시 textarea 초기값 + 포커스 (caret 끝으로)
  useLayoutEffect(() => {
    if (!layer?.text || !layerId) return
    const el = ref.current
    if (!el) return
    const initial = layer.text.content
    el.value = initial
    el.focus()
    const len = initial.length
    try {
      el.setSelectionRange(len, len)
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId])

  // 세션 종료(cleanup) — 내용에 따라 Create / Edit / 취소.
  // 시작 시점 스냅샷(original/wasNew)은 세션별 지역 변수로 캡처해 다음 세션이 덮어쓰지 못하게 하고,
  // 종료 시 내용은 Live Document(docRef)에서 해당 id 로 다시 읽어 ref 오염(다른 세션)을 방지한다.
  useEffect(() => {
    if (!layerId) return
    const id = layerId
    const original = docRef.current?.layers.find((l) => l.id === id)?.text?.content ?? ''
    const wasNew = original === ''
    return () => {
      const content = docRef.current?.layers.find((l) => l.id === id)?.text?.content ?? ''
      if (content.trim() === '') {
        // 빈 문자열일 때만 Layer 삭제 (신규 Draft 취소 / 내용을 모두 지운 편집)
        dispatch({ type: 'REMOVE_DRAFT', id })
      } else if (wasNew) {
        dispatch({ type: 'UPDATE_TEXT', id, patch: {}, label: '텍스트 만들기' })
      } else if (content !== original) {
        dispatch({ type: 'UPDATE_TEXT', id, patch: {}, label: '텍스트 편집' })
      }
    }
  }, [layerId, dispatch])

  if (!layer || !spec) return null

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const content = e.currentTarget.value
    const nextSpec: TextSpec = { ...spec, content }
    const m = measureTextSpec(nextSpec)
    dispatch({
      type: 'UPDATE_TEXT',
      id: layer.id,
      patch: { text: nextSpec, width: m.width, height: m.height, name: textLayerName(content) },
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ESC = 편집 종료(저장), Ctrl+Enter 도 종료. 나머지는 textarea 기본 처리(IME/줄바꿈/Ctrl+A/C/V)
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      e.stopPropagation()
      setEditing(null)
    } else {
      // 전역 단축키(도구 전환 등)로 새는 것 방지
      e.stopPropagation()
    }
  }

  const hs = (spec.hScale || 100) / 100
  const vs = (spec.vScale || 100) / 100
  const lead = leadingOf(spec)
  const vertical = spec.orientation === 'vertical'
  const area = !!spec.box && !vertical
  const baseW = Math.max(4, layer.width / hs)
  const baseH = Math.max(lead, layer.height / vs)

  const style: React.CSSProperties = {
    position: 'absolute',
    left: layer.x,
    top: layer.y,
    width: baseW + spec.fontSize, // 마지막 글자 잘림 방지 여유
    height: baseH + lead * 0.3,
    transform: hs !== 1 || vs !== 1 ? `scale(${hs}, ${vs})` : undefined,
    transformOrigin: 'top left',
    margin: 0,
    padding: 0,
    border: 'none',
    outline: '1px dashed rgba(120,150,255,0.7)',
    background: 'transparent',
    resize: 'none',
    overflow: 'hidden',
    color: spec.color,
    fontFamily: `"${spec.fontFamily}", sans-serif`,
    fontSize: `${spec.fontSize}px`,
    fontWeight: spec.fontWeight,
    fontStyle: spec.fontStyle,
    lineHeight: `${lead}px`,
    letterSpacing: `${trackingPx(spec)}px`,
    textAlign: spec.alignment,
    whiteSpace: area ? 'pre-wrap' : 'pre',
    caretColor: spec.color,
    zIndex: 6,
    // Paragraph(Area) Text — 박스 고정 + 자동 줄바꿈
    ...(area && spec.box ? { width: spec.box.width, height: spec.box.height, wordBreak: 'break-word' as const } : null),
    // 세로쓰기 — CSS writing-mode 로 네이티브 세로 caret/편집
    ...(vertical
      ? { writingMode: 'vertical-rl' as const, width: baseW + lead * 0.3, height: baseH + spec.fontSize }
      : null),
  }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      spellCheck={false}
      wrap={area ? 'soft' : 'off'}
      style={style}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}

/** 특정 문서 좌표에 있는 최상단 Type Layer (편집 진입용 히트 테스트) */
export function textLayerAt(layers: Layer[], x: number, y: number): Layer | null {
  for (const l of layers) {
    if (l.type !== 'text' || !l.text || !l.visible) continue
    if (x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height) return l
  }
  return null
}
