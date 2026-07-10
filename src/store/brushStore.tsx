import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { MaskTarget } from '../types'

/** 스트로크 진행 중 미리보기 (undo 불변성을 위해 실제 layer.bitmap/mask 는 commit 시에만 교체) */
export type BrushPreview = {
  active: boolean
  layerId: string | null
  /** 그리는 대상 — Bitmap 또는 Layer Mask */
  target: MaskTarget
  canvas: HTMLCanvasElement | null
  version: number
}

/** 브러시 페인팅 모드 — Brush Engine BRUSH_MODE_OP 와 1:1 대응 ('erase' 는 destination-out) */
export type BrushMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'softlight'
  | 'hardlight'
  | 'darken'
  | 'lighten'
  | 'erase'

/** 지우개 모드 — 현재 Brush 만 실제 동작 (Pencil/Block 은 UI) */
export type EraserMode = 'brush' | 'pencil' | 'block'

/** Toolbar Flyout 이 열려 있는 도구 그룹 */
export type FlyoutTool =
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
  | null

export type BrushPreset = {
  id: string
  name: string
  category: string
  size: number
  hardness: number
  opacity: number
  flow: number
  smoothing: number
  spacing: number
  angle: number
  roundness: number
  /** 썸네일 팁 모양 (엔진은 원형 dab, UI 표시용) */
  tipShape?: 'round' | 'square'
  thumbnail?: string
}

/** Photoshop 기본 브러시 프리셋 (카테고리 = 폴더) */
export const BRUSH_CATEGORIES = [
  '일반 브러시',
  '드라이 재질 브러시',
  '수채화 재질 브러시',
  '특수 효과 브러시',
] as const

const preset = (
  id: string,
  name: string,
  category: string,
  p: Partial<Omit<BrushPreset, 'id' | 'name' | 'category'>> = {},
): BrushPreset => ({
  id,
  name,
  category,
  size: 30,
  hardness: 0,
  opacity: 100,
  flow: 100,
  smoothing: 10,
  spacing: 15,
  angle: 0,
  roundness: 100,
  ...p,
})

/** 지우개 프리셋 — 팁 파라미터는 Brush Engine 을 그대로 재사용 */
export const ERASER_PRESETS: BrushPreset[] = [
  preset('er-hard-round', '선명한 원', '지우개 브러시', { hardness: 100 }),
  preset('er-soft-round', '부드러운 원', '지우개 브러시', { hardness: 0 }),
  preset('er-pencil', '연필', '지우개 브러시', { hardness: 100, size: 4, smoothing: 20 }),
  preset('er-square', '사각형', '지우개 브러시', { hardness: 100, spacing: 25, size: 20, tipShape: 'square' }),
  preset('er-chalk', '분필', '지우개 브러시', { hardness: 85, flow: 75, spacing: 20, size: 24 }),
]

export const DEFAULT_PRESETS: BrushPreset[] = [
  preset('soft-round', '부드러운 원', '일반 브러시', { hardness: 0 }),
  preset('hard-round', '선명한 원', '일반 브러시', { hardness: 100 }),
  preset('soft-round-pressure', '부드러운 원 압력 크기', '일반 브러시', { hardness: 0, flow: 80 }),
  preset('hard-round-pressure', '선명한 원 압력 크기', '일반 브러시', { hardness: 100, flow: 80 }),
  preset('dry-brush', '드라이 브러시', '드라이 재질 브러시', { hardness: 90, flow: 60, spacing: 30, size: 40 }),
  preset('pencil', '연필', '드라이 재질 브러시', { hardness: 100, size: 4, smoothing: 20 }),
  preset('charcoal', '목탄', '드라이 재질 브러시', { hardness: 70, flow: 80, spacing: 25, size: 14 }),
  preset('wet-brush', '수채화 브러시', '수채화 재질 브러시', { hardness: 0, opacity: 60, flow: 30, size: 45 }),
  preset('spatter', '스패터', '특수 효과 브러시', { hardness: 100, spacing: 80, size: 25 }),
]

type BrushStore = {
  // 프리셋
  activePresetId: string
  presets: BrushPreset[]
  /** 최근 사용한 프리셋 (Photoshop 팝업 상단 가로 스트립) */
  recentPresetIds: string[]
  applyPreset: (id: string) => void

  // 지우개 — Brush Engine 재사용, Composite/Target 만 다르다
  eraserPresets: BrushPreset[]
  activeEraserPresetId: string
  applyEraserPreset: (id: string) => void
  eraserMode: EraserMode
  setEraserMode: (m: EraserMode) => void
  /** 투명 영역 보호 (UI 준비 — 향후 동작 연결) */
  protectAlpha: boolean
  setProtectAlpha: (v: boolean) => void

  // 브러시 파라미터 (Brush Engine 에 즉시 반영)
  size: number
  hardness: number
  opacity: number
  flow: number
  smoothing: number
  spacing: number
  angle: number
  roundness: number
  mode: BrushMode

  setSize: (v: number) => void
  setHardness: (v: number) => void
  setOpacity: (v: number) => void
  setFlow: (v: number) => void
  setSmoothing: (v: number) => void
  setSpacing: (v: number) => void
  setAngle: (v: number) => void
  setRoundness: (v: number) => void
  setMode: (m: BrushMode) => void

  // UI 상태
  popupOpen: boolean
  setPopupOpen: (v: boolean) => void
  flyoutTool: FlyoutTool
  setFlyoutTool: (t: FlyoutTool) => void

  preview: BrushPreview
  setPreview: (p: BrushPreview) => void
}

const Ctx = createContext<BrushStore | null>(null)

export const BRUSH_SIZE_MAX = 5000

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v)))

export function BrushProvider({ children }: { children: ReactNode }) {
  const [activePresetId, setActivePresetId] = useState('soft-round')
  const [presets] = useState<BrushPreset[]>(DEFAULT_PRESETS)
  const [recentPresetIds, setRecentPresetIds] = useState<string[]>(['soft-round', 'hard-round'])
  const [activeEraserPresetId, setActiveEraserPresetId] = useState('er-hard-round')
  const [eraserMode, setEraserMode] = useState<EraserMode>('brush')
  const [protectAlpha, setProtectAlpha] = useState(false)

  const [size, _setSize] = useState(30)
  const [hardness, _setHardness] = useState(80)
  const [opacity, _setOpacity] = useState(100)
  const [flow, _setFlow] = useState(100)
  const [smoothing, _setSmoothing] = useState(10)
  const [spacing, _setSpacing] = useState(15)
  const [angle, _setAngle] = useState(0)
  const [roundness, _setRoundness] = useState(100)
  const [mode, setMode] = useState<BrushMode>('normal')

  const [popupOpen, setPopupOpen] = useState(false)
  const [flyoutTool, setFlyoutTool] = useState<FlyoutTool>(null)

  const [preview, setPreview] = useState<BrushPreview>({
    active: false,
    layerId: null,
    target: 'bitmap',
    canvas: null,
    version: 0,
  })

  const setSize = useCallback((v: number) => _setSize(clamp(v, 1, BRUSH_SIZE_MAX)), [])
  const setHardness = useCallback((v: number) => _setHardness(clamp(v, 0, 100)), [])
  const setOpacity = useCallback((v: number) => _setOpacity(clamp(v, 0, 100)), [])
  const setFlow = useCallback((v: number) => _setFlow(clamp(v, 0, 100)), [])
  const setSmoothing = useCallback((v: number) => _setSmoothing(clamp(v, 0, 100)), [])
  const setSpacing = useCallback((v: number) => _setSpacing(clamp(v, 1, 200)), [])
  const setAngle = useCallback((v: number) => _setAngle(clamp(v, -180, 180)), [])
  const setRoundness = useCallback((v: number) => _setRoundness(clamp(v, 1, 100)), [])

  /** 프리셋 팁 파라미터를 공용 상태에 적용 */
  const applyTip = useCallback((p: BrushPreset) => {
    _setSize(p.size)
    _setHardness(p.hardness)
    _setOpacity(p.opacity)
    _setFlow(p.flow)
    _setSmoothing(p.smoothing)
    _setSpacing(p.spacing)
    _setAngle(p.angle)
    _setRoundness(p.roundness)
  }, [])

  const applyPreset = useCallback(
    (id: string) => {
      const p = DEFAULT_PRESETS.find((x) => x.id === id)
      if (!p) return
      setActivePresetId(id)
      setRecentPresetIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 8))
      applyTip(p)
    },
    [applyTip],
  )

  const applyEraserPreset = useCallback(
    (id: string) => {
      const p = ERASER_PRESETS.find((x) => x.id === id)
      if (!p) return
      setActiveEraserPresetId(id)
      applyTip(p)
    },
    [applyTip],
  )

  const value = useMemo(
    () => ({
      activePresetId,
      presets,
      recentPresetIds,
      applyPreset,
      eraserPresets: ERASER_PRESETS,
      activeEraserPresetId,
      applyEraserPreset,
      eraserMode,
      setEraserMode,
      protectAlpha,
      setProtectAlpha,
      size,
      hardness,
      opacity,
      flow,
      smoothing,
      spacing,
      angle,
      roundness,
      mode,
      setSize,
      setHardness,
      setOpacity,
      setFlow,
      setSmoothing,
      setSpacing,
      setAngle,
      setRoundness,
      setMode,
      popupOpen,
      setPopupOpen,
      flyoutTool,
      setFlyoutTool,
      preview,
      setPreview,
    }),
    [
      activePresetId, presets, recentPresetIds, applyPreset,
      activeEraserPresetId, applyEraserPreset, eraserMode, protectAlpha,
      size, hardness, opacity, flow, smoothing, spacing, angle, roundness, mode,
      setSize, setHardness, setOpacity, setFlow, setSmoothing, setSpacing, setAngle, setRoundness,
      popupOpen, flyoutTool, preview,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBrushStore(): BrushStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBrushStore must be used within BrushProvider')
  return ctx
}
