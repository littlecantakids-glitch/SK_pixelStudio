import { useEffect } from 'react'
import {
  Brush,
  Pencil,
  Replace,
  Blend,
  Eraser,
  Wand2,
  ImageOff,
  Stamp,
  Stars,
  PenTool,
  Spline,
  Radius,
  PlusCircle,
  MinusCircle,
  CornerUpRight,
  Bandage,
  Sparkles,
  SquareDashedBottom,
  Move as MoveIcon,
  Eye,
  Square as SquareIcon,
  Squircle,
  Circle,
  Hexagon,
  Slash,
  Shapes,
  Type as TypeIcon,
  TextCursor,
  Columns2,
  Rows2,
  PaintBucket,
  Pipette,
  Crosshair,
  Ruler,
  StickyNote,
  LassoSelect,
  BoxSelect,
  type LucideIcon,
} from 'lucide-react'
import { useEditor, useEditorDispatch } from '../../state'
import { useBrushStore, type FlyoutTool } from '../../store/brushStore'
import { useShapeStore } from '../../store/shapeStore'
import { useTextStore, type TextToolKind } from '../../store/textStore'
import type { ShapeKind, ToolId } from '../../types'

type FlyoutItem = {
  id: string
  label: string
  shortcut: string
  Icon: LucideIcon
  /** 실제 전환되는 도구 (스텁이면 그룹 대표 도구) */
  tool: ToolId
  enabled: boolean
  /** Shape 그룹 전용 — 선택 시 적용할 도형 종류 */
  shapeKind?: ShapeKind
  /** Text 그룹 전용 — 선택 시 적용할 문자 도구 종류 */
  textKind?: TextToolKind
}

/** 도구 그룹별 Flyout 항목 — 현재 Brush/Eraser 만 실제 동작 */
const GROUPS: Record<Exclude<FlyoutTool, null>, FlyoutItem[]> = {
  brush: [
    { id: 'brush', label: '브러시 도구', shortcut: 'B', Icon: Brush, tool: 'brush', enabled: true },
    { id: 'pencil', label: '연필 도구', shortcut: 'B', Icon: Pencil, tool: 'brush', enabled: false },
    { id: 'color-replace', label: '색상 대체 도구', shortcut: 'B', Icon: Replace, tool: 'brush', enabled: false },
    { id: 'mixer', label: '혼합 브러시 도구', shortcut: 'B', Icon: Blend, tool: 'brush', enabled: false },
  ],
  eraser: [
    { id: 'eraser', label: '지우개 도구', shortcut: 'E', Icon: Eraser, tool: 'eraser', enabled: true },
    { id: 'bg-eraser', label: '배경 지우개 도구', shortcut: 'E', Icon: ImageOff, tool: 'eraser', enabled: false },
    { id: 'magic-eraser', label: '자동 지우개 도구', shortcut: 'E', Icon: Wand2, tool: 'eraser', enabled: false },
  ],
  stamp: [
    { id: 'stamp', label: '복제 도장 도구', shortcut: 'S', Icon: Stamp, tool: 'stamp', enabled: true },
    { id: 'pattern-stamp', label: '패턴 도장 도구', shortcut: 'S', Icon: Stars, tool: 'stamp', enabled: false },
  ],
  healing: [
    { id: 'spot-healing', label: '스팟 복구 브러시 도구', shortcut: 'J', Icon: Sparkles, tool: 'healing', enabled: false },
    { id: 'healing', label: '복구 브러시 도구', shortcut: 'J', Icon: Bandage, tool: 'healing', enabled: true },
    { id: 'patch', label: '패치 도구', shortcut: 'J', Icon: SquareDashedBottom, tool: 'healing', enabled: false },
    { id: 'content-move', label: '내용 인식 이동 도구', shortcut: 'J', Icon: MoveIcon, tool: 'healing', enabled: false },
    { id: 'red-eye', label: '적목 현상 도구', shortcut: 'J', Icon: Eye, tool: 'healing', enabled: false },
  ],
  pen: [
    { id: 'pen', label: '펜 도구', shortcut: 'P', Icon: PenTool, tool: 'pen', enabled: true },
    { id: 'freeform', label: '자유 형태 펜 도구', shortcut: 'P', Icon: Spline, tool: 'pen', enabled: false },
    { id: 'curvature', label: '곡률 펜 도구', shortcut: 'P', Icon: Radius, tool: 'pen', enabled: false },
    { id: 'add-anchor', label: '기준점 추가 도구', shortcut: '', Icon: PlusCircle, tool: 'pen', enabled: false },
    { id: 'delete-anchor', label: '기준점 삭제 도구', shortcut: '', Icon: MinusCircle, tool: 'pen', enabled: false },
    { id: 'convert', label: '기준점 변환 도구', shortcut: '', Icon: CornerUpRight, tool: 'pen', enabled: false },
  ],
  shape: [
    { id: 'rectangle', label: '사각형 도구', shortcut: 'U', Icon: SquareIcon, tool: 'shape', enabled: true, shapeKind: 'rectangle' },
    { id: 'roundRect', label: '모서리가 둥근 직사각형 도구', shortcut: 'U', Icon: Squircle, tool: 'shape', enabled: true, shapeKind: 'roundRect' },
    { id: 'ellipse', label: '타원 도구', shortcut: 'U', Icon: Circle, tool: 'shape', enabled: true, shapeKind: 'ellipse' },
    { id: 'polygon', label: '다각형 도구', shortcut: 'U', Icon: Hexagon, tool: 'shape', enabled: false, shapeKind: 'polygon' },
    { id: 'line', label: '선 도구', shortcut: 'U', Icon: Slash, tool: 'shape', enabled: true, shapeKind: 'line' },
    { id: 'custom', label: '사용자 정의 모양 도구', shortcut: 'U', Icon: Shapes, tool: 'shape', enabled: false, shapeKind: 'custom' },
  ],
  gradient: [
    { id: 'gradient', label: '그라디언트 도구', shortcut: 'G', Icon: Blend, tool: 'gradient', enabled: true },
    { id: 'paint-bucket', label: '페인트 통 도구', shortcut: 'G', Icon: PaintBucket, tool: 'bucket', enabled: true },
  ],
  quickselect: [
    { id: 'object-select', label: '개체 선택 도구', shortcut: 'W', Icon: BoxSelect, tool: 'wand', enabled: false },
    { id: 'quick-select', label: '빠른 선택 도구', shortcut: 'W', Icon: LassoSelect, tool: 'wand', enabled: false },
    { id: 'magic-wand', label: '자동 선택 도구', shortcut: 'W', Icon: Wand2, tool: 'wand', enabled: true },
  ],
  eyedropper: [
    { id: 'eyedropper', label: '스포이드 도구', shortcut: 'I', Icon: Pipette, tool: 'eyedropper', enabled: true },
    { id: 'color-sampler', label: '색상 샘플러 도구', shortcut: 'I', Icon: Crosshair, tool: 'eyedropper', enabled: false },
    { id: 'ruler', label: '눈금자 도구', shortcut: 'I', Icon: Ruler, tool: 'eyedropper', enabled: false },
    { id: 'note', label: '메모 도구', shortcut: 'I', Icon: StickyNote, tool: 'eyedropper', enabled: false },
  ],
  text: [
    { id: 'type-h', label: '수평 문자 도구', shortcut: 'T', Icon: TypeIcon, tool: 'text', enabled: true, textKind: 'horizontal' },
    { id: 'type-v', label: '세로 문자 도구', shortcut: 'T', Icon: Rows2, tool: 'text', enabled: true, textKind: 'vertical' },
    { id: 'type-mask-h', label: '수평 문자 마스크 도구', shortcut: 'T', Icon: TextCursor, tool: 'text', enabled: true, textKind: 'maskH' },
    { id: 'type-mask-v', label: '세로 문자 마스크 도구', shortcut: 'T', Icon: Columns2, tool: 'text', enabled: true, textKind: 'maskV' },
  ],
}

/**
 * Toolbar Flyout — 좌측 툴바 도구 우클릭/롱프레스로 툴바 오른쪽에 열리는
 * Photoshop식 도구 그룹 메뉴. 활성 도구는 ▪ 마커로 표시.
 */
export function BrushFlyout({ anchor }: { anchor: DOMRect | null }) {
  const { flyoutTool, setFlyoutTool } = useBrushStore()
  const { activeTool } = useEditor()
  const dispatch = useEditorDispatch()
  const { kind: shapeKind, setKind: setShapeKind } = useShapeStore()
  const { kind: textKind, setKind: setTextKind } = useTextStore()

  useEffect(() => {
    if (!flyoutTool) return
    const close = () => setFlyoutTool(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [flyoutTool, setFlyoutTool])

  if (!flyoutTool || !anchor) return null
  const items = GROUPS[flyoutTool]

  return (
    <div
      className="brush-flyout"
      style={{ top: anchor.top, left: anchor.right + 4 }}
      onMouseDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {items.map(({ id, label, shortcut, Icon, tool, enabled, shapeKind: itemKind, textKind: itemTextKind }) => {
        // Shape/Text 그룹은 현재 선택된 종류로 활성 표시, 그 외는 활성 도구로 판단
        const active =
          enabled &&
          (itemKind
            ? activeTool === 'shape' && shapeKind === itemKind
            : itemTextKind
              ? activeTool === 'text' && textKind === itemTextKind
              : activeTool === tool)
        return (
          <button
            key={id}
            type="button"
            className={`brush-flyout__item${active ? ' brush-flyout__item--active' : ''}${
              enabled ? '' : ' brush-flyout__item--stub'
            }`}
            onClick={() => {
              if (enabled) {
                if (itemKind) setShapeKind(itemKind)
                if (itemTextKind) setTextKind(itemTextKind)
                dispatch({ type: 'SET_TOOL', tool })
              }
              setFlyoutTool(null)
            }}
          >
            <span className="brush-flyout__check">
              {active && <span className="brush-flyout__marker" />}
            </span>
            <Icon size={14} />
            <span className="brush-flyout__label">{label}</span>
            <span className="brush-flyout__shortcut">{shortcut}</span>
          </button>
        )
      })}
    </div>
  )
}
