import {
  Move,
  SquareDashed,
  Lasso,
  Wand2,
  Crop,
  Frame,
  Pipette,
  Bandage,
  Brush,
  Stamp,
  History,
  Eraser,
  Blend,
  PaintBucket,
  Droplet,
  PenTool,
  Type,
  MousePointer2,
  Square,
  Hand,
  ZoomIn,
  MoreHorizontal,
  ChevronsLeft,
  type LucideIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useEditor, useEditorDispatch } from '../state'
import { useBrushStore } from '../store/brushStore'
import { BrushFlyout } from './brush/BrushFlyout'
import type { ToolId } from '../types'

type ToolDef = {
  id: ToolId
  label: string
  shortcut: string
  Icon: LucideIcon
}

const TOOLS: ToolDef[] = [
  { id: 'move', label: '이동 도구', shortcut: 'V', Icon: Move },
  { id: 'marquee', label: '사각형 선택 윤곽 도구', shortcut: 'M', Icon: SquareDashed },
  { id: 'lasso', label: '올가미 도구', shortcut: 'L', Icon: Lasso },
  { id: 'quickselect', label: '개체 선택 / 마법봉 도구', shortcut: 'W', Icon: Wand2 },
  { id: 'crop', label: '자르기 도구', shortcut: 'C', Icon: Crop },
  { id: 'frame', label: '프레임 도구', shortcut: 'K', Icon: Frame },
  { id: 'eyedropper', label: '스포이드 도구', shortcut: 'I', Icon: Pipette },
  { id: 'healing', label: '스팟 복구 브러시 도구', shortcut: 'J', Icon: Bandage },
  { id: 'brush', label: '브러시 도구', shortcut: 'B', Icon: Brush },
  { id: 'stamp', label: '복제 도장 도구', shortcut: 'S', Icon: Stamp },
  { id: 'historybrush', label: '작업 내역 브러시 도구', shortcut: 'Y', Icon: History },
  { id: 'eraser', label: '지우개 도구', shortcut: 'E', Icon: Eraser },
  { id: 'gradient', label: '그라디언트 도구', shortcut: 'G', Icon: Blend },
  { id: 'blur', label: '흐림 효과 도구', shortcut: '', Icon: Droplet },
  { id: 'pen', label: '펜 도구', shortcut: 'P', Icon: PenTool },
  { id: 'text', label: '수평 문자 도구', shortcut: 'T', Icon: Type },
  { id: 'pathselect', label: '패스 선택 도구', shortcut: 'A', Icon: MousePointer2 },
  { id: 'shape', label: '사각형 도구', shortcut: 'U', Icon: Square },
  { id: 'hand', label: '손 도구', shortcut: 'H', Icon: Hand },
  { id: 'zoom', label: '돋보기 도구', shortcut: 'Z', Icon: ZoomIn },
]

export function LeftToolbar() {
  const { activeTool, foregroundColor, backgroundColor } = useEditor()
  const dispatch = useEditorDispatch()
  const { setFlyoutTool } = useBrushStore()
  const [flyoutAnchor, setFlyoutAnchor] = useState<DOMRect | null>(null)
  const longPress = useRef<number | null>(null)

  // Flyout 이 있는 도구 그룹 (Photoshop 도구 우측 하단 삼각형)
  type FlyoutGroup =
    | 'brush'
    | 'eraser'
    | 'stamp'
    | 'pen'
    | 'healing'
    | 'shape'
    | 'text'
    | 'gradient'
    | 'eyedropper'
    | 'quickselect'
  const FLYOUT_GROUPS: readonly FlyoutGroup[] = [
    'brush',
    'eraser',
    'stamp',
    'pen',
    'healing',
    'shape',
    'text',
    'gradient',
    'eyedropper',
    'quickselect',
  ]
  const flyoutGroup = (id: string): FlyoutGroup | null =>
    (FLYOUT_GROUPS as readonly string[]).includes(id) ? (id as FlyoutGroup) : null

  const openFlyout = (el: HTMLElement, group: FlyoutGroup) => {
    setFlyoutAnchor(el.getBoundingClientRect())
    setFlyoutTool(group)
  }

  return (
    <div className="left-toolbar">
      <button type="button" className="toolbar-collapse" title="도구 모음 접기">
        <ChevronsLeft size={13} />
      </button>

      <div className="tool-grid">
        {TOOLS.map(({ id, label, shortcut, Icon }) => {
          // 그룹 공유 슬롯 — 활성 도구에 따라 아이콘/타이틀 스왑 (Photoshop)
          // gradient 슬롯 = Gradient/Paint Bucket, quickselect 슬롯 = 개체 선택/자동 선택(Wand)
          const bucketActive = id === 'gradient' && activeTool === 'bucket'
          const wandSlot = id === 'quickselect'
          const wandActive = wandSlot && activeTool === 'wand'
          const SlotIcon = bucketActive ? PaintBucket : Icon
          const slotLabel = bucketActive ? '페인트 통 도구' : wandSlot ? '자동 선택 도구' : label
          const isActive = activeTool === id || bucketActive || wandActive
          const clickTool = bucketActive ? 'bucket' : wandSlot ? 'wand' : id
          return (
          <button
            key={id}
            type="button"
            title={shortcut ? `${slotLabel} (${shortcut})` : slotLabel}
            className={`tool-button${isActive ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_TOOL', tool: clickTool })}
            onContextMenu={(e) => {
              // 도구 그룹 우클릭 → Flyout (Photoshop 도구 그룹 메뉴)
              const group = flyoutGroup(id)
              if (!group) return
              e.preventDefault()
              openFlyout(e.currentTarget, group)
            }}
            onPointerDown={(e) => {
              // 롱프레스(500ms) → Flyout
              const group = flyoutGroup(id)
              if (!group || e.button !== 0) return
              const el = e.currentTarget
              longPress.current = window.setTimeout(() => openFlyout(el, group), 500)
            }}
            onPointerUp={() => {
              if (longPress.current) window.clearTimeout(longPress.current)
              longPress.current = null
            }}
            onPointerLeave={() => {
              if (longPress.current) window.clearTimeout(longPress.current)
              longPress.current = null
            }}
          >
            <SlotIcon size={20} />
            <span className="tool-corner" />
          </button>
          )
        })}
        <button type="button" className="tool-button" title="도구 모음 편집">
          <MoreHorizontal size={20} />
        </button>
      </div>

      <div className="color-swatches">
        <button
          type="button"
          className="foreground-swatch"
          style={{ background: foregroundColor }}
          title="전경색 설정"
        />
        <button
          type="button"
          className="background-swatch"
          style={{ background: backgroundColor }}
          title="배경색 설정"
        />
        <button
          type="button"
          className="swatch-swap"
          title="전경색과 배경색 교체 (X)"
          onClick={() => dispatch({ type: 'SWAP_COLORS' })}
        >
          ⇄
        </button>
        <button
          type="button"
          className="swatch-default"
          title="기본 전경색/배경색 (D)"
          onClick={() => {
            dispatch({ type: 'SET_FOREGROUND', color: '#000000' })
            dispatch({ type: 'SET_BACKGROUND', color: '#ffffff' })
          }}
        />
      </div>

      <div className="toolbar-modes">
        <button type="button" className="toolbar-mode" title="빠른 마스크 모드로 편집 (Q)">
          ◲
        </button>
        <div className="toolbar-screen">
          <button type="button" className="toolbar-mode" title="화면 모드 변경 (F)">
            ▢
          </button>
        </div>
      </div>

      <BrushFlyout anchor={flyoutAnchor} />
    </div>
  )
}
