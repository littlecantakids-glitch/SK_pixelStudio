import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Contrast,
  CornerLeftDown,
  Eye,
  EyeOff,
  Folder,
  Image as ImageIcon,
  Link2,
  Link2Off,
  Lock,
  Palette,
  BarChart3,
  Square,
  SlidersHorizontal,
  Type as TypeIcon,
  Box,
} from 'lucide-react'
import type { AdjustmentType, Layer, MaskTarget, OpenDocument } from '../../types'
import { LayerThumbnail } from './LayerThumbnail'
import { MaskThumbnail } from './MaskThumbnail'

type Props = {
  layer: Layer
  index: number
  depth: number
  renaming: boolean
  /** 이 레이어가 활성 레이어일 때의 편집 대상 (활성 아니면 null) */
  activeTarget: MaskTarget | null
  onSelect: (e: React.MouseEvent) => void
  onSelectBitmap: (e: React.MouseEvent) => void
  onSelectMask: (e: React.MouseEvent) => void
  onToggleMaskLink: () => void
  onToggleVisible: () => void
  onToggleLock: () => void
  onToggleCollapse: () => void
  onStartRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDropOn: () => void
  /** Smart Object 썸네일 더블클릭 → 내용 편집 */
  onEditContents?: () => void
  /** Smart Object 썸네일 렌더용 조회자 */
  resolveSmart?: (id: string) => OpenDocument | undefined
}

/** Adjustment 종류별 특수 아이콘 (Photoshop 스타일) */
function AdjustmentGlyph({ type }: { type?: AdjustmentType }) {
  const size = 15
  switch (type) {
    case 'brightnessContrast':
      return <Contrast size={size} />
    case 'hueSaturation':
      return <Palette size={size} />
    case 'levels':
      return <BarChart3 size={size} />
    default:
      return <SlidersHorizontal size={size} />
  }
}

function LayerBadge({ layer }: { layer: Layer }) {
  const size = 11
  switch (layer.type) {
    case 'text':
      return <TypeIcon size={size} className="layer-row__badge" />
    case 'shape':
      return <Square size={size} className="layer-row__badge" />
    case 'image':
      return <ImageIcon size={size} className="layer-row__badge" />
    case 'smartObject':
      return <Box size={size} className="layer-row__badge" />
    default:
      return null
  }
}

export function LayerRow({
  layer,
  depth,
  renaming,
  activeTarget,
  onSelect,
  onSelectBitmap,
  onSelectMask,
  onToggleMaskLink,
  onToggleVisible,
  onToggleLock,
  onToggleCollapse,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
  onDragStart,
  onDropOn,
  onEditContents,
  resolveSmart,
}: Props) {
  const [draft, setDraft] = useState(layer.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const isGroup = layer.type === 'group'

  useEffect(() => {
    if (renaming) {
      setDraft(layer.name)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [renaming, layer.name])

  return (
    <div
      className={`layer-row${layer.selected ? ' layer-row--selected' : ''}`}
      style={{ paddingLeft: 6 + depth * 14 }}
      draggable={!renaming}
      onMouseDown={onSelect}
      onDoubleClick={(e) => {
        // 이름 영역 더블클릭 시 rename (아이콘 영역 제외)
        if ((e.target as HTMLElement).closest('.layer-row__namewrap')) onStartRename()
      }}
      onContextMenu={onContextMenu}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDropOn()
      }}
    >
      <button
        type="button"
        className="layer-row__eye"
        title="레이어 표시/숨기기"
        onMouseDown={(e) => {
          e.stopPropagation()
          onToggleVisible()
        }}
      >
        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {isGroup && (
        <button
          type="button"
          className="layer-row__collapse"
          onMouseDown={(e) => {
            e.stopPropagation()
            onToggleCollapse()
          }}
        >
          {layer.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      )}

      {isGroup ? (
        <span className="layer-thumb layer-thumb--group">
          <Folder size={16} />
        </span>
      ) : layer.type === 'adjustment' ? (
        <span
          className={`layer-thumb layer-thumb--adj${
            activeTarget === 'bitmap' ? ' layer-thumb--active' : ''
          }`}
          title={`조정 레이어 (${layer.name})`}
          onMouseDown={(e) => {
            e.stopPropagation()
            onSelectBitmap(e)
          }}
        >
          <AdjustmentGlyph type={layer.adjustment} />
        </span>
      ) : (
        <LayerThumbnail
          layer={layer}
          active={activeTarget === 'bitmap'}
          resolveSmart={resolveSmart}
          onMouseDown={(e) => {
            e.stopPropagation()
            onSelectBitmap(e)
          }}
          onDoubleClick={
            layer.type === 'smartObject'
              ? (e) => {
                  e.stopPropagation()
                  onEditContents?.()
                }
              : undefined
          }
        />
      )}

      {layer.mask && (
        <>
          <button
            type="button"
            className="layer-row__masklink"
            title={layer.maskLinked ? '레이어와 마스크 연결됨' : '레이어와 마스크 연결 해제됨'}
            onMouseDown={(e) => {
              e.stopPropagation()
              onToggleMaskLink()
            }}
          >
            {layer.maskLinked ? <Link2 size={10} /> : <Link2Off size={10} />}
          </button>
          <MaskThumbnail
            layer={layer}
            active={activeTarget === 'mask'}
            onMouseDown={(e) => {
              e.stopPropagation()
              onSelectMask(e)
            }}
          />
        </>
      )}

      <div className="layer-row__namewrap">
        {renaming ? (
          <input
            ref={inputRef}
            className="layer-row__rename"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={() => onCommitRename(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onCommitRename(draft)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onCancelRename()
              }
            }}
          />
        ) : (
          <span className="layer-row__name">{layer.name}</span>
        )}
      </div>

      {layer.clipped && (
        <span
          className="layer-row__clip"
          title="클리핑 마스크 (아래 레이어에 클리핑됨)"
        >
          <CornerLeftDown size={10} />
        </span>
      )}

      {layer.unsupported && (
        <span
          className="layer-row__warn"
          title={`지원되지 않는 레이어 (${layer.unsupported.originalType}) — ${layer.unsupported.reason}`}
        >
          <AlertTriangle size={11} />
        </span>
      )}

      <LayerBadge layer={layer} />

      <button
        type="button"
        className={`layer-row__lock${layer.locked ? ' layer-row__lock--on' : ''}`}
        title="레이어 잠금"
        onMouseDown={(e) => {
          e.stopPropagation()
          onToggleLock()
        }}
      >
        {(layer.locked || layer.type === 'background') && <Lock size={11} />}
      </button>
    </div>
  )
}
