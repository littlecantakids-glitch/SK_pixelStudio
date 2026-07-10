import { useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Droplet,
  Contrast,
  Palette,
  Sparkles,
  Triangle,
  Grip,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import type { Layer, SmartFilterType } from '../../types'
import { useLayers } from '../../hooks/useLayers'
import { useEditorDispatch } from '../../state'
import { useFilterStore } from '../../store/filterStore'
import { useOpenStore } from '../../store/openStore'
import { SMART_FILTER_META, IMPLEMENTED_SMART_FILTERS, createSmartFilter } from '../../engine/smartFilterEngine'

/** Filter 종류별 아이콘 (Photoshop 스타일) — 없으면 Sparkles */
const FILTER_ICON: Partial<Record<SmartFilterType, LucideIcon>> = {
  brightnessContrast: Contrast,
  hueSaturation: Palette,
  gaussianBlur: Droplet,
  motionBlur: Droplet,
  surfaceBlur: Droplet,
  boxBlur: Droplet,
  radialBlur: Droplet,
  average: Droplet,
  lensBlur: Droplet,
  smartSharpen: Triangle,
  unsharpMask: Triangle,
  highPass: Triangle,
  addNoise: Grip,
  reduceNoise: Grip,
  median: Grip,
  dustScratches: Grip,
  ripple: Waves,
  twirl: Waves,
  wave: Waves,
  zigzag: Waves,
  offset: Waves,
}

/**
 * Smart Filter 트리 — Smart Object 레이어 아래 Photoshop 식 스택 UI.
 * Expand/Collapse · Eye On/Off · DblClick Edit · Add · Reorder(Drag) · Context Menu.
 */
export function SmartFilterTree({ layer, onEdit }: { layer: Layer; onEdit: (filterId: string) => void }) {
  const { setSmartFilter, deleteSmartFilter, reorderSmartFilter, toggleFiltersExpand } = useLayers()
  const dispatch = useEditorDispatch()
  const { openSmartFilterBlend } = useFilterStore()
  const { toast } = useOpenStore()
  const [addOpen, setAddOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; filterId: string } | null>(null)
  const dragIndex = useRef<number | null>(null)

  const filters = layer.smartFilters ?? []
  if (!filters.length) return null
  const expanded = layer.filtersExpanded !== false

  const duplicate = (filterId: string) => {
    const f = filters.find((x) => x.id === filterId)
    if (!f) return
    const copy = { ...createSmartFilter(f.type), parameters: { ...f.parameters }, opacity: f.opacity, blendMode: f.blendMode, name: `${f.name} 복사` }
    dispatch({ type: 'ADD_SMART_FILTER', layerId: layer.id, filter: copy })
  }

  return (
    <div className="sf-tree">
      <div className="sf-tree__head">
        <button
          type="button"
          className="sf-tree__caret"
          title={expanded ? '접기' : '펼치기'}
          onMouseDown={(e) => {
            e.stopPropagation()
            toggleFiltersExpand(layer.id)
          }}
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <Sparkles size={11} className="sf-tree__mask" />
        <span className="sf-tree__title">스마트 필터</span>
        <span className="sf-tree__add-wrap">
          <button
            type="button"
            className="sf-tree__add"
            title="스마트 필터 추가"
            onMouseDown={(e) => {
              e.stopPropagation()
              setAddOpen((v) => !v)
            }}
          >
            <Plus size={12} />
          </button>
          {addOpen && (
            <div className="sf-add-menu" onMouseDown={(e) => e.stopPropagation()}>
              {(Object.keys(SMART_FILTER_META) as SmartFilterType[]).map((t) => {
                const impl = IMPLEMENTED_SMART_FILTERS.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    className={`sf-add-menu__item${impl ? '' : ' sf-add-menu__item--stub'}`}
                    disabled={!impl}
                    onClick={() => {
                      setAddOpen(false)
                      const f = createSmartFilter(t)
                      dispatch({ type: 'ADD_SMART_FILTER', layerId: layer.id, filter: f })
                      onEdit(f.id)
                    }}
                  >
                    {SMART_FILTER_META[t].label}
                  </button>
                )
              })}
            </div>
          )}
        </span>
      </div>

      {expanded &&
        filters.map((f, i) => (
          <div
            key={f.id}
            className={`sf-row${f.enabled ? '' : ' sf-row--off'}`}
            draggable
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIndex.current != null && dragIndex.current !== i) {
                reorderSmartFilter(layer.id, dragIndex.current, i)
              }
              dragIndex.current = null
            }}
            onDoubleClick={() => onEdit(f.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, filterId: f.id })
            }}
          >
            <button
              type="button"
              className="sf-row__eye"
              title={f.enabled ? '필터 끄기' : '필터 켜기'}
              onMouseDown={(e) => {
                e.stopPropagation()
                setSmartFilter(layer.id, f.id, { enabled: !f.enabled }, f.enabled ? '필터 숨기기' : '필터 표시')
              }}
            >
              {f.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            {(() => {
              const Icon = FILTER_ICON[f.type] ?? Sparkles
              return <Icon size={11} className="sf-row__icon" />
            })()}
            <span className="sf-row__name">{f.name}</span>
            {f.opacity < 100 && <span className="sf-row__op">{f.opacity}%</span>}
          </div>
        ))}

      {menu && (
        <FilterContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={() => onEdit(menu.filterId)}
          onBlendOptions={() => openSmartFilterBlend(layer.id, menu.filterId)}
          onRename={() => toast('필터 이름 변경은 준비 중입니다.', 'info')}
          onDuplicate={() => duplicate(menu.filterId)}
          onDelete={() => deleteSmartFilter(layer.id, menu.filterId)}
          onToggle={() => {
            const f = filters.find((x) => x.id === menu.filterId)
            if (f) setSmartFilter(layer.id, menu.filterId, { enabled: !f.enabled }, f.enabled ? '필터 숨기기' : '필터 표시')
          }}
          enabled={!!filters.find((x) => x.id === menu.filterId)?.enabled}
        />
      )}
    </div>
  )
}

function FilterContextMenu({
  x,
  y,
  enabled,
  onClose,
  onEdit,
  onBlendOptions,
  onRename,
  onDuplicate,
  onDelete,
  onToggle,
}: {
  x: number
  y: number
  enabled: boolean
  onClose: () => void
  onEdit: () => void
  onBlendOptions: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }
  return (
    <>
      <div className="sf-ctx-backdrop" onMouseDown={onClose} />
      <div className="menu-dropdown sf-ctx" style={{ position: 'fixed', top: y, left: x, minWidth: 170 }} onMouseDown={(e) => e.stopPropagation()}>
        <button className="menu-dropdown__item" onClick={run(onEdit)}>
          <span className="menu-dropdown__label">스마트 필터 편집</span>
        </button>
        <button className="menu-dropdown__item" onClick={run(onToggle)}>
          <span className="menu-dropdown__label">{enabled ? '필터 사용 안 함' : '필터 사용'}</span>
        </button>
        <button className="menu-dropdown__item" onClick={run(onBlendOptions)}>
          <span className="menu-dropdown__label">혼합 옵션...</span>
        </button>
        <button className="menu-dropdown__item" onClick={run(onDuplicate)}>
          <span className="menu-dropdown__label">필터 복제</span>
        </button>
        <button className="menu-dropdown__item" onClick={run(onRename)}>
          <span className="menu-dropdown__label">이름 변경</span>
        </button>
        <div className="menu-dropdown__separator" />
        <button className="menu-dropdown__item menu-dropdown__item--disabled" disabled>
          <span className="menu-dropdown__label">필터 마스크 추가 (준비 중)</span>
        </button>
        <div className="menu-dropdown__separator" />
        <button className="menu-dropdown__item" onClick={run(onDelete)}>
          <span className="menu-dropdown__label">필터 삭제</span>
        </button>
      </div>
    </>
  )
}
