import { useRef, useState } from 'react'
import {
  Search,
  Link,
  Sparkles,
  FolderPlus,
  Plus,
  Trash2,
  CircleDot,
} from 'lucide-react'
import { useLayers } from '../hooks/useLayers'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useTextStore } from '../store/textStore'
import type { BlendMode } from '../types'
import { LayerRow } from './layers/LayerRow'
import { LayerContextMenu } from './layers/LayerContextMenu'
import { AdjustmentMenu } from './layers/AdjustmentMenu'
import { SmartFilterTree } from './layers/SmartFilterTree'
import { useFilterStore } from '../store/filterStore'

import { BLEND_LABELS } from '../engine/blendModes'

export function LayersPanel() {
  const {
    layers,
    activeLayer,
    activeLayerId,
    activeTarget,
    createLayer,
    deleteSelectedLayers,
    duplicateLayer,
    renameLayer,
    moveLayer,
    toggleVisible,
    toggleLock,
    changeOpacity,
    changeFill,
    changeBlendMode,
    selectLayer,
    groupSelected,
    toggleCollapse,
    mergeDown,
    rasterize,
    convertToSmartObject,
    editSmartObject,
    replaceSmartContents,
    convertToShape,
    createWorkPath,
    addLayerMask,
    deleteLayerMask,
    toggleMaskEnabled,
    toggleMaskLink,
    setActiveTarget,
    toggleMaskSolo,
    addAdjustmentLayer,
  } = useLayers()
  const dispatch = useEditorDispatch()
  const { setEditing: setTextEditing } = useTextStore()
  const { documents } = useEditor()
  const docId = useActiveDocument()?.id ?? ''
  const resolveSmart = (id: string) => documents.find((d) => d.id === id)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null)
  const { openSmartFilterEdit } = useFilterStore()
  const [adjMenuAnchor, setAdjMenuAnchor] = useState<DOMRect | null>(null)
  const adjBtnRef = useRef<HTMLButtonElement>(null)
  const dragIndex = useRef<number | null>(null)

  const active = activeLayer

  // 접힌 그룹의 자식(중첩 포함)은 숨김 — 조상 체인에 접힌 그룹이 있으면 감춘다
  const layerById = new Map(layers.map((l) => [l.id, l]))
  const chainInfo = (l: (typeof layers)[number]) => {
    let depth = 0
    let hidden = false
    let pid = l.parentId
    for (let i = 0; pid && i < 64; i++) {
      const parent = layerById.get(pid)
      if (!parent) break
      depth++
      if (parent.type === 'group' && parent.collapsed) hidden = true
      pid = parent.parentId
    }
    return { depth, hidden }
  }
  const visibleRows = layers.filter((l) => !chainInfo(l).hidden)

  const ctxLayer = ctx ? layers.find((l) => l.id === ctx.id) : null

  return (
    <section className="panel panel--layers">
      <div className="panel__tabs">
        <button type="button" className="panel__tab panel__tab--active">
          레이어
        </button>
      </div>

      <div className="layers__filter">
        <div className="layers__search">
          <Search size={12} />
          <select className="layers__kind">
            <option>종류</option>
            <option>이름</option>
            <option>효과</option>
          </select>
        </div>
        <div className="layers__filter-icons">
          <span className="layers__fi">◻</span>
          <span className="layers__fi">◸</span>
          <span className="layers__fi">◈</span>
          <span className="layers__fi">✎</span>
          <span className="layers__fi">◉</span>
        </div>
      </div>

      <div className="layers__blend">
        <select
          className="layers__blend-select"
          value={active?.blendMode ?? 'normal'}
          disabled={!active}
          onChange={(e) =>
            active && changeBlendMode(active.id, e.target.value as BlendMode)
          }
        >
          {(Object.keys(BLEND_LABELS) as BlendMode[]).map((m) => (
            <option key={m} value={m}>
              {BLEND_LABELS[m]}
            </option>
          ))}
        </select>
        <label className="layers__opacity">
          <span>불투명도:</span>
          <input
            className="layers__opacity-input"
            value={`${active?.opacity ?? 100}%`}
            disabled={!active}
            onChange={(e) => {
              if (!active) return
              const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
              if (!Number.isNaN(n)) changeOpacity(active.id, Math.min(100, Math.max(0, n)))
            }}
          />
        </label>
      </div>

      <div className="layers__lockrow">
        <span className="layers__lock-label">잠그기:</span>
        <button
          type="button"
          className={`layers__lock${active?.lockTransparent ? ' layers__lock--on' : ''}`}
          title="투명 픽셀 잠그기 — ON 이면 투명 영역에 페인트/Fill 금지"
          disabled={!active}
          onClick={() => active && dispatch({ type: 'TOGGLE_LOCK_TRANSPARENT', id: active.id })}
        >
          ▨
        </button>
        <button type="button" className="layers__lock" title="이미지 픽셀 잠그기">🖌</button>
        <button type="button" className="layers__lock" title="위치 잠그기">✛</button>
        <button
          type="button"
          className="layers__lock"
          title="전체 잠그기"
          onClick={() => active && toggleLock(active.id)}
        >
          🔒
        </button>
        <label className="layers__fill">
          <span>칠:</span>
          <input
            className="layers__opacity-input"
            value={`${active?.fill ?? 100}%`}
            disabled={!active}
            onChange={(e) => {
              if (!active) return
              const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
              if (!Number.isNaN(n)) changeFill(active.id, Math.min(100, Math.max(0, n)))
            }}
          />
        </label>
      </div>

      <div className="layers__list">
        {visibleRows.map((layer) => {
          const realIndex = layers.findIndex((l) => l.id === layer.id)
          return (
            <div key={layer.id}>
            <LayerRow
              key={layer.id}
              layer={layer}
              index={realIndex}
              depth={chainInfo(layer).depth}
              renaming={renamingId === layer.id}
              activeTarget={layer.id === activeLayerId ? activeTarget : null}
              onSelect={(e) => {
                const mode = e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single'
                selectLayer(layer.id, mode)
              }}
              onSelectBitmap={(e) => {
                // Bitmap 썸네일 클릭 — Ctrl/Shift 는 다중 선택 유지 (썸네일에서도 멀티 셀렉트 가능)
                const mode = e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single'
                selectLayer(layer.id, mode)
                if (mode === 'single') {
                  setActiveTarget('bitmap')
                  // 조정 레이어는 Properties Panel 로 자동 전환 (Photoshop 동작)
                  if (layer.type === 'adjustment')
                    dispatch({ type: 'SET_RIGHT_PANEL', tab: 'properties' })
                }
              }}
              onSelectMask={(e) => {
                // Shift+클릭 = 마스크 비활성 토글, Alt+클릭 = 마스크만 크게 보기
                if (e.shiftKey) {
                  toggleMaskEnabled(layer.id)
                  return
                }
                selectLayer(layer.id)
                setActiveTarget('mask')
                if (e.altKey) toggleMaskSolo()
              }}
              onToggleMaskLink={() => toggleMaskLink(layer.id)}
              onToggleVisible={() => toggleVisible(layer.id)}
              onToggleLock={() => toggleLock(layer.id)}
              onToggleCollapse={() => toggleCollapse(layer.id)}
              onStartRename={() => setRenamingId(layer.id)}
              onCommitRename={(name) => {
                renameLayer(layer.id, name)
                setRenamingId(null)
              }}
              onCancelRename={() => setRenamingId(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                // 이미 선택된 레이어를 우클릭하면 다중 선택을 유지 (전체 삭제 가능하도록)
                if (!layer.selected) selectLayer(layer.id)
                setCtx({ x: e.clientX, y: e.clientY, id: layer.id })
              }}
              onDragStart={() => {
                dragIndex.current = realIndex
              }}
              onDropOn={() => {
                if (dragIndex.current != null && dragIndex.current !== realIndex) {
                  moveLayer(dragIndex.current, realIndex)
                }
                dragIndex.current = null
              }}
              onEditContents={() => editSmartObject(layer.id)}
              resolveSmart={resolveSmart}
            />
            {layer.type === 'smartObject' && (layer.smartFilters?.length ?? 0) > 0 && (
              <SmartFilterTree
                layer={layer}
                onEdit={(filterId) => openSmartFilterEdit(layer.id, filterId)}
              />
            )}
            </div>
          )
        })}
      </div>

      <div className="layers__footer">
        <button type="button" className="layers__fbtn" title="레이어 연결"><Link size={14} /></button>
        <button type="button" className="layers__fbtn" title="레이어 스타일 추가"><Sparkles size={14} /></button>
        <button
          type="button"
          className={`layers__fbtn${activeLayer?.mask ? ' layers__fbtn--active' : ''}`}
          title="레이어 마스크 추가"
          disabled={
            !activeLayer ||
            !!activeLayer.mask ||
            activeLayer.type === 'background' ||
            activeLayer.type === 'group'
          }
          onClick={() => addLayerMask()}
        >
          <CircleDot size={14} />
        </button>
        <button
          type="button"
          ref={adjBtnRef}
          className={`layers__fbtn${adjMenuAnchor ? ' layers__fbtn--active' : ''}`}
          title="새 칠 또는 조정 레이어 만들기"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() =>
            setAdjMenuAnchor(
              adjMenuAnchor ? null : adjBtnRef.current?.getBoundingClientRect() ?? null,
            )
          }
        >
          <span className="layers__adj-icon" />
        </button>
        <button
          type="button"
          className="layers__fbtn"
          title="새 그룹"
          onClick={() => groupSelected()}
        >
          <FolderPlus size={14} />
        </button>
        <button
          type="button"
          className="layers__fbtn"
          title="새 레이어 (Ctrl+Shift+N)"
          onClick={() => createLayer()}
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="layers__fbtn"
          title="레이어 삭제"
          onClick={() => deleteSelectedLayers()}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {ctx && ctxLayer && (
        <LayerContextMenu
          x={ctx.x}
          y={ctx.y}
          layer={ctxLayer}
          onClose={() => setCtx(null)}
          onRename={() => setRenamingId(ctx.id)}
          onDuplicate={() => duplicateLayer(ctx.id)}
          onDelete={() => deleteSelectedLayers()}
          onMergeDown={() => mergeDown(ctx.id)}
          onConvertSmartObject={() => {
            selectLayer(ctx.id)
            convertToSmartObject()
          }}
          onEditContents={() => editSmartObject(ctx.id)}
          onReplaceContents={() => replaceSmartContents(ctx.id)}
          onRasterize={() => rasterize(ctx.id)}
          onAddMask={() => addLayerMask(ctx.id)}
          onDeleteMask={() => deleteLayerMask(ctx.id)}
          onToggleMaskEnabled={() => toggleMaskEnabled(ctx.id)}
          onEditText={() => {
            dispatch({ type: 'SET_TOOL', tool: 'text' })
            dispatch({ type: 'SELECT_LAYER', id: ctx.id })
            setTextEditing({ layerId: ctx.id, docId })
          }}
          onConvertShape={() => convertToShape(ctx.id)}
          onCreateWorkPath={() => createWorkPath(ctx.id)}
        />
      )}

      <AdjustmentMenu
        anchor={adjMenuAnchor}
        onSelect={(t) => {
          addAdjustmentLayer(t)
          dispatch({ type: 'SET_RIGHT_PANEL', tab: 'properties' })
        }}
        onClose={() => setAdjMenuAnchor(null)}
      />
    </section>
  )
}
