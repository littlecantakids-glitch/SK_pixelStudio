import { useEffect, useRef, useState } from 'react'
import {
  Move,
  Square,
  SquareStack,
  SquareMinus,
  SquarePlus,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyStart,
} from 'lucide-react'
import {
  Check,
  X as XIcon,
  Square as SquareIcon,
  Circle,
  PenLine,
  Settings2,
  SlidersHorizontal,
  SprayCan,
  SquareStack as SquareIntersect,
} from 'lucide-react'
import { Eraser as EraserIcon, Stamp as StampIcon, Crosshair, PenTool, Bandage, Blend, Pipette, PaintBucket as PaintBucketIcon } from 'lucide-react'
import { Squircle, Slash, Hexagon, Shapes, Radius } from 'lucide-react'
import { AlignLeft, AlignCenter, AlignRight, Type as TypeIcon, PanelRight } from 'lucide-react'
import { useEditor, useActiveDocument, useEditorDispatch } from '../state'
import { useShapeStore } from '../store/shapeStore'
import { useTextStore } from '../store/textStore'
import { useCropStore } from '../store/cropStore'
import { Crop as CropIcon } from 'lucide-react'
import { buildShapePath } from '../engine/shapeEngine'
import { measureTextSpec, textLayerName } from '../engine/textEngine'
import { WarpDialog } from './dialogs/WarpDialog'
import type { GradientType as GradientTypeId, ShapeKind, StrokeAlign, TextAlign, TextAntiAlias, TextSpec } from '../types'
import { useGradientStore } from '../store/gradientStore'
import { GradientStrip } from './gradient/GradientStrip'
import { GradientPresetPicker } from './gradient/GradientPresetPicker'
import { useEyedropperStore } from '../store/eyedropperStore'
import { SAMPLE_SIZES, SAMPLE_SOURCES, type SampleSource } from '../engine/samplingEngine'
import { useBucketStore, type BucketFillType } from '../store/bucketStore'
import { getPatternPresets } from '../engine/patternEngine'
import { useWandStore } from '../store/wandStore'
import { Wand2 } from 'lucide-react'
import { useMoveStore, type AutoSelectMode } from '../store/moveStore'
import { useTransformStore } from '../store/transformStore'
import { useSelectionStore } from '../store/selectionStore'
import { useBrushStore, type BrushMode, type EraserMode } from '../store/brushStore'
import { useCloneStore, type OverlayColor } from '../store/cloneStore'
import { useHealingStore, type HealingSource } from '../store/healingStore'
import { usePathStore, type PenMode } from '../store/pathStore'
import { usePathActions } from '../hooks/usePathActions'
import { useOpenStore } from '../store/openStore'
import type { SampleMode } from '../engine/cloneEngine'
import { BrushTipThumb } from './brush/BrushTipThumb'
import { BrushPresetPopup } from './brush/BrushPresetPopup'
import { boxRect } from '../engine/transformEngine'
import type { SelectionOperation } from '../types'

const TOOL_TITLES: Record<string, string> = {
  move: '이동 도구',
  marquee: '사각형 선택 윤곽 도구',
  lasso: '올가미 도구',
  crop: '자르기 도구',
  eyedropper: '스포이드 도구',
  brush: '브러시 도구',
  eraser: '지우개 도구',
  stamp: '복제 도장 도구',
  healing: '복구 브러시 도구',
  pen: '펜 도구',
  shape: '모양 도구',
  gradient: '그라디언트 도구',
  bucket: '페인트 통 도구',
  wand: '자동 선택 도구',
  text: '수평 문자 도구',
  hand: '손 도구',
  zoom: '돋보기 도구',
}

/** Brush / Clone 공용 Blend Mode 목록 (Brush Engine BRUSH_MODE_OP 와 대응) */
const BLEND_MODE_OPTIONS: { value: BrushMode; label: string }[] = [
  { value: 'normal', label: '표준' },
  { value: 'multiply', label: '곱하기' },
  { value: 'screen', label: '스크린' },
  { value: 'overlay', label: '오버레이' },
  { value: 'softlight', label: '소프트 라이트' },
  { value: 'hardlight', label: '하드 라이트' },
  { value: 'darken', label: '어둡게 하기' },
  { value: 'lighten', label: '밝게 하기' },
]

/** 이동 도구 옵션 */
function MoveOptions() {
  const {
    autoSelect,
    autoSelectMode,
    showTransform,
    setAutoSelect,
    setAutoSelectMode,
    setShowTransform,
  } = useMoveStore()

  return (
    <>
      <div className="optionsbar__tool-badge" title="이동 도구">
        <Move size={15} />
      </div>

      <label className="optionsbar__check">
        <input
          type="checkbox"
          checked={autoSelect}
          onChange={(e) => setAutoSelect(e.target.checked)}
        />
        <span>자동 선택:</span>
      </label>
      <select
        className="optionsbar__select"
        value={autoSelectMode}
        onChange={(e) => setAutoSelectMode(e.target.value as AutoSelectMode)}
      >
        <option value="layer">레이어</option>
        <option value="group">그룹</option>
      </select>

      <label className="optionsbar__check">
        <input
          type="checkbox"
          checked={showTransform}
          onChange={(e) => setShowTransform(e.target.checked)}
        />
        <span>변형 컨트롤 표시</span>
      </label>

      <div className="optionsbar__sep" />

      <div className="optionsbar__bool-group">
        <button type="button" className="optionsbar__bool" title="왼쪽 가장자리 정렬">
          <AlignHorizontalJustifyStart size={13} />
        </button>
        <button type="button" className="optionsbar__bool" title="위쪽 가장자리 정렬">
          <AlignVerticalJustifyStart size={13} />
        </button>
      </div>
    </>
  )
}

/** 선택 윤곽 도구 옵션 (기본) */
function MarqueeOptions() {
  const [feather, setFeather] = useState('0')
  const [style, setStyle] = useState('표준')

  return (
    <>
      <div className="optionsbar__tool-badge" title="사각형 선택 윤곽 도구">
        <Square size={15} strokeDasharray="2 1.5" />
      </div>

      <div className="optionsbar__bool-group">
        <button type="button" className="optionsbar__bool optionsbar__bool--active" title="새 선택 영역">
          <Square size={13} />
        </button>
        <button type="button" className="optionsbar__bool" title="선택 영역에 추가">
          <SquarePlus size={13} />
        </button>
        <button type="button" className="optionsbar__bool" title="선택 영역에서 빼기">
          <SquareMinus size={13} />
        </button>
        <button type="button" className="optionsbar__bool" title="선택 영역 교차">
          <SquareStack size={13} />
        </button>
      </div>

      <div className="optionsbar__sep" />

      <label className="optionsbar__field">
        <span>페더:</span>
        <input
          className="optionsbar__input optionsbar__input--sm"
          value={feather}
          onChange={(e) => setFeather(e.target.value)}
        />
        <span className="optionsbar__unit">픽셀</span>
      </label>

      <label className="optionsbar__check">
        <input type="checkbox" defaultChecked />
        <span>앤티 앨리어스</span>
      </label>

      <div className="optionsbar__sep" />

      <label className="optionsbar__field">
        <span>스타일:</span>
        <select
          className="optionsbar__select"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        >
          <option>표준</option>
          <option>고정 비율</option>
          <option>크기 고정</option>
        </select>
      </label>

      <label className="optionsbar__field">
        <span>폭:</span>
        <input className="optionsbar__input" defaultValue="" disabled={style === '표준'} />
      </label>
      <span className="optionsbar__swap">⇄</span>
      <label className="optionsbar__field">
        <span>높이:</span>
        <input className="optionsbar__input" defaultValue="" disabled={style === '표준'} />
      </label>

      <div className="optionsbar__sep" />

      <button type="button" className="optionsbar__btn">
        선택 및 마스크 ...
      </button>
    </>
  )
}

/** 자유 변형 옵션바 (X/Y/W%/H%/Angle/Interpolation/Commit/Cancel) */
function TransformOptions() {
  const { box, box0, pivot, setBox, setPivot, commit, cancel } = useTransformStore()
  if (!box || !box0) return null
  const rect = boxRect(box)
  const wPct = Math.round((box.hw / (box0.hw || 1)) * 1000) / 10
  const hPct = Math.round((box.hh / (box0.hh || 1)) * 1000) / 10

  const setX = (v: number) => {
    const dx = v + box.hw - box.cx
    setBox({ ...box, cx: v + box.hw })
    if (pivot) setPivot(pivot.x + dx, pivot.y)
  }
  const setY = (v: number) => {
    const dy = v + box.hh - box.cy
    setBox({ ...box, cy: v + box.hh })
    if (pivot) setPivot(pivot.x, pivot.y + dy)
  }
  const setW = (pct: number) => setBox({ ...box, hw: (box0.hw * pct) / 100 })
  const setH = (pct: number) => setBox({ ...box, hh: (box0.hh * pct) / 100 })
  const setAngle = (deg: number) => setBox({ ...box, rot: deg })

  return (
    <>
      <div className="optionsbar__tool-badge" title="자유 변형">⧉</div>
      <label className="optionsbar__field">
        <span>X:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={Math.round(rect.x)}
          onChange={(e) => setX(e.target.valueAsNumber || 0)}
        />
      </label>
      <label className="optionsbar__field">
        <span>Y:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={Math.round(rect.y)}
          onChange={(e) => setY(e.target.valueAsNumber || 0)}
        />
      </label>
      <div className="optionsbar__sep" />
      <label className="optionsbar__field">
        <span>W:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={wPct}
          onChange={(e) => setW(e.target.valueAsNumber || 0)}
        />
        <span className="optionsbar__unit">%</span>
      </label>
      <label className="optionsbar__field">
        <span>H:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={hPct}
          onChange={(e) => setH(e.target.valueAsNumber || 0)}
        />
        <span className="optionsbar__unit">%</span>
      </label>
      <div className="optionsbar__sep" />
      <label className="optionsbar__field">
        <span>각도:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={Math.round(box.rot * 10) / 10}
          onChange={(e) => setAngle(e.target.valueAsNumber || 0)}
        />
        <span className="optionsbar__unit">°</span>
      </label>
      <div className="optionsbar__sep" />
      <label className="optionsbar__field">
        <span>보간:</span>
        <select className="optionsbar__select" defaultValue="bicubic">
          <option value="bicubic">쌍입방</option>
          <option value="bilinear">쌍선형</option>
          <option value="nearest">최단입점</option>
        </select>
      </label>
      <div className="optionsbar__sep" />
      <button type="button" className="optionsbar__icon-btn" title="취소 (ESC)" onClick={cancel}>
        <XIcon size={14} />
      </button>
      <button
        type="button"
        className="optionsbar__icon-btn optionsbar__icon-btn--primary"
        title="적용 (Enter)"
        onClick={commit}
      >
        <Check size={14} />
      </button>
    </>
  )
}

const OPS: { id: SelectionOperation; title: string; Icon: typeof SquareIcon }[] = [
  { id: 'new', title: '새 선택 영역', Icon: SquareIcon },
  { id: 'add', title: '선택 영역에 추가', Icon: SquarePlus },
  { id: 'subtract', title: '선택 영역에서 빼기', Icon: SquareMinus },
  { id: 'intersect', title: '선택 영역 교차', Icon: SquareIntersect },
]

/** 선택 도구 옵션바 (New/Add/Subtract/Intersect, Feather, Anti-alias) */
function SelectionOptions() {
  const { activeTool } = useEditor()
  const {
    operation,
    setOperation,
    feather,
    setFeather,
    antiAlias,
    setAntiAlias,
    marqueeMode,
    setMarqueeMode,
    lassoMode,
    setLassoMode,
  } = useSelectionStore()

  return (
    <>
      <div className="optionsbar__tool-badge" title="선택 도구">
        {activeTool === 'lasso' ? <Circle size={14} /> : <SquareIcon size={14} strokeDasharray="2 1.5" />}
      </div>

      <div className="optionsbar__bool-group">
        {OPS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`optionsbar__bool${operation === o.id ? ' optionsbar__bool--active' : ''}`}
            title={o.title}
            onClick={() => setOperation(o.id)}
          >
            <o.Icon size={13} />
          </button>
        ))}
      </div>

      <div className="optionsbar__sep" />

      {activeTool === 'marquee' ? (
        <label className="optionsbar__field">
          <span>모양:</span>
          <select
            className="optionsbar__select"
            value={marqueeMode}
            onChange={(e) => setMarqueeMode(e.target.value as 'rectangle' | 'ellipse')}
          >
            <option value="rectangle">사각형</option>
            <option value="ellipse">타원</option>
          </select>
        </label>
      ) : (
        <label className="optionsbar__field">
          <span>유형:</span>
          <select
            className="optionsbar__select"
            value={lassoMode}
            onChange={(e) => setLassoMode(e.target.value as 'lasso' | 'polygon')}
          >
            <option value="lasso">올가미</option>
            <option value="polygon">다각형</option>
          </select>
        </label>
      )}

      <div className="optionsbar__sep" />

      <label className="optionsbar__field">
        <span>페더:</span>
        <input
          className="optionsbar__input optionsbar__input--sm"
          type="number"
          min={0}
          max={250}
          value={feather}
          onChange={(e) => setFeather(Math.min(250, Math.max(0, e.target.valueAsNumber || 0)))}
        />
        <span className="optionsbar__unit">픽셀</span>
      </label>

      <label className="optionsbar__check">
        <input
          type="checkbox"
          checked={antiAlias}
          disabled={activeTool === 'marquee' && marqueeMode === 'rectangle'}
          onChange={(e) => setAntiAlias(e.target.checked)}
        />
        <span>앤티 앨리어스</span>
      </label>
    </>
  )
}

/** Photoshop식 자동 선택(Magic Wand) 옵션바 — 연산/허용치/AA/인접/모든 레이어 */
function WandOptions() {
  const w = useWandStore()
  const { operation, setOperation } = useSelectionStore()

  return (
    <>
      <div className="optionsbar__tool-badge" title="자동 선택 도구">
        <Wand2 size={14} />
      </div>

      <div className="optionsbar__bool-group">
        {OPS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`optionsbar__bool${operation === o.id ? ' optionsbar__bool--active' : ''}`}
            title={`${o.title} (Shift=추가 · Alt=빼기 · Shift+Alt=교차)`}
            onClick={() => setOperation(o.id)}
          >
            <o.Icon size={13} />
          </button>
        ))}
      </div>

      <div className="optionsbar__sep" />

      <PercentField label="허용치:" value={w.tolerance} set={w.setTolerance} min={0} max={255} unit="" title="Tolerance 0~255" />

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="선택 경계 부드럽게">
        <input type="checkbox" checked={w.antiAlias} onChange={(e) => w.setAntiAlias(e.target.checked)} />
        <span>앤티 앨리어스</span>
      </label>
      <label className="optionsbar__check" title="ON = 인접 픽셀만, OFF = 같은 색 전체">
        <input type="checkbox" checked={w.contiguous} onChange={(e) => w.setContiguous(e.target.checked)} />
        <span>인접</span>
      </label>
      <label className="optionsbar__check" title="RenderEngine 결과 기준 샘플링">
        <input type="checkbox" checked={w.sampleAll} onChange={(e) => w.setSampleAll(e.target.checked)} />
        <span>모든 레이어 샘플링</span>
      </label>
    </>
  )
}

/** Photoshop식 페인트 통 옵션바 — 소스/패턴/모드/불투명도/허용치/AA/인접/모든 레이어 */
function BucketOptions() {
  const b = useBucketStore()
  const { foregroundColor } = useEditor()
  const patterns = getPatternPresets()
  const pat = patterns.find((p) => p.id === b.patternId)

  return (
    <>
      <div className="optionsbar__tool-badge" title="페인트 통 도구">
        <PaintBucketIcon size={14} />
      </div>

      <label className="brushbar__field" title="채우기 소스">
        <select
          className="brushbar__select"
          value={b.fillType}
          onChange={(e) => b.setFillType(e.target.value as BucketFillType)}
        >
          <option value="foreground">전경색</option>
          <option value="pattern">패턴</option>
        </select>
      </label>

      {b.fillType === 'foreground' ? (
        <span className="optionsbar__swatch-mini" style={{ background: foregroundColor }} title={`전경색 ${foregroundColor}`} />
      ) : (
        <label className="brushbar__field" title="패턴 사전 설정">
          <span
            className="optionsbar__swatch-mini bucket__pattern-swatch"
            ref={(el) => {
              if (el && pat) {
                el.style.backgroundImage = `url(${pat.tile.toDataURL()})`
              }
            }}
          />
          <select
            className="brushbar__select"
            value={b.patternId}
            onChange={(e) => b.setPatternId(e.target.value)}
          >
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="혼합 모드">
        <span className="brushbar__label">모드:</span>
        <select className="brushbar__select" value={b.mode} onChange={(e) => b.setMode(e.target.value)}>
          {BLEND_MODE_OPTIONS.filter((m) => m.value !== 'erase').map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <PercentField label="불투명도:" value={b.opacity} set={b.setOpacity} />

      <div className="optionsbar__sep" />

      <PercentField label="허용치:" value={b.tolerance} set={b.setTolerance} min={0} max={255} unit="" title="Tolerance 0~255" />

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="경계 부드럽게">
        <input type="checkbox" checked={b.antiAlias} onChange={(e) => b.setAntiAlias(e.target.checked)} />
        <span>앤티 앨리어스</span>
      </label>
      <label className="optionsbar__check" title="ON = 인접 픽셀만, OFF = 같은 색 전체">
        <input type="checkbox" checked={b.contiguous} onChange={(e) => b.setContiguous(e.target.checked)} />
        <span>인접</span>
      </label>
      <label className="optionsbar__check" title="RenderEngine 결과 기준 샘플링">
        <input type="checkbox" checked={b.sampleAll} onChange={(e) => b.setSampleAll(e.target.checked)} />
        <span>모든 레이어</span>
      </label>
    </>
  )
}

/** Photoshop식 스포이드 옵션바 — Sample Size / Sample Source / 전경·배경 스와치 / HUD */
function EyedropperOptions() {
  const eye = useEyedropperStore()
  const { foregroundColor, backgroundColor } = useEditor()

  return (
    <>
      <div className="optionsbar__tool-badge" title="스포이드 도구">
        <Pipette size={14} />
      </div>

      <label className="brushbar__field" title="샘플 크기">
        <span className="brushbar__label">샘플 크기:</span>
        <select
          className="brushbar__select"
          value={eye.sampleSize}
          onChange={(e) => eye.setSampleSize(Number(e.target.value))}
        >
          {SAMPLE_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="샘플 소스">
        <span className="brushbar__label">샘플:</span>
        <select
          className="brushbar__select brushbar__select--wide"
          value={eye.sampleSource}
          onChange={(e) => eye.setSampleSource(e.target.value as SampleSource)}
        >
          {SAMPLE_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="optionsbar__sep" />

      <span className="optionsbar__swatch-mini" style={{ background: foregroundColor }} title={`전경색 ${foregroundColor} (클릭으로 샘플)`} />
      <span className="optionsbar__swatch-mini" style={{ background: backgroundColor }} title={`배경색 ${backgroundColor} (Alt+클릭으로 샘플)`} />

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="확대 미리보기(HUD) 표시">
        <input
          type="checkbox"
          checked={eye.showHud}
          onChange={(e) => eye.setShowHud(e.target.checked)}
        />
        <span>미리보기</span>
      </label>
    </>
  )
}

/** Photoshop식 그라디언트 옵션바 — Preset 버튼 + 5종 Type + Blend/Opacity + Reverse/Dither/Transparency */
function GradientOptions() {
  const grad = useGradientStore()
  const dispatch = useEditorDispatch()
  const presetBtnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const TYPES: { id: GradientTypeId; label: string; cls: string }[] = [
    { id: 'linear', label: '선형 그라디언트', cls: 'linear' },
    { id: 'radial', label: '방사형 그라디언트', cls: 'radial' },
    { id: 'angle', label: '각도 그라디언트', cls: 'angle' },
    { id: 'reflected', label: '반사 그라디언트', cls: 'reflected' },
    { id: 'diamond', label: '다이아몬드 그라디언트', cls: 'diamond' },
  ]

  return (
    <>
      <div className="optionsbar__tool-badge" title="그라디언트 도구">
        <Blend size={14} />
      </div>

      {/* Gradient Preset Button — 스트립 미리보기 + ▾ */}
      <button
        type="button"
        ref={presetBtnRef}
        className={`gradbar__preset${grad.pickerOpen ? ' gradbar__preset--open' : ''}`}
        title={`그라디언트 편집 (${grad.gradient.name})`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          setAnchor(presetBtnRef.current?.getBoundingClientRect() ?? null)
          grad.setPickerOpen(!grad.pickerOpen)
        }}
        onDoubleClick={() => grad.setEditorOpen(true)}
      >
        <GradientStrip gradient={grad.gradient} width={64} height={16} reverse={grad.reverse} />
        <span className="brushbar__preset-caretbox">
          <span className="brushbar__caret" />
        </span>
      </button>

      <button
        type="button"
        className="optionsbar__icon-btn"
        title="그라디언트 편집기 열기"
        onClick={() => grad.setEditorOpen(true)}
      >
        <Settings2 size={13} />
      </button>

      <div className="optionsbar__sep" />

      {/* 5종 Gradient Type */}
      <div className="optionsbar__bool-group">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`optionsbar__bool gradbar__type gradbar__type--${t.cls}${
              grad.gradientType === t.id ? ' optionsbar__bool--active' : ''
            }`}
            title={t.label}
            onClick={() => grad.setGradientType(t.id)}
          >
            <span className={`gradbar__type-glyph gradbar__type-glyph--${t.cls}`} />
          </button>
        ))}
      </div>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="혼합 모드">
        <span className="brushbar__label">모드:</span>
        <select
          className="brushbar__select"
          value={grad.blendMode}
          onChange={(e) => grad.setBlendMode(e.target.value)}
        >
          {BLEND_MODE_OPTIONS.filter((m) => m.value !== 'erase').map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <PercentField label="불투명도:" value={grad.opacity} set={grad.setOpacity} />

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="그라디언트 방향 반전">
        <input
          type="checkbox"
          checked={grad.reverse}
          onChange={(e) => {
            grad.setReverse(e.target.checked)
            dispatch({ type: 'ADD_HISTORY', entry: '그라디언트 반전' })
          }}
        />
        <span>반전</span>
      </label>
      <label className="optionsbar__check" title="디더 — Banding 감소">
        <input
          type="checkbox"
          checked={grad.dither}
          onChange={(e) => grad.setDither(e.target.checked)}
        />
        <span>디더</span>
      </label>
      <label className="optionsbar__check" title="Opacity Stop(투명도) 사용">
        <input
          type="checkbox"
          checked={grad.transparency}
          onChange={(e) => grad.setTransparency(e.target.checked)}
        />
        <span>투명도</span>
      </label>

      <GradientPresetPicker anchor={anchor} />
    </>
  )
}

/** 값 입력 + ▾ 드롭다운 슬라이더 (Photoshop 불투명도/흐름/보정 스타일) */
function PercentField({
  label,
  value,
  set,
  min = 0,
  max = 100,
  unit = '%',
  title,
}: {
  label: string
  value: number
  set: (v: number) => void
  min?: number
  max?: number
  unit?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <label className="brushbar__field" title={title}>
      <span className="brushbar__label">{label}</span>
      <span className="brushbar__combo">
        <input
          className="brushbar__input brushbar__input--combo"
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = e.target.valueAsNumber
            if (!Number.isNaN(v)) set(v)
          }}
        />
        <span className="brushbar__combo-unit">{unit}</span>
        <button
          type="button"
          ref={btnRef}
          className={`brushbar__combo-caret${open ? ' brushbar__combo-caret--open' : ''}`}
          title={`${label.replace(':', '')} 슬라이더`}
          onClick={() => {
            setAnchor(btnRef.current?.getBoundingClientRect() ?? null)
            setOpen(!open)
          }}
        >
          <span className="brushbar__caret" />
        </button>
      </span>
      {open && anchor && (
        <div
          className="brushbar__slider-pop"
          ref={popRef}
          style={{ top: anchor.bottom + 5, left: Math.max(8, anchor.right - 148) }}
        >
          <span className="brushbar__slider-pop-value">
            {value}
            {unit}
          </span>
          <input
            className="brush-popup__slider"
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => set(e.target.valueAsNumber)}
          />
        </div>
      )}
    </label>
  )
}

/** Photoshop식 브러시 옵션바 — Preset 버튼 + Mode/Opacity/Flow/Smoothing/Angle */
function BrushOptions() {
  const brush = useBrushStore()
  const {
    size,
    hardness,
    opacity, setOpacity,
    flow, setFlow,
    smoothing, setSmoothing,
    angle, setAngle,
    mode, setMode,
    popupOpen, setPopupOpen,
  } = brush
  const presetBtnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  return (
    <>
      <div className="optionsbar__tool-badge" title="브러시 도구">
        <Circle size={14} />
      </div>

      {/* Brush Preset Button — 팁 미리보기 위에 크기 숫자, 옆에 ▾ (Photoshop 스타일) */}
      <button
        type="button"
        ref={presetBtnRef}
        className={`brushbar__preset${popupOpen ? ' brushbar__preset--open' : ''}`}
        title={`브러시 사전 설정 선택 (${size}px)`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          setAnchor(presetBtnRef.current?.getBoundingClientRect() ?? null)
          setPopupOpen(!popupOpen)
        }}
      >
        <span className="brushbar__preset-tip">
          <BrushTipThumb size={22} hardness={hardness} brushSize={size} />
          <span className="brushbar__preset-size">{size}</span>
        </span>
        <span className="brushbar__preset-caretbox">
          <span className="brushbar__caret" />
        </span>
      </button>

      <button type="button" className="optionsbar__icon-btn" title="브러시 설정 패널 전환">
        <SlidersHorizontal size={14} />
      </button>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="페인팅 모드">
        <span className="brushbar__label">모드:</span>
        <select
          className="brushbar__select brushbar__select--wide"
          value={mode}
          onChange={(e) => setMode(e.target.value as BrushMode)}
        >
          {BLEND_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="erase">지우기</option>
        </select>
      </label>

      <div className="optionsbar__sep" />

      <PercentField label="불투명도:" value={opacity} set={setOpacity} title="숫자키 1~0" />
      <button type="button" className="optionsbar__icon-btn optionsbar__icon-btn--stub" title="불투명도에 항상 압력 사용">
        <SprayCan size={13} />
      </button>

      <PercentField label="흐름:" value={flow} set={setFlow} title="Shift+숫자키" />
      <button type="button" className="optionsbar__icon-btn optionsbar__icon-btn--stub" title="에어브러시 스타일 강화 효과 사용">
        <SprayCan size={13} />
      </button>

      <div className="optionsbar__sep" />

      <PercentField label="보정:" value={smoothing} set={setSmoothing} title="획 보정(Smoothing)" />
      <button type="button" className="optionsbar__icon-btn" title="보정 옵션">
        <Settings2 size={13} />
      </button>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="브러시 각도">
        <span className="brushbar__angle-glyph">⊿</span>
        <input
          className="brushbar__input"
          type="number"
          min={-180}
          max={180}
          value={angle}
          onChange={(e) => {
            const v = e.target.valueAsNumber
            if (!Number.isNaN(v)) setAngle(v)
          }}
        />
        <span className="brushbar__unit">°</span>
      </label>

      <div className="optionsbar__sep" />

      <button type="button" className="optionsbar__icon-btn optionsbar__icon-btn--stub" title="크기에 항상 압력 사용">
        <PenLine size={13} />
      </button>

      <BrushPresetPopup anchor={anchor} />
    </>
  )
}

/** Photoshop식 지우개 옵션바 — Brush Engine 재사용, Mode/Protect Alpha 등 지우개 전용 항목 */
function EraserOptions() {
  const brush = useBrushStore()
  const {
    size,
    hardness,
    opacity, setOpacity,
    flow, setFlow,
    smoothing, setSmoothing,
    eraserMode, setEraserMode,
    protectAlpha, setProtectAlpha,
    popupOpen, setPopupOpen,
  } = brush
  const presetBtnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  return (
    <>
      <div className="optionsbar__tool-badge" title="지우개 도구">
        <EraserIcon size={14} />
      </div>

      {/* Eraser Preset Button — Brush 와 동일한 UI */}
      <button
        type="button"
        ref={presetBtnRef}
        className={`brushbar__preset${popupOpen ? ' brushbar__preset--open' : ''}`}
        title={`지우개 사전 설정 선택 (${size}px)`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          setAnchor(presetBtnRef.current?.getBoundingClientRect() ?? null)
          setPopupOpen(!popupOpen)
        }}
      >
        <span className="brushbar__preset-tip">
          <BrushTipThumb size={22} hardness={hardness} brushSize={size} />
          <span className="brushbar__preset-size">{size}</span>
        </span>
        <span className="brushbar__preset-caretbox">
          <span className="brushbar__caret" />
        </span>
      </button>

      <button type="button" className="optionsbar__icon-btn" title="브러시 설정 패널 전환">
        <SlidersHorizontal size={14} />
      </button>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="지우개 모드 (현재 브러시만 동작)">
        <span className="brushbar__label">모드:</span>
        <select
          className="brushbar__select"
          value={eraserMode}
          onChange={(e) => setEraserMode(e.target.value as EraserMode)}
        >
          <option value="brush">브러시</option>
          <option value="pencil">연필</option>
          <option value="block">블록</option>
        </select>
      </label>

      <div className="optionsbar__sep" />

      <PercentField label="불투명도:" value={opacity} set={setOpacity} title="숫자키 1~0" />
      <button type="button" className="optionsbar__icon-btn optionsbar__icon-btn--stub" title="불투명도에 항상 압력 사용">
        <SprayCan size={13} />
      </button>

      <PercentField label="흐름:" value={flow} set={setFlow} title="Shift+숫자키" />
      <button type="button" className="optionsbar__icon-btn optionsbar__icon-btn--stub" title="에어브러시 스타일 강화 효과 사용">
        <SprayCan size={13} />
      </button>

      <div className="optionsbar__sep" />

      <PercentField label="보정:" value={smoothing} set={setSmoothing} title="획 보정(Smoothing)" />
      <button type="button" className="optionsbar__icon-btn" title="보정 옵션">
        <Settings2 size={13} />
      </button>

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="투명 영역 보호 (UI 준비)">
        <input
          type="checkbox"
          checked={protectAlpha}
          onChange={(e) => setProtectAlpha(e.target.checked)}
        />
        <span>알파 보호</span>
      </label>

      <div className="optionsbar__sep" />

      <button type="button" className="optionsbar__icon-btn optionsbar__icon-btn--stub" title="크기에 항상 압력 사용">
        <PenLine size={13} />
      </button>

      <BrushPresetPopup anchor={anchor} variant="eraser" />
    </>
  )
}

/** Photoshop식 복제 도장 옵션바 — Brush Engine/Preset 재사용 + Aligned/Sample/Pressure/Overlay */
function CloneOptions() {
  const brush = useBrushStore()
  const {
    size,
    hardness,
    opacity, setOpacity,
    flow, setFlow,
    mode, setMode,
    popupOpen, setPopupOpen,
  } = brush
  const {
    aligned, setAligned,
    sampleMode, setSampleMode,
    sizePressure, setSizePressure,
    opacityPressure, setOpacityPressure,
    flowPressure, setFlowPressure,
    showOverlay, setShowOverlay,
    overlayOpacity, setOverlayOpacity,
    overlayColor, setOverlayColor,
    showConnection, setShowConnection,
  } = useCloneStore()
  const presetBtnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [srcOpen, setSrcOpen] = useState(false)
  const srcBtnRef = useRef<HTMLButtonElement>(null)
  const srcPopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!srcOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (srcPopRef.current?.contains(t) || srcBtnRef.current?.contains(t)) return
      setSrcOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [srcOpen])

  return (
    <>
      <div className="optionsbar__tool-badge" title="복제 도장 도구">
        <StampIcon size={14} />
      </div>

      {/* Brush Preset Button — Brush 와 동일한 UI 재사용 */}
      <button
        type="button"
        ref={presetBtnRef}
        className={`brushbar__preset${popupOpen ? ' brushbar__preset--open' : ''}`}
        title={`브러시 사전 설정 선택 (${size}px)`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          setAnchor(presetBtnRef.current?.getBoundingClientRect() ?? null)
          setPopupOpen(!popupOpen)
        }}
      >
        <span className="brushbar__preset-tip">
          <BrushTipThumb size={22} hardness={hardness} brushSize={size} />
          <span className="brushbar__preset-size">{size}</span>
        </span>
        <span className="brushbar__preset-caretbox">
          <span className="brushbar__caret" />
        </span>
      </button>

      <button type="button" className="optionsbar__icon-btn" title="브러시 설정 패널 전환">
        <SlidersHorizontal size={14} />
      </button>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="페인팅 모드">
        <span className="brushbar__label">모드:</span>
        <select
          className="brushbar__select brushbar__select--wide"
          value={mode === 'erase' ? 'normal' : mode}
          onChange={(e) => setMode(e.target.value as BrushMode)}
        >
          {BLEND_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="optionsbar__sep" />

      <PercentField label="불투명도:" value={opacity} set={setOpacity} title="복제 불투명도 (Stroke 상한)" />
      <button
        type="button"
        className={`optionsbar__icon-btn${opacityPressure ? '' : ' optionsbar__icon-btn--stub'}`}
        title="불투명도에 항상 압력 사용 (태블릿)"
        aria-pressed={opacityPressure}
        onClick={() => setOpacityPressure(!opacityPressure)}
      >
        <SprayCan size={13} />
      </button>

      <PercentField label="흐름:" value={flow} set={setFlow} title="복제 흐름 (Dab 누적)" />
      <button
        type="button"
        className={`optionsbar__icon-btn${flowPressure ? '' : ' optionsbar__icon-btn--stub'}`}
        title="흐름에 압력 사용 (태블릿)"
        aria-pressed={flowPressure}
        onClick={() => setFlowPressure(!flowPressure)}
      >
        <SprayCan size={13} />
      </button>

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="정렬 — 획 사이에도 Source Offset 유지">
        <input type="checkbox" checked={aligned} onChange={(e) => setAligned(e.target.checked)} />
        <span>정렬</span>
      </label>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="샘플링 범위">
        <span className="brushbar__label">샘플:</span>
        <select
          className="brushbar__select brushbar__select--wide"
          value={sampleMode}
          onChange={(e) => setSampleMode(e.target.value as SampleMode)}
        >
          <option value="current">현재 레이어</option>
          <option value="currentBelow">현재 이하</option>
          <option value="all">모든 레이어</option>
        </select>
      </label>

      {/* 크기에 압력 사용 */}
      <button
        type="button"
        className={`optionsbar__icon-btn${sizePressure ? '' : ' optionsbar__icon-btn--stub'}`}
        title="크기에 항상 압력 사용 (태블릿)"
        aria-pressed={sizePressure}
        onClick={() => setSizePressure(!sizePressure)}
      >
        <PenLine size={13} />
      </button>

      <div className="optionsbar__sep" />

      {/* Clone Source 패널 — Overlay 표시/투명도/색상/연결선 */}
      <button
        ref={srcBtnRef}
        type="button"
        className={`optionsbar__icon-btn${srcOpen ? ' optionsbar__icon-btn--active' : ''}`}
        title="복제 소스 (Overlay) 설정"
        onClick={() => setSrcOpen((v) => !v)}
      >
        <Crosshair size={14} />
      </button>
      {srcOpen && (
        <div
          ref={srcPopRef}
          className="clone-source-pop"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="clone-source-pop__title">복제 소스</div>
          <label className="optionsbar__check">
            <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
            <span>오버레이 표시</span>
          </label>
          <label className="clone-source-pop__row">
            <span>불투명도</span>
            <select
              className="brushbar__select"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            >
              {[0, 25, 50, 75, 100].map((v) => (
                <option key={v} value={v}>{v}%</option>
              ))}
            </select>
          </label>
          <label className="clone-source-pop__row">
            <span>색상</span>
            <select
              className="brushbar__select"
              value={overlayColor}
              onChange={(e) => setOverlayColor(e.target.value as OverlayColor)}
            >
              <option value="cyan">녹청 (Cyan)</option>
              <option value="green">녹색 (Green)</option>
              <option value="red">빨강 (Red)</option>
              <option value="orange">주황 (Orange)</option>
            </select>
          </label>
          <label className="optionsbar__check">
            <input type="checkbox" checked={showConnection} onChange={(e) => setShowConnection(e.target.checked)} />
            <span>연결선 표시</span>
          </label>
        </div>
      )}

      <BrushPresetPopup anchor={anchor} />
    </>
  )
}

/** Photoshop식 복구 브러시 옵션바 — Preset/Mode/Source/Aligned/Sample/Diffusion */
function HealingOptions() {
  const brush = useBrushStore()
  const { size, hardness, mode, setMode, popupOpen, setPopupOpen } = brush
  const {
    aligned, setAligned,
    sampleMode, setSampleMode,
    diffusion, setDiffusion,
    source, setSource,
  } = useHealingStore()
  const presetBtnRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  return (
    <>
      <div className="optionsbar__tool-badge" title="복구 브러시 도구">
        <Bandage size={14} />
      </div>

      {/* Brush Preset Button (Brush UI 재사용) */}
      <button
        type="button"
        ref={presetBtnRef}
        className={`brushbar__preset${popupOpen ? ' brushbar__preset--open' : ''}`}
        title={`브러시 사전 설정 선택 (${size}px)`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          setAnchor(presetBtnRef.current?.getBoundingClientRect() ?? null)
          setPopupOpen(!popupOpen)
        }}
      >
        <span className="brushbar__preset-tip">
          <BrushTipThumb size={22} hardness={hardness} brushSize={size} />
          <span className="brushbar__preset-size">{size}</span>
        </span>
        <span className="brushbar__preset-caretbox">
          <span className="brushbar__caret" />
        </span>
      </button>

      <button type="button" className="optionsbar__icon-btn" title="브러시 설정 패널 전환">
        <SlidersHorizontal size={14} />
      </button>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="페인팅 모드">
        <span className="brushbar__label">모드:</span>
        <select
          className="brushbar__select brushbar__select--wide"
          value={mode === 'erase' ? 'normal' : mode}
          onChange={(e) => setMode(e.target.value as BrushMode)}
        >
          {BLEND_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="소스 종류">
        <span className="brushbar__label">소스:</span>
        <select
          className="brushbar__select"
          value={source}
          onChange={(e) => setSource(e.target.value as HealingSource)}
        >
          <option value="sampled">샘플</option>
          <option value="pattern">패턴</option>
        </select>
      </label>

      <label className="optionsbar__check" title="정렬 — 획 사이에도 Source Offset 유지">
        <input type="checkbox" checked={aligned} onChange={(e) => setAligned(e.target.checked)} />
        <span>정렬</span>
      </label>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="샘플링 범위">
        <span className="brushbar__label">샘플:</span>
        <select
          className="brushbar__select brushbar__select--wide"
          value={sampleMode}
          onChange={(e) => setSampleMode(e.target.value as SampleMode)}
        >
          <option value="current">현재 레이어</option>
          <option value="currentBelow">현재 이하</option>
          <option value="all">모든 레이어</option>
        </select>
      </label>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="확산 (경계가 퍼지는 정도)">
        <span className="brushbar__label">확산:</span>
        <select
          className="brushbar__select brushbar__select--sm"
          value={diffusion}
          onChange={(e) => setDiffusion(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>

      <BrushPresetPopup anchor={anchor} />
    </>
  )
}

/** Photoshop식 펜 도구 옵션바 — Mode(패스/모양) + 만들기(선택/마스크/모양) + 옵션 */
function PenOptions() {
  const { penMode, setPenMode, rubberBand, setRubberBand, autoAddDelete, setAutoAddDelete } = usePathStore()
  const { makeSelection, hasActivePath } = usePathActions()
  const { toast } = useOpenStore()

  return (
    <>
      <div className="optionsbar__tool-badge" title="펜 도구">
        <PenTool size={14} />
      </div>

      <label className="brushbar__field" title="도구 모드">
        <select
          className="brushbar__select brushbar__select--wide"
          value={penMode}
          onChange={(e) => setPenMode(e.target.value as PenMode)}
        >
          <option value="path">패스</option>
          <option value="shape">모양</option>
          <option value="pixels">픽셀</option>
        </select>
      </label>

      <div className="optionsbar__sep" />

      <span className="optionsbar__label-plain">만들기:</span>
      <button
        type="button"
        className="optionsbar__btn"
        disabled={!hasActivePath}
        title="패스를 선택 영역으로 (Make Selection)"
        onClick={makeSelection}
      >
        선택...
      </button>
      <button
        type="button"
        className="optionsbar__btn"
        title="벡터 마스크 (구조 준비)"
        onClick={() => toast('벡터 마스크는 준비 중입니다.', 'info')}
      >
        마스크
      </button>
      <button
        type="button"
        className="optionsbar__btn"
        title="셰이프 레이어 (구조 준비)"
        onClick={() => toast('셰이프 레이어는 준비 중입니다.', 'info')}
      >
        모양
      </button>

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="세그먼트 위에서 Anchor 추가, Anchor 위에서 삭제">
        <input type="checkbox" checked={autoAddDelete} onChange={(e) => setAutoAddDelete(e.target.checked)} />
        <span>자동 추가/삭제</span>
      </label>

      <label className="optionsbar__check" title="고무줄 미리보기">
        <input type="checkbox" checked={rubberBand} onChange={(e) => setRubberBand(e.target.checked)} />
        <span>고무줄</span>
      </label>
    </>
  )
}

const SHAPE_KIND_ICON: Record<ShapeKind, typeof SquareIcon> = {
  rectangle: SquareIcon,
  roundRect: Squircle,
  ellipse: Circle,
  polygon: Hexagon,
  line: Slash,
  custom: Shapes,
}

const SHAPE_KIND_LABEL: Record<ShapeKind, string> = {
  rectangle: '사각형 도구',
  roundRect: '모서리가 둥근 직사각형 도구',
  ellipse: '타원 도구',
  polygon: '다각형 도구',
  line: '선 도구',
  custom: '사용자 정의 모양 도구',
}

/** 색상 스와치 버튼 — 네이티브 color input 을 감싼 Photoshop식 칠/획 색상 선택 */
function ColorSwatch({
  label,
  color,
  enabled,
  onColor,
  onToggle,
}: {
  label: string
  color: string
  enabled: boolean
  onColor: (c: string) => void
  onToggle: () => void
}) {
  return (
    <label className="shapebar__swatch-field" title={`${label} 색상`}>
      <span className="brushbar__label">{label}:</span>
      <button
        type="button"
        className={`shapebar__swatch${enabled ? '' : ' shapebar__swatch--off'}`}
        title={enabled ? `${label} 사용 안 함` : `${label} 사용`}
        onClick={(e) => {
          e.preventDefault()
          onToggle()
        }}
        style={{ background: enabled ? color : undefined }}
      >
        {!enabled && <Slash size={13} />}
      </button>
      <input
        type="color"
        className="shapebar__color-input"
        value={color}
        title={`${label} 색상 선택`}
        onChange={(e) => onColor(e.target.value)}
      />
    </label>
  )
}

/** Photoshop식 모양 도구 옵션바 — Mode/Fill/Stroke/Width/Align/Radius/W·H/Operation */
function ShapeOptions() {
  const s = useShapeStore()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const Icon = SHAPE_KIND_ICON[s.kind]

  const activeShape =
    doc?.layers.find((l) => l.id === doc.activeLayerId && l.type === 'shape' && l.shape) ?? null

  /** 선택된 Shape Layer 의 스펙을 갱신 (History 1개). shape 없으면 스토어 기본값만 변경 */
  const patchShape = (
    mutate: (shape: NonNullable<typeof activeShape>['shape']) => object,
    label: string,
  ) => {
    if (!activeShape?.shape) return
    dispatch({
      type: 'UPDATE_SHAPE',
      id: activeShape.id,
      patch: { shape: { ...activeShape.shape, ...mutate(activeShape.shape) } },
      label,
    })
  }

  const setFillColor = (c: string) => {
    s.setFillColor(c)
    s.setFillEnabled(true)
    patchShape((sh) => ({ fill: { ...sh!.fill, color: c, enabled: true } }), '칠 변경')
  }
  const toggleFill = () => {
    const next = !s.fillEnabled
    s.setFillEnabled(next)
    patchShape((sh) => ({ fill: { ...sh!.fill, enabled: next } }), '칠 변경')
  }
  const setStrokeColor = (c: string) => {
    s.setStrokeColor(c)
    s.setStrokeEnabled(true)
    patchShape((sh) => ({ stroke: { ...sh!.stroke, color: c, enabled: true } }), '획 변경')
  }
  const toggleStroke = () => {
    const next = !s.strokeEnabled
    s.setStrokeEnabled(next)
    patchShape((sh) => ({ stroke: { ...sh!.stroke, enabled: next } }), '획 변경')
  }
  const setStrokeWidth = (w: number) => {
    const v = Math.max(0, w)
    s.setStrokeWidth(v)
    patchShape((sh) => ({ stroke: { ...sh!.stroke, width: v, enabled: sh!.stroke.enabled || v > 0 } }), '획 두께 변경')
  }
  const setStrokeAlign = (a: StrokeAlign) => {
    s.setStrokeAlign(a)
    patchShape((sh) => ({ stroke: { ...sh!.stroke, align: a } }), '획 위치 변경')
  }
  const setRadius = (r: number) => {
    const v = Math.max(0, r)
    s.setRadius(v)
    if (activeShape?.shape?.kind === 'roundRect') {
      patchShape(
        () => ({ radius: v, path: buildShapePath('roundRect', activeShape.width, activeShape.height, v) }),
        '모서리 반경 변경',
      )
    }
  }

  const showRadius = s.kind === 'roundRect' || activeShape?.shape?.kind === 'roundRect'

  return (
    <>
      <div className="optionsbar__tool-badge" title={SHAPE_KIND_LABEL[s.kind]}>
        <Icon size={14} />
      </div>

      <label className="brushbar__field" title="도구 모드">
        <select
          className="brushbar__select brushbar__select--wide"
          value={s.mode}
          onChange={(e) => s.setMode(e.target.value as 'shape' | 'path' | 'pixels')}
        >
          <option value="shape">모양</option>
          <option value="path">패스</option>
          <option value="pixels">픽셀</option>
        </select>
      </label>

      <div className="optionsbar__sep" />

      <ColorSwatch
        label="칠"
        color={activeShape?.shape?.fill.color ?? s.fillColor}
        enabled={activeShape?.shape ? activeShape.shape.fill.enabled : s.fillEnabled}
        onColor={setFillColor}
        onToggle={toggleFill}
      />
      <ColorSwatch
        label="획"
        color={activeShape?.shape?.stroke.color ?? s.strokeColor}
        enabled={activeShape?.shape ? activeShape.shape.stroke.enabled : s.strokeEnabled}
        onColor={setStrokeColor}
        onToggle={toggleStroke}
      />

      <label className="brushbar__field" title="획 두께">
        <span className="brushbar__label">획:</span>
        <input
          className="brushbar__input"
          type="number"
          min={0}
          max={1000}
          value={activeShape?.shape?.stroke.width ?? s.strokeWidth}
          onChange={(e) => {
            const v = e.target.valueAsNumber
            if (!Number.isNaN(v)) setStrokeWidth(v)
          }}
        />
        <span className="brushbar__unit">px</span>
      </label>

      <label className="brushbar__field" title="획 위치 (현재 Center 완전 구현)">
        <select
          className="brushbar__select"
          value={activeShape?.shape?.stroke.align ?? s.strokeAlign}
          onChange={(e) => setStrokeAlign(e.target.value as StrokeAlign)}
        >
          <option value="inside">안쪽</option>
          <option value="center">가운데</option>
          <option value="outside">바깥쪽</option>
        </select>
      </label>

      {showRadius && (
        <>
          <div className="optionsbar__sep" />
          <label className="brushbar__field" title="모서리 반경">
            <Radius size={13} />
            <input
              className="brushbar__input"
              type="number"
              min={0}
              max={1000}
              value={activeShape?.shape?.radius ?? s.radius}
              onChange={(e) => {
                const v = e.target.valueAsNumber
                if (!Number.isNaN(v)) setRadius(v)
              }}
            />
            <span className="brushbar__unit">px</span>
          </label>
        </>
      )}

      {activeShape && (
        <>
          <div className="optionsbar__sep" />
          <label className="brushbar__field" title="폭">
            <span className="brushbar__label">W:</span>
            <input className="brushbar__input" type="number" value={Math.round(activeShape.width)} readOnly />
          </label>
          <label className="brushbar__field" title="높이">
            <span className="brushbar__label">H:</span>
            <input className="brushbar__input" type="number" value={Math.round(activeShape.height)} readOnly />
          </label>
        </>
      )}

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="패스 정렬/결합 (Boolean Operation — 구조 준비)">
        <select className="brushbar__select" defaultValue="new" disabled>
          <option value="new">새 레이어</option>
          <option value="add">모양 결합</option>
          <option value="subtract">전면 모양 빼기</option>
          <option value="intersect">모양 영역 교차</option>
        </select>
      </label>
    </>
  )
}

const TEXT_FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Impact',
  'Comic Sans MS',
  'Malgun Gothic',
  'Nanum Gothic',
  'Noto Sans KR',
]

const TEXT_STYLES: { label: string; weight: number; style: 'normal' | 'italic' }[] = [
  { label: 'Regular', weight: 400, style: 'normal' },
  { label: 'Italic', weight: 400, style: 'italic' },
  { label: 'Bold', weight: 700, style: 'normal' },
  { label: 'Bold Italic', weight: 700, style: 'italic' },
]

/** Photoshop식 문자 도구 옵션바 — Font/Style/Size/AntiAlias/Alignment/Color/Warp */
function TextOptions() {
  const t = useTextStore()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const [warpOpen, setWarpOpen] = useState(false)
  const target =
    doc?.layers.find((l) => l.id === doc.activeLayerId && l.type === 'text' && l.text) ?? null
  const cur = target?.text
  const activePathId = doc?.activePathId ?? null
  const onPath = !!cur?.pathId

  const apply = (partial: Partial<TextSpec>, label: string) => {
    if (!target?.text) return
    const next: TextSpec = { ...target.text, ...partial }
    const m = measureTextSpec(next)
    dispatch({
      type: 'UPDATE_TEXT',
      id: target.id,
      patch: { text: next, width: m.width, height: m.height, name: textLayerName(next.content) },
      label,
    })
  }

  const fontFamily = cur?.fontFamily ?? t.fontFamily
  const fontSize = cur?.fontSize ?? t.fontSize
  const weight = cur?.fontWeight ?? t.fontWeight
  const style = cur?.fontStyle ?? t.fontStyle
  const antiAlias = cur?.antiAlias ?? t.antiAlias
  const alignment = cur?.alignment ?? t.alignment
  const color = cur?.color ?? t.color
  const tracking = cur?.tracking ?? t.tracking
  const leading = cur?.leading ?? t.leading
  const styleLabel = TEXT_STYLES.find((p) => p.weight === weight && p.style === style)?.label ?? 'Regular'

  const setFamily = (v: string) => {
    t.setFontFamily(v)
    apply({ fontFamily: v }, '글꼴 변경')
  }
  const setStyle = (label: string) => {
    const p = TEXT_STYLES.find((x) => x.label === label) ?? TEXT_STYLES[0]
    t.setFontWeight(p.weight)
    t.setFontStyle(p.style)
    apply({ fontWeight: p.weight, fontStyle: p.style }, '글꼴 스타일 변경')
  }
  const setSize = (v: number) => {
    const n = Math.max(1, v)
    t.setFontSize(n)
    apply({ fontSize: n }, '글꼴 크기 변경')
  }
  const setAA = (v: TextAntiAlias) => {
    t.setAntiAlias(v)
    apply({ antiAlias: v }, 'Anti-Alias 변경')
  }
  const setAlign = (v: TextAlign) => {
    t.setAlignment(v)
    apply({ alignment: v }, '단락 정렬 변경')
  }
  const setColor = (v: string) => {
    t.setColor(v)
    apply({ color: v }, '색상 변경')
  }
  const setTracking = (v: number) => {
    t.setTracking(v)
    apply({ tracking: v }, '자간 변경')
  }
  const setLeading = (v: number) => {
    const n = Math.max(0, v)
    t.setLeading(n)
    apply({ leading: n }, '행간 변경')
  }

  const vertical = (cur?.orientation ?? (t.kind === 'vertical' ? 'vertical' : 'horizontal')) === 'vertical'

  return (
    <>
      <div className="optionsbar__tool-badge" title={vertical ? '세로 문자 도구' : '수평 문자 도구'}>
        <TypeIcon size={14} style={vertical ? { transform: 'rotate(90deg)' } : undefined} />
      </div>

      <select className="brushbar__select brushbar__select--wide" title="글꼴" value={fontFamily} onChange={(e) => setFamily(e.target.value)}>
        {TEXT_FONTS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select className="brushbar__select" title="글꼴 스타일" value={styleLabel} onChange={(e) => setStyle(e.target.value)}>
        {TEXT_STYLES.map((p) => (
          <option key={p.label} value={p.label}>
            {p.label}
          </option>
        ))}
      </select>

      <label className="brushbar__field" title="글꼴 크기">
        <span className="brushbar__angle-glyph">T</span>
        <input
          className="brushbar__input"
          type="number"
          min={1}
          value={Math.round(fontSize)}
          onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setSize(e.target.valueAsNumber)}
        />
        <span className="brushbar__unit">pt</span>
      </label>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="앤티 앨리어스">
        <select className="brushbar__select" value={antiAlias} onChange={(e) => setAA(e.target.value as TextAntiAlias)}>
          <option value="none">없음</option>
          <option value="sharp">선명하게</option>
          <option value="crisp">뚜렷하게</option>
          <option value="strong">강하게</option>
          <option value="smooth">매끄럽게</option>
        </select>
      </label>

      <div className="optionsbar__sep" />

      <label className="brushbar__field" title="자간 (트래킹)">
        <span className="brushbar__label">VA</span>
        <input
          className="brushbar__input"
          type="number"
          value={Math.round(tracking)}
          onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setTracking(e.target.valueAsNumber)}
        />
      </label>
      <label className="brushbar__field" title="행간 (0 = 자동)">
        <span className="brushbar__label">행간</span>
        <input
          className="brushbar__input"
          type="number"
          min={0}
          value={Math.round(leading)}
          onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setLeading(e.target.valueAsNumber)}
        />
      </label>

      <div className="optionsbar__sep" />

      <div className="textbar__align-group">
        <button type="button" className={`optionsbar__bool${alignment === 'left' ? ' optionsbar__bool--active' : ''}`} title="왼쪽 정렬" onClick={() => setAlign('left')}>
          <AlignLeft size={13} />
        </button>
        <button type="button" className={`optionsbar__bool${alignment === 'center' ? ' optionsbar__bool--active' : ''}`} title="가운데 정렬" onClick={() => setAlign('center')}>
          <AlignCenter size={13} />
        </button>
        <button type="button" className={`optionsbar__bool${alignment === 'right' ? ' optionsbar__bool--active' : ''}`} title="오른쪽 정렬" onClick={() => setAlign('right')}>
          <AlignRight size={13} />
        </button>
      </div>

      <div className="optionsbar__sep" />

      <label className="shapebar__swatch-field" title="텍스트 색상">
        <span className="brushbar__label">색상:</span>
        <input type="color" className="textbar__swatch" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>

      <div className="optionsbar__sep" />

      <button
        type="button"
        className="optionsbar__btn"
        title="뒤틀어진 텍스트 만들기"
        disabled={!target}
        onClick={() => setWarpOpen(true)}
      >
        뒤틀기
      </button>
      <button
        type="button"
        className={`optionsbar__btn${onPath ? ' optionsbar__btn--active' : ''}`}
        title={onPath ? '패스에서 분리' : '패스를 따라 텍스트 배치 (활성 패스 필요)'}
        disabled={!target || (!activePathId && !onPath)}
        onClick={() => apply({ pathId: onPath ? null : activePathId }, onPath ? '패스에서 분리' : '패스에 배치')}
      >
        {onPath ? '패스 해제' : '패스에 배치'}
      </button>
      <button
        type="button"
        className={`optionsbar__icon-btn${t.panelOpen ? ' optionsbar__icon-btn--active' : ''}`}
        title="문자 및 단락 패널 전환"
        onClick={() => t.setPanelOpen(!t.panelOpen)}
      >
        <PanelRight size={14} />
      </button>
      {warpOpen && target && <WarpDialog layerId={target.id} onClose={() => setWarpOpen(false)} />}
    </>
  )
}

/** Photoshop식 자르기 도구 옵션바 — W/H/해상도/픽셀 삭제/기울기 보정/적용·취소 */
function CropOptions() {
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const crop = useCropStore()
  const box = crop.box

  const setW = (w: number) => crop.setBox({ ...box, width: Math.max(1, w) })
  const setH = (h: number) => crop.setBox({ ...box, height: Math.max(1, h) })

  const commit = () => {
    if (!crop.active) return
    dispatch({ type: 'CROP', box: crop.box, angle: crop.angle, deleteCropped: crop.deleteCropped })
    crop.cancel()
  }
  const reset = () => {
    if (doc) crop.begin(doc.id, { x: 0, y: 0, width: doc.width, height: doc.height })
  }

  return (
    <>
      <div className="optionsbar__tool-badge" title="자르기 도구">
        <CropIcon size={15} />
      </div>

      <label className="optionsbar__field">
        <span>폭:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={Math.round(box.width)}
          onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setW(e.target.valueAsNumber)}
        />
        <span className="optionsbar__unit">픽셀</span>
      </label>
      <label className="optionsbar__field">
        <span>높이:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={Math.round(box.height)}
          onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setH(e.target.valueAsNumber)}
        />
        <span className="optionsbar__unit">픽셀</span>
      </label>
      <label className="optionsbar__field">
        <span>해상도:</span>
        <input className="optionsbar__input" type="number" value={doc?.resolution ?? 72} readOnly />
        <span className="optionsbar__unit">ppi</span>
      </label>

      <div className="optionsbar__sep" />

      <label className="optionsbar__field" title="기울기 보정 각도">
        <span>각도:</span>
        <input
          className="optionsbar__input"
          type="number"
          value={Math.round(crop.angle * 10) / 10}
          onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && crop.setAngle(e.target.valueAsNumber)}
        />
        <span className="optionsbar__unit">°</span>
      </label>
      <button
        type="button"
        className={`optionsbar__btn${crop.straighten ? ' optionsbar__btn--active' : ''}`}
        title="수평선을 드래그하여 기울기 보정"
        onClick={() => crop.setStraighten(!crop.straighten)}
      >
        기울기 보정
      </button>

      <div className="optionsbar__sep" />

      <label className="optionsbar__check" title="잘린 픽셀 삭제 (해제 시 비파괴)">
        <input type="checkbox" checked={crop.deleteCropped} onChange={(e) => crop.setDeleteCropped(e.target.checked)} />
        <span>잘린 픽셀 삭제</span>
      </label>
      <label className="optionsbar__check" title="내용 인식 (준비 중)">
        <input type="checkbox" disabled />
        <span>내용 인식</span>
      </label>

      <div className="optionsbar__sep" />

      <button type="button" className="optionsbar__btn" title="재설정" onClick={reset}>
        재설정
      </button>
      <button type="button" className="optionsbar__icon-btn" title="취소 (ESC)" onClick={reset}>
        <XIcon size={14} />
      </button>
      <button type="button" className="optionsbar__icon-btn optionsbar__icon-btn--primary" title="적용 (Enter)" onClick={commit}>
        <Check size={14} />
      </button>
    </>
  )
}

export function OptionsBar() {
  const { activeTool } = useEditor()
  const { active: transformActive } = useTransformStore()
  const isSelection = activeTool === 'marquee' || activeTool === 'lasso'
  return (
    <div className="optionsbar" title={TOOL_TITLES[activeTool]}>
      {transformActive ? (
        <TransformOptions />
      ) : activeTool === 'brush' ? (
        <BrushOptions />
      ) : activeTool === 'eraser' ? (
        <EraserOptions />
      ) : activeTool === 'stamp' ? (
        <CloneOptions />
      ) : activeTool === 'healing' ? (
        <HealingOptions />
      ) : activeTool === 'pen' ? (
        <PenOptions />
      ) : activeTool === 'shape' ? (
        <ShapeOptions />
      ) : activeTool === 'gradient' ? (
        <GradientOptions />
      ) : activeTool === 'eyedropper' ? (
        <EyedropperOptions />
      ) : activeTool === 'bucket' ? (
        <BucketOptions />
      ) : activeTool === 'wand' ? (
        <WandOptions />
      ) : activeTool === 'text' ? (
        <TextOptions />
      ) : activeTool === 'crop' ? (
        <CropOptions />
      ) : activeTool === 'move' ? (
        <MoveOptions />
      ) : isSelection ? (
        <SelectionOptions />
      ) : (
        <MarqueeOptions />
      )}
    </div>
  )
}
