export type ToolId =
  | 'move'
  | 'marquee'
  | 'lasso'
  | 'quickselect'
  | 'wand'
  | 'crop'
  | 'frame'
  | 'eyedropper'
  | 'healing'
  | 'brush'
  | 'stamp'
  | 'historybrush'
  | 'eraser'
  | 'gradient'
  | 'bucket'
  | 'blur'
  | 'pen'
  | 'text'
  | 'pathselect'
  | 'shape'
  | 'hand'
  | 'zoom'

export type MenuId =
  | 'file'
  | 'edit'
  | 'image'
  | 'layer'
  | 'type'
  | 'select'
  | 'filter'
  | 'view'
  | 'plugin'
  | 'window'
  | 'help'

/**
 * Blend Mode — Canvas GlobalCompositeOperation 이 지원하는 Photoshop 모드.
 * PSD Import 시 linearBurn/vividLight 등 Canvas 미지원 모드는 normal 로 fallback 한다.
 */
export type BlendMode =
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'colorBurn'
  | 'lighten'
  | 'screen'
  | 'colorDodge'
  | 'linearDodge'
  | 'overlay'
  | 'softLight'
  | 'hardLight'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export type LayerType =
  | 'background'
  | 'image'
  | 'raster'
  | 'text'
  | 'shape'
  | 'group'
  | 'smartObject'
  | 'adjustment'

/**
 * Adjustment Layer 종류 — 현재 brightnessContrast / hueSaturation / levels 구현.
 * 나머지는 구조만 준비 (Curves, Camera Raw, LUT, Smart Filter 확장 대비).
 */
export type AdjustmentType =
  | 'brightnessContrast'
  | 'levels'
  | 'curves'
  | 'hueSaturation'
  | 'colorBalance'
  | 'exposure'
  | 'vibrance'

/** Adjustment 별 설정값 (실시간 Preview 용, Bitmap 은 절대 수정하지 않음) */
export type AdjustmentSettings = {
  brightness?: number // -150 ~ 150
  contrast?: number // -50 ~ 100
  hue?: number // -180 ~ 180
  saturation?: number // -100 ~ 100
  lightness?: number // -100 ~ 100
  black?: number // 0 ~ 253
  gamma?: number // 0.1 ~ 9.99
  white?: number // 2 ~ 255
  [key: string]: number | undefined
}

/**
 * Layer Mask — Bitmap과 완전히 분리된 Grayscale 마스크.
 * 255(흰색) = 보임, 0(검정) = 숨김. Bitmap과 동일한 크기.
 * Eraser / Adjustment Layer / Clipping Mask / Quick Mask 가 모두 이 구조를 재사용한다.
 */
export type LayerMask = {
  width: number
  height: number
  bitmap: HTMLCanvasElement
  enabled: boolean
  density: number // 0~100, 마스크 효과 강도
  feather: number // px, 가장자리 흐림
}

/** 편집 대상: 레이어 비트맵 또는 레이어 마스크 */
export type MaskTarget = 'bitmap' | 'mask'

export type Layer = {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  /** 투명 픽셀 잠그기 — ON 이면 투명 영역에 페인트/Fill 금지 (Photoshop Lock Transparent Pixels) */
  lockTransparent?: boolean
  selected: boolean
  opacity: number
  fill: number
  blendMode: BlendMode
  /** 렌더/내보내기용 비트맵 (이미지/래스터 레이어) */
  bitmap?: CanvasImageSource
  /** Adjustment Layer — RenderEngine 이 실시간 계산 (Non-Destructive) */
  adjustment?: AdjustmentType
  adjustmentSettings?: AdjustmentSettings
  /** Shape Layer — Vector 정의. RenderEngine 이 실시간 렌더 (Bitmap 없음) */
  shape?: ShapeSpec
  /** Type Layer — Text 정의. RenderEngine 이 실시간 렌더 (Rasterize 전까지 Bitmap 없음) */
  text?: TextSpec
  /**
   * Smart Object Layer — 참조하는 SmartDocument(OpenDocument) id.
   * Bitmap 을 직접 갖지 않고 SmartDocument 를 참조한다. Transform 은 Render 시점에만 적용한다.
   */
  smartDocId?: string
  /** Embedded(false) / Linked(true) — Linked 는 구조만 준비 */
  linked?: boolean
  /** Linked Smart Object 소스 경로 (구조 준비) */
  sourcePath?: string
  /** Smart Filter Stack (Smart Object 전용, 순서대로 비파괴 적용) */
  smartFilters?: SmartFilter[]
  /** Layer Panel 에서 Smart Filter 트리 펼침 여부 */
  filtersExpanded?: boolean
  /** Layer Mask — Bitmap은 절대 수정하지 않고 Mask만 편집하는 Non-Destructive 구조 */
  mask?: LayerMask
  maskEnabled: boolean
  maskLinked: boolean
  maskDensity: number
  maskFeather: number
  thumbnail?: string
  x: number
  y: number
  width: number
  height: number
  /** 회전(도 단위, pivot 기준) */
  rotation: number
  scaleX?: number
  scaleY?: number
  /** 회전 중심(캔버스 절대 좌표). 미지정 시 레이어 중심 */
  pivotX?: number
  pivotY?: number
  /** 그룹 관계 */
  parentId?: string
  children?: string[]
  collapsed?: boolean
  /**
   * Clipping Mask 상태 (PSD Import 보존 — Layer Panel 표시 구조 준비).
   * true = 아래 Base Layer 에 클리핑. 정확한 클리핑 렌더링은 후속 작업.
   */
  clipped?: boolean
  /** 아직 원래 타입으로 복원하지 못하는 PSD 레이어 표식 (경고 Badge 표시) */
  unsupported?: {
    /** 원본 PSD 레이어 종류 (text/shape/smartObject/adjustment/fill/…) */
    originalType: string
    reason: string
  }
  /**
   * PSD Import 원본 메타데이터 — Additional Layer Info 키 목록 등.
   * 향후 Text/Shape/Smart Object/Mask/Adjustment/FX 복원이 재사용한다.
   */
  psdMeta?: {
    blendKey: string
    infoKeys: string[]
    /** 그룹 Pass Through Blend (구조 준비) */
    passThrough?: boolean
    /** lspf 잠금 플래그 (구조 준비 — Full Lock 외) */
    lockTransparency?: boolean
    lockPixels?: boolean
    lockPosition?: boolean
    /** Smart Object Transform quad (문서 좌표 8 doubles — 향후 SO 편집 복원용) */
    transformQuad?: number[]
    /** Warp 적용 여부 */
    warped?: boolean
  }
}

import type { HistoryItem } from './types/history'

export type RightPanelTab = 'properties' | 'adjustments' | 'libraries'

export type Rect = { x: number; y: number; width: number; height: number }

export type SelectionMode = 'rectangle' | 'ellipse' | 'lasso' | 'polygon' | 'magnetic'
export type SelectionOperation = 'new' | 'add' | 'subtract' | 'intersect'

/** Selection 은 Layer 가 아니라 Document 에 존재한다. 항상 하나만. */
export type SelectionState = {
  active: boolean
  mode: SelectionMode
  operation: SelectionOperation
  bounds: Rect
  /** 마스크 (width*height, 255=선택 / 0=비선택). 비활성 시 null */
  mask: Uint8Array | null
  width: number
  height: number
  feather: number
  antiAlias: boolean
}

/** 2D 벡터 좌표 (문서 공간) */
export type Vec2 = { x: number; y: number }

/**
 * Vector Path Anchor — Anchor + In/Out Bezier Handle.
 * type: corner(핸들 독립/없음) · smooth(양쪽 대칭 방향, 길이 자유) · symmetric(완전 대칭)
 */
export type PathPoint = {
  id: string
  anchor: Vec2
  inHandle: Vec2
  outHandle: Vec2
  type: 'corner' | 'smooth' | 'symmetric'
  selected: boolean
}

/**
 * Vector Path — Layer 가 아니라 Document 에 존재하는 독립 Vector 데이터.
 * Shape Tool / Vector Mask / Text on Path / Stroke·Fill Path / SVG Export 가 공유한다.
 */
export type VectorPath = {
  id: string
  name: string
  closed: boolean
  visible: boolean
  points: PathPoint[]
}

/**
 * Shape Kind — Shape Tool Flyout (U). 현재 rectangle/ellipse/line 실제 구현,
 * roundRect/polygon/custom 은 구조/UI 준비.
 */
export type ShapeKind = 'rectangle' | 'roundRect' | 'ellipse' | 'polygon' | 'line' | 'custom'

/** Stroke 위치 — 현재 center 완전 구현, inside/outside 는 근사 지원 */
export type StrokeAlign = 'inside' | 'center' | 'outside'

/** Gradient 종류 — Photoshop 5종 */
export type GradientType = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'

/**
 * Gradient Stop — 색상 + 불투명도 + 위치(0~1).
 * midpoint: 이 Stop 과 다음 Stop 사이의 중간점(0~1, 기본 0.5).
 * color 는 hex 또는 sentinel('foreground' | 'background') — 사용 시점에 해석된다.
 */
export type GradientStop = {
  id: string
  position: number
  color: string
  opacity: number
  midpoint?: number
}

/**
 * Gradient — Stop 기반 정의. Gradient Tool / Fill Layer / Layer Style /
 * Gradient Map / Mask / Shape Fill / Text Fill 이 모두 이 구조를 공유한다.
 */
export type Gradient = {
  id: string
  name: string
  type: GradientType
  stops: GradientStop[]
}

/** Gradient 적용 지오메트리 — 드래그 시작/끝 (대상 로컬 좌표) */
export type GradientGeom = {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Shape Fill — Solid Color 또는 Gradient */
export type ShapeFill = {
  type: 'solid' | 'gradient' | 'pattern'
  color: string
  enabled: boolean
  /** type === 'gradient' 일 때의 정의 (레이어 로컬 지오메트리) */
  gradient?: Gradient
  gradientGeom?: GradientGeom
}

export type ShapeStroke = {
  color: string
  width: number
  align: StrokeAlign
  enabled: boolean
}

/** 문자 정렬 (Paragraph) */
export type TextAlign = 'left' | 'center' | 'right'

/** Anti-Alias 방식 (메타데이터 — Photoshop Type 옵션) */
export type TextAntiAlias = 'none' | 'sharp' | 'crisp' | 'strong' | 'smooth'

/** Warp Text 스타일 (Photoshop 뒤틀기) */
export type WarpStyle =
  | 'none'
  | 'arc'
  | 'arcLower'
  | 'arcUpper'
  | 'arch'
  | 'bulge'
  | 'shellLower'
  | 'shellUpper'
  | 'flag'
  | 'wave'
  | 'fish'
  | 'rise'

/** Warp Text 설정 */
export type TextWarp = {
  style: WarpStyle
  /** 구부리기 -100~100 */
  bend: number
  /** 가로 왜곡 -100~100 */
  horizontal: number
  /** 세로 왜곡 -100~100 */
  vertical: number
}

/** OpenType / 고급 문자 기능 (canvas 지원 범위 내 적용, 나머지는 메타데이터) */
export type TextOpenType = {
  ligatures: boolean
  kerning: boolean
  smallCaps: boolean
  oldStyle: boolean
  fractions: boolean
  /** Stylistic Set 번호 (0 = 없음) */
  stylisticSet: number
}

/**
 * Text Spec — Type Layer 의 Vector 정의.
 * Rasterize 전까지 픽셀을 생성하지 않고, RenderEngine 이 실시간 렌더한다.
 * 언제든지 다시 편집(Edit) 가능하다. 향후 Paragraph/Vertical/Warp/Text-on-Path 가 재사용한다.
 */
export type TextSpec = {
  content: string
  /** 쓰기 방향 — horizontal(가로) / vertical(세로쓰기). 미지정 시 horizontal */
  orientation?: 'horizontal' | 'vertical'
  fontFamily: string
  fontSize: number
  /** 100~900 (400 = Regular, 700 = Bold) */
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  /** 자간 (1/1000 em, Photoshop Tracking) */
  tracking: number
  /** 행간 (px). 0 = 자동(fontSize * 1.2) */
  leading: number
  color: string
  alignment: TextAlign
  antiAlias: TextAntiAlias
  /** 기준선 이동 (px) */
  baselineShift: number
  /** 가로 비율 (%) */
  hScale: number
  /** 세로 비율 (%) */
  vScale: number
  /**
   * Paragraph(Area) Text 바운딩 박스. 있으면 자동 줄바꿈 단락 텍스트,
   * null/미지정이면 Point Text.
   */
  box?: { width: number; height: number } | null
  /** Warp Text (없거나 style==='none' 이면 미적용) */
  warp?: TextWarp
  /** Text on Path — Document VectorPath id (있으면 패스를 따라 배치) */
  pathId?: string | null
  /** OpenType / 고급 문자 기능 */
  openType?: TextOpenType
  /** 기준선 격자 스냅 크기(px). 0 = 미사용 */
  baselineGrid?: number
  /** Text Fill Gradient — 있으면 color 대신 그라디언트로 채운다 (레이어 로컬 지오메트리) */
  fillGradient?: { gradient: Gradient; geom: GradientGeom } | null
}

/**
 * Smart Filter — Smart Object 에만 적용되는 비파괴 필터. Stack 순서대로 적용되며
 * 원본 픽셀을 절대 변경하지 않는다. 언제든 파라미터를 다시 수정(Edit)할 수 있다.
 */
export type SmartFilterType =
  // 조정
  | 'brightnessContrast'
  | 'hueSaturation'
  // Blur
  | 'gaussianBlur'
  | 'motionBlur'
  | 'surfaceBlur'
  | 'boxBlur'
  | 'radialBlur'
  | 'average'
  // Sharpen
  | 'smartSharpen'
  | 'unsharpMask'
  | 'highPass'
  // Noise
  | 'addNoise'
  | 'reduceNoise'
  | 'median'
  | 'dustScratches'
  // Distort
  | 'ripple'
  | 'twirl'
  | 'wave'
  | 'zigzag'
  | 'offset'
  // 구조만 준비
  | 'cameraRaw'
  | 'liquify'
  | 'lensBlur'
  | 'oilPaint'

export type SmartFilter = {
  id: string
  type: SmartFilterType
  name: string
  enabled: boolean
  parameters: Record<string, number>
  opacity: number
  blendMode: BlendMode
  /** Smart Filter Mask (grayscale, 없으면 전체 적용) — 구조 준비 */
  mask?: LayerMask
}

/**
 * Shape Spec — Shape Layer 의 Vector 정의.
 * path 는 Pen Tool 과 동일한 VectorPath (레이어 로컬 좌표: 원점 = layer.x/y).
 * RenderEngine 이 실시간으로 fill + stroke 를 렌더한다 (Rasterize 하지 않음).
 * 향후 Boolean Operation / Vector Mask / SVG Export / Custom Shape 가 이 구조를 재사용한다.
 */
export type ShapeSpec = {
  kind: ShapeKind
  path: VectorPath
  /** 추가 서브패스 (Type→Shape 변환 등 다중 윤곽/구멍용, even-odd 채움) */
  subpaths?: VectorPath[]
  fill: ShapeFill
  stroke: ShapeStroke
  /** roundRect 모서리 반경(px) */
  radius?: number
  /** polygon 변 개수 (구조 준비) */
  sides?: number
}

export function emptySelection(width: number, height: number): SelectionState {
  return {
    active: false,
    mode: 'rectangle',
    operation: 'new',
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    mask: null,
    width,
    height,
    feather: 0,
    antiAlias: true,
  }
}

/** 열려 있는 하나의 문서(캔버스). Save/Save As 확장을 고려한 구조. */
export type OpenDocument = {
  id: string
  name: string
  width: number
  height: number
  resolution: number
  colorMode: string
  bitDepth: number
  /** 색상 hex, 'transparent', 또는 이미지에서 열린 경우 'image' */
  background: string
  fileType?: string
  fileSize?: number
  /** 렌더링용 이미지 소스(object URL/dataURL). 이미지로 열었을 때만 존재 */
  imageSrc?: string
  /** File System Access API 파일 핸들 (있으면 Save 시 덮어쓰기) */
  fileHandle?: FileSystemFileHandle | null
  /** 저장되지 않은 변경 존재 여부 */
  dirty: boolean
  zoom: number
  layers: Layer[]
  activeLayerId: string
  /** 활성 레이어에서 편집 중인 대상 (Bitmap 썸네일 vs Mask 썸네일). 미지정 시 'bitmap' */
  activeTarget?: MaskTarget
  /** Document 에 존재하는 단일 Selection */
  selection: SelectionState
  /** Document 에 존재하는 Vector Path 목록 (Work Path / Saved Path) */
  paths?: VectorPath[]
  /** 현재 활성(편집 대상) Path id */
  activePathId?: string | null
  /** 인덱스 기반 History 스냅샷 리스트 (Photoshop History Panel) */
  history: HistoryItem[]
  historyIndex: number
  /**
   * Smart Object 의 내부 문서(SmartDocument)인지. true 면 탭 스트립에는 smartOpen 일 때만 노출된다.
   * 편집 시 자체 History 를 사용하며 Parent 와 분리된다.
   */
  smart?: boolean
  /** SmartDocument 탭이 열려(편집 중) 있는지 */
  smartOpen?: boolean
  /** 내용 버전 — 편집/Undo 시 증가. Smart Cache 무효화 및 Instance 갱신에 사용 */
  version?: number
}

/** 하위 호환용 별칭 */
export type CanvasDoc = OpenDocument

export type EditorState = {
  activeMenu: MenuId | null
  activeTool: ToolId
  foregroundColor: string
  backgroundColor: string
  activeRightPanel: RightPanelTab
  timelineEnabled: boolean
  isPlaying: boolean
  /** Alt+Mask Click — 활성 레이어의 Mask만 크게 보기 */
  maskSolo: boolean
  /** \ 키 — Mask 빨간색 Overlay Preview (Quick Mask 스타일) */
  maskOverlay: boolean
  documents: OpenDocument[]
  activeDocumentId: string | null
}

export type RecentFile = {
  id: string
  name: string
  type: string
  size: number
  thumbnail: string
  modified: number
}
