import { useLayoutEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, X, Package } from 'lucide-react'
import { useActiveDocument, useEditor, useEditorDispatch } from '../state'
import { useViewport } from '../hooks/useViewport'
import { useMoveTool } from '../hooks/useMoveTool'
import { useMoveStore } from '../store/moveStore'
import { useDocumentStore } from '../store/documentStore'
import { useTransformStore } from '../store/transformStore'
import { useTransformTool } from '../hooks/useTransformTool'
import { useSelectionTool } from '../hooks/useSelectionTool'
import { useBrushTool } from '../hooks/useBrushTool'
import { useCloneTool } from '../hooks/useCloneTool'
import { useHealingTool } from '../hooks/useHealingTool'
import { usePenTool } from '../hooks/usePenTool'
import { useShapeTool } from '../hooks/useShapeTool'
import { useShapeStore } from '../store/shapeStore'
import { useTextTool } from '../hooks/useTextTool'
import { useTextStore } from '../store/textStore'
import { TextEditorOverlay } from './canvas/TextEditorOverlay'
import { useCropTool } from '../hooks/useCropTool'
import { useGradientTool } from '../hooks/useGradientTool'
import { useGradientStore } from '../store/gradientStore'
import { useEyedropperTool } from '../hooks/useEyedropperTool'
import { useEyedropperStore } from '../store/eyedropperStore'
import { usePaintBucketTool } from '../hooks/usePaintBucketTool'
import { useBucketStore } from '../store/bucketStore'
import { useMagicWandTool } from '../hooks/useMagicWandTool'
import { useWandStore } from '../store/wandStore'
import { rgbToCmyk, rgbToHex, rgbToHsl, rgbToHsv, SAMPLE_SIZES, SAMPLE_SOURCES } from '../engine/samplingEngine'
import { useCropStore } from '../store/cropStore'
import { CropOverlay } from './canvas/CropOverlay'
import { TypePanels } from './TypePanels'
import { useBrushCursor } from '../hooks/useBrushCursor'
import { useCloneStore } from '../store/cloneStore'
import { useHealingStore } from '../store/healingStore'
import { useClipboardStore } from '../store/clipboardStore'
import { ToolContextMenu } from './brush/ToolContextMenu'
import { PathContextMenu } from './PathContextMenu'
import { EditContextMenu } from './EditContextMenu'
import { useFilterStore } from '../store/filterStore'
import { useBrushStore } from '../store/brushStore'
import { getActiveEngine } from '../engine/renderEngine'
import { Ruler } from './Ruler'
import { FloatingAIBar } from './FloatingAIBar'
import { LayerCanvas } from './canvas/LayerCanvas'
import { BoundingBox } from './canvas/BoundingBox'
import { TransformBox } from './canvas/TransformBox'
import { SelectionOverlay } from './canvas/SelectionOverlay'

/** Status Bar — Magic Wand 상태 (옵션 요약/선택 픽셀 수) */
function WandStatus() {
  const { activeTool } = useEditor()
  const w = useWandStore()
  if (activeTool !== 'wand') return null
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-paint">
        자동 선택 · 허용치 {w.tolerance}
        {w.contiguous ? ' · 인접' : ' · 전체'}
        {w.antiAlias ? ' · AA' : ''}
        {w.sampleAll ? ' · 모든 레이어' : ''}
        {w.status ? ` · ${w.status}` : ' · 클릭=선택 · Shift=추가 · Alt=빼기 · Shift+Alt=교차'}
      </span>
    </>
  )
}

/** Status Bar — Paint Bucket 상태 (옵션 요약/최근 적용) */
function BucketStatus() {
  const { activeTool } = useEditor()
  const active = useActiveDocument()
  const b = useBucketStore()
  if (activeTool !== 'bucket') return null
  const layer = active?.layers.find((l) => l.id === active.activeLayerId)
  const masking = active?.activeTarget === 'mask' && !!layer?.mask
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-paint">
        페인트 통 · {b.fillType === 'pattern' ? '패턴' : '전경색'} · 허용치 {b.tolerance}
        {b.contiguous ? ' · 인접' : ' · 전체'}
        {b.antiAlias ? ' · AA' : ''}
        {b.sampleAll ? ' · 모든 레이어' : ''}
        {masking ? ' · 레이어 마스크' : ''}
        {active?.selection.active ? ' · 선택 영역 내' : ''} · 클릭하여 채우기
      </span>
    </>
  )
}

/** Status Bar — Eyedropper 색상 판독 (RGB/HEX/HSL/HSV/CMYK) */
function EyedropperStatus() {
  const { activeTool } = useEditor()
  const { hover, sampleSize, sampleSource, maskSampling } = useEyedropperStore()
  if (activeTool !== 'eyedropper') return null
  const sizeLabel = SAMPLE_SIZES.find((s) => s.value === sampleSize)?.label ?? ''
  const srcLabel = SAMPLE_SOURCES.find((s) => s.value === sampleSource)?.label ?? ''
  if (!hover)
    return (
      <>
        <span className="canvas__status-sep">|</span>
        <span className="canvas__status-paint">
          스포이드 · {sizeLabel} · {srcLabel} · 클릭=전경색 · Alt+클릭=배경색
        </span>
      </>
    )
  const hsl = rgbToHsl(hover)
  const hsv = rgbToHsv(hover)
  const cmyk = rgbToCmyk(hover)
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-eyedrop">
        <span className="canvas__status-eyedrop-swatch" style={{ background: rgbToHex(hover) }} />
        {maskSampling && '마스크 '}
        RGB {hover.r} {hover.g} {hover.b} · {rgbToHex(hover)} · HSL {hsl.h}° {hsl.s}% {hsl.l}% ·
        HSV {hsv.h}° {hsv.s}% {hsv.v}% · CMYK {cmyk.c} {cmyk.m} {cmyk.y} {cmyk.k}
      </span>
    </>
  )
}

/** Status Bar — Gradient Tool 상태 (안내/최근 적용) */
function GradientStatus() {
  const { activeTool } = useEditor()
  const active = useActiveDocument()
  const { status, gradientType, gradient } = useGradientStore()
  if (activeTool !== 'gradient') return status ? (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-filter">{status}</span>
    </>
  ) : null
  const layer = active?.layers.find((l) => l.id === active.activeLayerId)
  const masking = active?.activeTarget === 'mask' && !!layer?.mask
  const typeLabel: Record<string, string> = {
    linear: '선형',
    radial: '방사형',
    angle: '각도',
    reflected: '반사',
    diamond: '다이아몬드',
  }
  const target = masking
    ? '레이어 마스크'
    : layer?.type === 'shape'
      ? '모양 칠'
      : layer?.type === 'text'
        ? '텍스트 칠'
        : '비트맵'
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-paint">
        그라디언트 도구 · {typeLabel[gradientType]} · {gradient.name} · 대상: {target}
        {active?.selection.active && ' · 선택 영역 내'} · 드래그하여 적용 · Shift 45°
      </span>
    </>
  )
}

/** Status Bar — Filter 상태 (미리보기/적용/취소) */
function FilterStatus() {
  const { status } = useFilterStore()
  if (!status) return null
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-filter">{status}</span>
    </>
  )
}

/** Status Bar — Brush/Eraser 상태 (대상/잠금/선택 영역/크기/경도) */
function PaintStatus() {
  const { activeTool } = useEditor()
  const active = useActiveDocument()
  const { size, hardness } = useBrushStore()
  if (activeTool !== 'brush' && activeTool !== 'eraser') return null
  const layer = active?.layers.find((l) => l.id === active.activeLayerId)
  const masking = active?.activeTarget === 'mask' && !!layer?.mask
  const locked = !layer || layer.locked || (!masking && layer.type === 'background')
  const toolName = activeTool === 'eraser' ? '지우개 도구' : '브러시 도구'
  const action = locked
    ? '레이어 잠김'
    : activeTool === 'eraser'
      ? masking
        ? '레이어 마스크 지우기'
        : '비트맵 지우기'
      : masking
        ? '마스크 페인트'
        : '비트맵 페인트'
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className={`canvas__status-paint${locked ? ' canvas__status-paint--locked' : ''}`}>
        {toolName} · {action}
        {active?.selection.active && ' · 선택 영역 내'}
        {` · ${size}px · ${hardness}%`}
      </span>
    </>
  )
}

/** Status Bar — Clone Stamp 상태 (Source 안내 / 대상 / 잠금 / 선택 영역) */
function CloneStatus() {
  const { activeTool } = useEditor()
  const active = useActiveDocument()
  const { size, hardness } = useBrushStore()
  const { source, sourceDocId, aligned } = useCloneStore()
  if (activeTool !== 'stamp') return null
  const layer = active?.layers.find((l) => l.id === active.activeLayerId)
  const masking = active?.activeTarget === 'mask' && !!layer?.mask
  const hasSource = !!source && sourceDocId === active?.id
  const locked = !layer || layer.locked || masking || layer.type === 'background' || layer.type === 'group'
  const msg = masking
    ? 'Clone Stamp cannot be used on layer masks.'
    : !hasSource
      ? 'Alt-click to define a source point'
      : `복제 도장${locked ? ' · 레이어 잠김' : ''}${active?.selection.active ? ' · 선택 영역 내' : ''}${aligned ? ' · 정렬' : ''}`
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span
        className={`canvas__status-paint${!hasSource || locked || masking ? ' canvas__status-paint--locked' : ''}`}
      >
        {msg}
        {hasSource && !locked && !masking && ` · ${size}px · ${hardness}%`}
      </span>
    </>
  )
}

/** Status Bar — Healing Brush 상태 (Source 안내 / 대상 / 잠금 / 확산) */
function HealStatus() {
  const { activeTool } = useEditor()
  const active = useActiveDocument()
  const { size } = useBrushStore()
  const { sourcePoint, sourceDocId, aligned, diffusion } = useHealingStore()
  if (activeTool !== 'healing') return null
  const layer = active?.layers.find((l) => l.id === active.activeLayerId)
  const masking = active?.activeTarget === 'mask' && !!layer?.mask
  const hasSource = !!sourcePoint && sourceDocId === active?.id
  const locked = !layer || layer.locked || masking || layer.type === 'background' || layer.type === 'group'
  const msg = masking
    ? 'Healing Brush cannot be used on layer masks.'
    : !hasSource
      ? 'Alt-click to define a source point'
      : `복구 브러시${locked ? ' · 레이어 잠김' : ''}${active?.selection.active ? ' · 선택 영역 내' : ''}${aligned ? ' · 정렬' : ''} · 확산 ${diffusion}`
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className={`canvas__status-paint${!hasSource || locked || masking ? ' canvas__status-paint--locked' : ''}`}>
        {msg}
        {hasSource && !locked && !masking && ` · ${size}px`}
      </span>
    </>
  )
}

/** Status Bar — Clipboard 최근 동작 (복사/붙여넣기/오려두기 …) */
function ClipboardStatus() {
  const { status } = useClipboardStore()
  if (!status) return null
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-clip">{status}</span>
    </>
  )
}

/** Status Bar — Pen Tool 상태 (활성 패스 / Anchor 수 / 안내) */
function PenStatus() {
  const { activeTool } = useEditor()
  const active = useActiveDocument()
  if (activeTool !== 'pen') return null
  const path = active?.paths?.find((p) => p.id === active.activePathId)
  const n = path?.points.length ?? 0
  const msg = !path
    ? '클릭하여 Anchor 추가 · 드래그로 Bezier Handle · 첫 Anchor 클릭 또는 Enter로 완료'
    : `${path.name} · ${n}개 기준점${path.closed ? ' · 닫힘' : ''} · Enter 완료 · ESC 취소 · Ctrl 이동 · Alt 분리`
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-paint">{msg}</span>
    </>
  )
}

/** Status Bar — Shape Tool 상태 (도형 종류 / 안내 / 선택된 모양) */
function ShapeStatus() {
  const { activeTool } = useEditor()
  const active = useActiveDocument()
  const { kind } = useShapeStore()
  if (activeTool !== 'shape') return null
  const kindLabel: Record<string, string> = {
    rectangle: '사각형',
    roundRect: '둥근 사각형',
    ellipse: '타원',
    polygon: '다각형',
    line: '선',
    custom: '사용자 정의 모양',
  }
  const layer = active?.layers.find((l) => l.id === active.activeLayerId)
  const sel = layer?.type === 'shape' ? ` · ${layer.name}` : ''
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-paint">
        {kindLabel[kind] ?? '모양'} 도구 · 드래그하여 모양 생성 · Shift 정비율 · Alt 중앙 기준{sel}
      </span>
    </>
  )
}

/** Status Bar — Text Tool 상태 (폰트/크기 / 편집 안내) */
function TextStatus() {
  const { activeTool } = useEditor()
  const { fontFamily, fontSize, editing } = useTextStore()
  if (activeTool !== 'text') return null
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-paint">
        {editing ? '문자 편집 중 · ESC로 완료' : '클릭하여 텍스트 입력 · 기존 텍스트 클릭 시 편집'} · {fontFamily} {fontSize}pt
      </span>
    </>
  )
}

/** Status Bar — Smart Object 편집 상태 */
function SmartStatus() {
  const active = useActiveDocument()
  if (!active?.smart) return null
  return (
    <>
      <span className="canvas__status-sep">|</span>
      <span className="canvas__status-clip">고급 개체 편집 중 · 변경 시 모든 인스턴스 자동 갱신</span>
    </>
  )
}

export function CanvasArea() {
  const { documents, activeDocumentId, activeTool, maskSolo, maskOverlay } = useEditor()
  const active = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { requestCloseDocument } = useDocumentStore()
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [toolCtx, setToolCtx] = useState<{ x: number; y: number } | null>(null)
  const [pathCtx, setPathCtx] = useState<{ x: number; y: number } | null>(null)
  const [editCtx, setEditCtx] = useState<{ x: number; y: number } | null>(null)
  const { flash } = useClipboardStore()

  const vp = useViewport({
    docId: activeDocumentId,
    docWidth: active?.width ?? 0,
    docHeight: active?.height ?? 0,
    activeTool,
  })
  useMoveTool(vp)
  useSelectionTool(vp)
  useBrushTool(vp)
  useCloneTool(vp)
  useHealingTool(vp)
  usePenTool(vp)
  useShapeTool(vp)
  useTextTool(vp)
  useCropTool(vp)
  useGradientTool(vp)
  useEyedropperTool(vp)
  usePaintBucketTool(vp)
  useMagicWandTool(vp)
  useBrushCursor(vp)
  const { editing: textEditing, panelOpen: typePanelOpen } = useTextStore()
  const { active: cropActive, box: cropBox, angle: cropAngle } = useCropStore()
  const { showTransform } = useMoveStore()
  const transform = useTransformStore()
  const tt = useTransformTool(vp)
  const { preview: brushPreview } = useBrushStore()

  const inTransform = transform.active && transform.docId === activeDocumentId
  const brushing =
    brushPreview.active &&
    brushPreview.canvas != null &&
    active != null &&
    active.layers.some((l) => l.id === brushPreview.layerId)

  const renderDoc =
    inTransform && active && transform.previewLayers
      ? { ...active, layers: transform.previewLayers }
      : brushing && active
        ? {
            ...active,
            layers: active.layers.map((l) => {
              if (l.id !== brushPreview.layerId) return l
              // Mask 페인트 프리뷰 — Bitmap 은 그대로 두고 Mask 캔버스만 교체
              if (brushPreview.target === 'mask' && l.mask)
                return { ...l, mask: { ...l.mask, bitmap: brushPreview.canvas! } }
              return { ...l, bitmap: brushPreview.canvas! }
            }),
          }
        : active

  // 편집 중인 Type Layer 는 캔버스 렌더를 비우고(overlay textarea 가 표시), 나머지는 그대로
  const textEditingId =
    textEditing && textEditing.docId === activeDocumentId ? textEditing.layerId : null
  const finalDoc =
    textEditingId && renderDoc
      ? {
          ...renderDoc,
          layers: renderDoc.layers.map((l) =>
            l.id === textEditingId && l.text ? { ...l, text: { ...l.text, content: '' } } : l,
          ),
        }
      : renderDoc

  // Crop 회전 미리보기 — Commit 전까지 Layer 를 수정하지 않고, 렌더 시점에만 crop 중심 기준 회전
  const cropDoc =
    cropActive && cropAngle && finalDoc
      ? {
          ...finalDoc,
          layers: finalDoc.layers.map((l) => ({
            ...l,
            rotation: (l.rotation || 0) + cropAngle,
            pivotX: cropBox.x + cropBox.width / 2,
            pivotY: cropBox.y + cropBox.height / 2,
          })),
        }
      : finalDoc

  const activeLayer = active?.layers.find((l) => l.id === active.activeLayerId) ?? null
  const showBox =
    activeTool === 'move' && showTransform && !!activeLayer && !!active && !inTransform

  // Overlay 개수를 RenderEngine 통계에 반영 (Selection/Transform/Brush)
  const overlayCount =
    (active?.selection.active ? 1 : 0) + (inTransform ? 1 : 0) + (brushing ? 1 : 0)
  const engine = getActiveEngine()
  if (engine) engine.overlayCount = overlayCount

  // 창 크기 변경 시 눈금자 길이를 스테이지 크기에 맞게 갱신
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="canvas">
      <div className="canvas__corner" />
      <Ruler orientation="horizontal" length={Math.max(stage.w, 2200)} />
      <Ruler orientation="vertical" length={Math.max(stage.h, 1200)} />

      <div className="canvas__stage" ref={stageRef}>
        {/* 문서 탭 스트립 — SmartDocument 는 편집(smartOpen) 중일 때만 노출 */}
        <div className="canvas__tabs">
          {documents
            .filter((d) => !d.smart || d.smartOpen)
            .map((d) => (
              <div
                key={d.id}
                className={`canvas__tab${d.id === activeDocumentId ? ' canvas__tab--active' : ''}${
                  d.smart ? ' canvas__tab--smart' : ''
                }`}
                onMouseDown={() => dispatch({ type: 'SET_ACTIVE_DOCUMENT', id: d.id })}
              >
                {d.smart && <Package size={11} className="canvas__tab-smart-icon" />}
                <span className="canvas__tab-title">
                  {d.smart ? '고급 개체: ' : ''}
                  {d.name}
                  {d.dirty ? '*' : ''} @ {d.zoom.toFixed(0)}% ({d.colorMode}/{d.bitDepth})
                </span>
                <button
                  type="button"
                  className="canvas__tab-close"
                  title="닫기"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    if (d.smart) dispatch({ type: 'CLOSE_SMART_TAB', docId: d.id })
                    else requestCloseDocument(d.id)
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
        </div>

        {/* 무한 회색 작업공간 (Viewport) — Canvas는 고정, 카메라만 이동 */}
        {active ? (
          <div
            className="canvas__viewport"
            ref={vp.containerRef}
            style={{ cursor: vp.cursor }}
            onContextMenu={(e) => {
              // 펜 → Path Context Menu, 브러시/지우개/복제 → Tool Context Menu (Photoshop)
              if (activeTool === 'pen') {
                e.preventDefault()
                setPathCtx({ x: e.clientX, y: e.clientY })
                return
              }
              if (
                activeTool === 'eraser' ||
                activeTool === 'brush' ||
                activeTool === 'stamp' ||
                activeTool === 'healing'
              ) {
                e.preventDefault()
                setToolCtx({ x: e.clientX, y: e.clientY })
                return
              }
              // 선택/이동 등 나머지 도구 → 편집(클립보드) 컨텍스트 메뉴
              e.preventDefault()
              setEditCtx({ x: e.clientX, y: e.clientY })
            }}
          >
            <div className="canvas__camera" ref={vp.cameraRef}>
              <div
                className="canvas__doc"
                style={{
                  width: active.width,
                  height: active.height,
                  background:
                    active.background === 'image' || active.background === 'transparent'
                      ? undefined
                      : active.background,
                }}
              >
                <LayerCanvas
                  doc={cropDoc ?? active}
                  version={brushPreview.version}
                  maskSolo={maskSolo}
                  maskOverlay={maskOverlay}
                  smartDocs={documents.filter((d) => d.smart)}
                />
                <SelectionOverlay doc={active} getScale={vp.getScale} />
                <TextEditorOverlay />
                {activeTool === 'crop' && cropActive && (
                  <CropOverlay docW={active.width} docH={active.height} scale={vp.scalePercent / 100} />
                )}
                {flash && (
                  <div
                    key={flash.id}
                    className="paste-flash"
                    style={{
                      left: flash.bounds.x,
                      top: flash.bounds.y,
                      width: flash.bounds.width,
                      height: flash.bounds.height,
                    }}
                  />
                )}
              </div>
              {showBox && activeLayer && (
                <BoundingBox
                  layer={activeLayer}
                  docWidth={active.width}
                  docHeight={active.height}
                  scale={vp.scalePercent / 100}
                />
              )}
              {inTransform && transform.box && transform.pivot && (
                <TransformBox
                  box={transform.box}
                  pivot={transform.pivot}
                  scale={vp.scalePercent / 100}
                  onGesture={tt.beginGesture}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="canvas__viewport">
            <div className="canvas__empty">
              열려 있는 문서가 없습니다.
              <br />
              파일 → 열기(Ctrl+O) 또는 이미지를 이곳에 드래그하세요.
            </div>
          </div>
        )}

        <FloatingAIBar />
        {activeTool === 'text' && typePanelOpen && <TypePanels />}
      </div>

      {/* 세로 스크롤바 (오른쪽) — Viewport와 연동 */}
      <div className="canvas__scrollbar canvas__scrollbar--v">
        <div className="canvas__thumb canvas__thumb--v" ref={vp.vThumbRef} />
      </div>
      {/* 가로 스크롤바 (하단) */}
      <div className="canvas__scrollbar canvas__scrollbar--h">
        <div className="canvas__thumb canvas__thumb--h" ref={vp.hThumbRef} />
      </div>

      <div className="canvas__statusbar">
        <div className="canvas__zoomctl">
          <button
            type="button"
            className="canvas__zoombtn"
            title="축소"
            onClick={vp.zoomOutCenter}
          >
            <Minus size={12} />
          </button>
          <span className="canvas__zoom">{vp.scalePercent}%</span>
          <button
            type="button"
            className="canvas__zoombtn"
            title="확대"
            onClick={vp.zoomInCenter}
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            className="canvas__zoombtn"
            title="화면 크기에 맞추기 (Ctrl+0)"
            onClick={() => vp.fitToScreen(true)}
          >
            <Maximize2 size={11} />
          </button>
        </div>
        <span className="canvas__status-sep">|</span>
        <span className="canvas__status-doc">
          {active
            ? `${active.width} 픽셀 x ${active.height} 픽셀 (${active.resolution} ppi)`
            : '문서 없음'}
        </span>
        {activeLayer && (
          <>
            <span className="canvas__status-sep">|</span>
            <span className="canvas__status-xy">
              X: {Math.round(activeLayer.x)} Y: {Math.round(activeLayer.y)}
            </span>
          </>
        )}
        {activeLayer?.mask && (
          <>
            <span className="canvas__status-sep">|</span>
            <span
              className={`canvas__status-mask${
                active?.activeTarget === 'mask' ? ' canvas__status-mask--editing' : ''
              }`}
            >
              {active?.activeTarget === 'mask' ? '레이어 마스크 편집 중' : '레이어 마스크'}
              {!activeLayer.maskEnabled && ' (비활성)'}
              {maskSolo && ' · 마스크 보기'}
              {maskOverlay && ' · 오버레이(\\)'}
            </span>
          </>
        )}
        <PaintStatus />
        <CloneStatus />
        <HealStatus />
        <PenStatus />
        <ShapeStatus />
        <TextStatus />
        <SmartStatus />
        <ClipboardStatus />
        <FilterStatus />
        <GradientStatus />
        <EyedropperStatus />
        <BucketStatus />
        <WandStatus />
      </div>

      <ToolContextMenu pos={toolCtx} onClose={() => setToolCtx(null)} />
      <PathContextMenu pos={pathCtx} onClose={() => setPathCtx(null)} />
      <EditContextMenu pos={editCtx} onClose={() => setEditCtx(null)} />
    </div>
  )
}
