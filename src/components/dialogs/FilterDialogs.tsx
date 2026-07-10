import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useFilterStore } from '../../store/filterStore'
import { useFilters } from '../../hooks/useFilters'
import { FILTER_LABELS, type FilterParams, type FilterType } from '../../engine/filterEngine'
import { SmartFilterDialog } from './SmartFilterDialog'
import { SmartFilterBlendDialog } from './SmartFilterBlendDialog'

const PREVIEW_W = 220
const PREVIEW_H = 170
const ZOOMS = [25, 50, 100, 200, 400]

type PreviewResult = {
  canvas: HTMLCanvasElement
  source: HTMLCanvasElement
} | null

/** Dialog 내부 Preview Canvas — 필터 결과의 중앙 crop + 줌 */
function DialogPreview({ result, zoom }: { result: PreviewResult; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = PREVIEW_W * dpr
    canvas.height = PREVIEW_H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = zoom < 100
    ctx.fillStyle = '#3a3a3a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (!result) return
    const src = result.canvas
    const scale = (zoom / 100) * dpr
    const sw = canvas.width / scale
    const sh = canvas.height / scale
    const sx = (src.width - sw) / 2
    const sy = (src.height - sh) / 2
    try {
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    } catch {
      /* noop */
    }
  }, [result, zoom])

  return (
    <canvas
      ref={ref}
      className="filter-dialog__preview-canvas"
      style={{ width: PREVIEW_W, height: PREVIEW_H }}
    />
  )
}

/** 공용 모달 셸 — Photoshop 스타일 다크 모달 + OK/Cancel + Preview 체크 + 줌 */
function FilterModal({
  type,
  params,
  onOk,
  onCancel,
  children,
}: {
  type: FilterType
  params: FilterParams
  onOk: () => void
  onCancel: () => void
  children: React.ReactNode
}) {
  const { computePreview, pushPreview, clearPreview } = useFilters()
  const [previewOn, setPreviewOn] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [result, setResult] = useState<PreviewResult>(null)
  const rafRef = useRef(0)

  // 값 변경 시 실시간 Preview (프레임당 1회로 합침) — Layer 는 변경하지 않는다
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const r = computePreview(type, params)
      if (!r) return
      setResult({ canvas: r.canvas, source: r.source })
      if (previewOn) pushPreview(r, type)
    })
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, previewOn, type])

  // Preview 체크 해제 시 문서 화면은 원본으로
  useEffect(() => {
    if (!previewOn) clearPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOn])

  // ESC = 취소, Enter = 확인
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onOk()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onOk, onCancel])

  const zoomStep = (dir: 1 | -1) => {
    const i = ZOOMS.indexOf(zoom)
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))]
    setZoom(next)
  }

  return (
    <div className="filter-dialog__backdrop">
      <div className="filter-dialog" role="dialog" aria-label={FILTER_LABELS[type]}>
        <div className="filter-dialog__title">{FILTER_LABELS[type]}</div>
        <div className="filter-dialog__body">
          <div className="filter-dialog__left">
            <div className="filter-dialog__preview">
              <DialogPreview result={result} zoom={zoom} />
              <div className="filter-dialog__zoom">
                <button type="button" className="filter-dialog__zoom-btn" onClick={() => zoomStep(-1)}>
                  <Minus size={11} />
                </button>
                <span className="filter-dialog__zoom-val">{zoom}%</span>
                <button type="button" className="filter-dialog__zoom-btn" onClick={() => zoomStep(1)}>
                  <Plus size={11} />
                </button>
              </div>
            </div>
            {children}
          </div>
          <div className="filter-dialog__side">
            <button type="button" className="filter-dialog__btn filter-dialog__btn--primary" onClick={onOk}>
              확인
            </button>
            <button type="button" className="filter-dialog__btn" onClick={onCancel}>
              취소
            </button>
            <label className="filter-dialog__check">
              <input
                type="checkbox"
                checked={previewOn}
                onChange={(e) => setPreviewOn(e.target.checked)}
              />
              <span>미리보기</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 슬라이더 + 숫자 입력 공용 행 */
function ParamSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div className="filter-dialog__param">
      <div className="filter-dialog__param-row">
        <span className="filter-dialog__label">{label}:</span>
        <input
          className="filter-dialog__num"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = e.target.valueAsNumber
            if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
          }}
        />
        <span className="filter-dialog__unit">{unit}</span>
      </div>
      <input
        className="adjprops__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </div>
  )
}

function GaussianBlurDialog({ onClose }: { onClose: () => void }) {
  const { applyFilter, clearPreview } = useFilters()
  const [radius, setRadius] = useState(5)
  const params: FilterParams = { radius }
  return (
    <FilterModal
      type="gaussianBlur"
      params={params}
      onOk={() => {
        if (applyFilter('gaussianBlur', params)) onClose()
      }}
      onCancel={() => {
        clearPreview(true)
        onClose()
      }}
    >
      <ParamSlider
        label="반경"
        value={radius}
        min={0.1}
        max={250}
        step={0.1}
        unit="픽셀"
        onChange={setRadius}
      />
    </FilterModal>
  )
}

function AddNoiseDialog({ onClose }: { onClose: () => void }) {
  const { applyFilter, clearPreview } = useFilters()
  const [amount, setAmount] = useState(12.5)
  const [distribution, setDistribution] = useState<'uniform' | 'gaussian'>('uniform')
  const [monochromatic, setMonochromatic] = useState(false)
  const params: FilterParams = { amount, distribution, monochromatic }
  return (
    <FilterModal
      type="addNoise"
      params={params}
      onOk={() => {
        if (applyFilter('addNoise', params)) onClose()
      }}
      onCancel={() => {
        clearPreview(true)
        onClose()
      }}
    >
      <ParamSlider
        label="양"
        value={amount}
        min={0.1}
        max={100}
        step={0.1}
        unit="%"
        onChange={setAmount}
      />
      <div className="filter-dialog__group">
        <span className="filter-dialog__group-title">분포</span>
        <label className="filter-dialog__radio">
          <input
            type="radio"
            name="noise-dist"
            checked={distribution === 'uniform'}
            onChange={() => setDistribution('uniform')}
          />
          <span>균일</span>
        </label>
        <label className="filter-dialog__radio">
          <input
            type="radio"
            name="noise-dist"
            checked={distribution === 'gaussian'}
            onChange={() => setDistribution('gaussian')}
          />
          <span>가우시안</span>
        </label>
      </div>
      <label className="filter-dialog__check filter-dialog__check--inline">
        <input
          type="checkbox"
          checked={monochromatic}
          onChange={(e) => setMonochromatic(e.target.checked)}
        />
        <span>단색</span>
      </label>
    </FilterModal>
  )
}

/** Filter Dialog 루트 + Ctrl+F(마지막 필터) 단축키 */
export function FilterDialogs() {
  const { dialog, closeDialog, lastFilter, smartEdit, closeSmartFilterEdit, blendEdit, closeSmartFilterBlend } =
    useFilterStore()
  const { applyFilter } = useFilters()

  const applyLast = useCallback(() => {
    if (lastFilter) applyFilter(lastFilter.type, lastFilter.params)
  }, [lastFilter, applyFilter])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        applyLast()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyLast])

  if (dialog === 'gaussianBlur') return <GaussianBlurDialog onClose={closeDialog} />
  if (dialog === 'addNoise') return <AddNoiseDialog onClose={closeDialog} />
  // Smart Object 에 적용된 Smart Filter 편집 (비파괴)
  if (smartEdit)
    return (
      <SmartFilterDialog
        layerId={smartEdit.layerId}
        filterId={smartEdit.filterId}
        onClose={closeSmartFilterEdit}
      />
    )
  if (blendEdit)
    return (
      <SmartFilterBlendDialog
        layerId={blendEdit.layerId}
        filterId={blendEdit.filterId}
        onClose={closeSmartFilterBlend}
      />
    )
  return null
}
