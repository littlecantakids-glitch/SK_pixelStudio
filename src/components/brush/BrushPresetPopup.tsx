import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, Plus, Search, Settings } from 'lucide-react'
import { BRUSH_CATEGORIES, BRUSH_SIZE_MAX, useBrushStore } from '../../store/brushStore'
import { BrushTipThumb } from './BrushTipThumb'
import { BrushStrokePreview } from './BrushStrokePreview'
import { BrushAnglePreview } from './BrushAnglePreview'

/**
 * Photoshop식 Brush / Eraser Preset Popup.
 * 좌측 팁 프리뷰(각도 드래그) + 크기/경도 슬라이더, 검색,
 * 최근 사용 브러시 스트립, 폴더별 Preset 리스트, 하단 Stroke 미리보기.
 * variant='eraser' 는 지우개 프리셋 + Spacing/Angle/Roundness 확장 슬라이더를 표시한다.
 */
export function BrushPresetPopup({
  anchor,
  variant = 'brush',
}: {
  anchor: DOMRect | null
  variant?: 'brush' | 'eraser'
}) {
  const brush = useBrushStore()
  const {
    popupOpen,
    setPopupOpen,
    size,
    setSize,
    hardness,
    setHardness,
    opacity,
    flow,
    spacing,
    setSpacing,
    angle,
    setAngle,
    roundness,
    setRoundness,
    presets: brushPresets,
    activePresetId,
    recentPresetIds,
    applyPreset,
    eraserPresets,
    activeEraserPresetId,
    applyEraserPreset,
  } = brush

  const isEraser = variant === 'eraser'
  const presets = isEraser ? eraserPresets : brushPresets
  const activeId = isEraser ? activeEraserPresetId : activePresetId
  const apply = isEraser ? applyEraserPreset : applyPreset
  const categories = isEraser ? ['지우개 브러시'] : [...BRUSH_CATEGORIES]

  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(BRUSH_CATEGORIES.slice(1)), // Photoshop처럼 첫 폴더만 펼침
  )
  const ref = useRef<HTMLDivElement>(null)

  // 바깥 클릭으로 닫기
  useEffect(() => {
    if (!popupOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t)) return
      if (t.closest('.brushbar__preset')) return // 프리셋 버튼 자체 클릭은 토글이 처리
      setPopupOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [popupOpen, setPopupOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return presets
    return presets.filter((p) => p.name.toLowerCase().includes(q))
  }, [presets, query])

  if (!popupOpen) return null

  const top = anchor ? anchor.bottom + 6 : 64
  const left = anchor ? Math.max(8, anchor.left) : 70

  const toggleFolder = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // 슬라이더는 로그 스케일로 1~5000px 을 자연스럽게 커버
  const sizeToSlider = (v: number) => Math.round((Math.log10(v) / Math.log10(BRUSH_SIZE_MAX)) * 1000)
  const sliderToSize = (v: number) => Math.round(Math.pow(10, (v / 1000) * Math.log10(BRUSH_SIZE_MAX)))

  const recents = isEraser
    ? []
    : recentPresetIds
        .map((id) => presets.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)

  const tile = (p: (typeof presets)[number], keyPrefix = '') => (
    <button
      key={keyPrefix + p.id}
      type="button"
      className={`brush-popup__preset${p.id === activeId ? ' brush-popup__preset--active' : ''}`}
      title={`${p.name} (${p.size}px)`}
      onClick={() => apply(p.id)}
    >
      <BrushTipThumb size={30} hardness={p.hardness} brushSize={p.size} shape={p.tipShape} />
      <span className="brush-popup__preset-size">{p.size}</span>
    </button>
  )

  /** Eraser 확장 슬라이더 (Spacing / Angle / Roundness) */
  const extRow = (
    label: string,
    value: number,
    set: (v: number) => void,
    min: number,
    max: number,
    unit: string,
  ) => (
    <div className="brush-popup__ext-row" key={label}>
      <span className="brush-popup__label">{label}</span>
      <input
        className="brush-popup__slider brush-popup__slider--ext"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => set(e.target.valueAsNumber)}
      />
      <span className="brush-popup__ext-value">
        {value}
        {unit}
      </span>
    </div>
  )

  return (
    <div
      className="brush-popup"
      style={{ top, left }}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setPopupOpen(false)
      }}
    >
      {/* 헤더 — 좌: 팁 프리뷰(각도), 우: 크기/경도 슬라이더, 사이드: 설정/추가 */}
      <div className="brush-popup__head">
        <BrushAnglePreview />
        <div className="brush-popup__head-controls">
          <div className="brush-popup__slider-row">
            <span className="brush-popup__label">크기:</span>
            <input
              className="brush-popup__num"
              type="number"
              min={1}
              max={BRUSH_SIZE_MAX}
              value={size}
              onChange={(e) => setSize(e.target.valueAsNumber || 1)}
            />
            <span className="brush-popup__unit">픽셀</span>
          </div>
          <input
            className="brush-popup__slider"
            type="range"
            min={0}
            max={1000}
            value={sizeToSlider(size)}
            onChange={(e) => setSize(sliderToSize(e.target.valueAsNumber))}
          />
          <div className="brush-popup__slider-row">
            <span className="brush-popup__label">경도:</span>
            <input
              className="brush-popup__num"
              type="number"
              min={0}
              max={100}
              value={hardness}
              onChange={(e) => setHardness(e.target.valueAsNumber || 0)}
            />
            <span className="brush-popup__unit">%</span>
          </div>
          <input
            className="brush-popup__slider"
            type="range"
            min={0}
            max={100}
            value={hardness}
            onChange={(e) => setHardness(e.target.valueAsNumber)}
          />
          {isEraser && (
            <>
              {extRow('간격:', spacing, setSpacing, 1, 200, '%')}
              {extRow('각도:', angle, setAngle, -180, 180, '°')}
              {extRow('원형율:', roundness, setRoundness, 1, 100, '%')}
            </>
          )}
        </div>
        <div className="brush-popup__head-side">
          <button type="button" className="brush-popup__tool-btn" title="브러시 설정">
            <Settings size={13} />
          </button>
          <button type="button" className="brush-popup__tool-btn" title="새 브러시 사전 설정 만들기">
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div className="brush-popup__search">
        <Search size={12} />
        <input
          type="text"
          placeholder="브러시 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* 최근 사용 브러시 스트립 */}
      {!query && recents.length > 0 && (
        <div className="brush-popup__recent">{recents.map((p) => tile(p, 'recent-'))}</div>
      )}

      {/* 폴더별 Preset 리스트 */}
      <div className="brush-popup__list">
        {categories.map((cat) => {
          const items = filtered.filter((p) => p.category === cat)
          if (query && items.length === 0) return null
          const isCollapsed = collapsed.has(cat) && !query
          return (
            <div key={cat} className="brush-popup__folder">
              <button
                type="button"
                className="brush-popup__folder-head"
                onClick={() => toggleFolder(cat)}
              >
                {isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                <Folder size={12} className="brush-popup__folder-icon" />
                <span>{cat}</span>
              </button>
              {!isCollapsed && (
                <div className="brush-popup__grid">{items.map((p) => tile(p))}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* 하단 Stroke 미리보기 — Size/Hardness/Opacity 변경 즉시 반영 */}
      <div className="brush-popup__preview">
        <BrushStrokePreview
          width={276}
          height={44}
          size={size}
          hardness={hardness}
          opacity={opacity}
          flow={flow}
          spacing={spacing}
        />
      </div>
    </div>
  )
}
