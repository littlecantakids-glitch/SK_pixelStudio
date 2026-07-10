import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Gradient, GradientType } from '../types'
import { cloneGradient, DEFAULT_GRADIENT_PRESETS } from '../engine/gradientEngine'

/** Gradient Tool 옵션 + Preset + Editor 상태 (Photoshop Options Bar 대응) */
type GradientStore = {
  /** 현재 편집/적용 중인 Gradient (Preset 의 복사본) */
  gradient: Gradient
  setGradient: (g: Gradient) => void
  /** Gradient Type — Options Bar 5종 버튼 */
  gradientType: GradientType
  setGradientType: (t: GradientType) => void

  reverse: boolean
  setReverse: (v: boolean) => void
  dither: boolean
  setDither: (v: boolean) => void
  transparency: boolean
  setTransparency: (v: boolean) => void
  opacity: number
  setOpacity: (v: number) => void
  blendMode: string
  setBlendMode: (m: string) => void

  presets: Gradient[]
  activePresetId: string
  applyPreset: (id: string) => void
  /** 현재 Gradient 를 새 Preset 으로 저장 */
  savePreset: (name: string) => void

  pickerOpen: boolean
  setPickerOpen: (v: boolean) => void
  editorOpen: boolean
  setEditorOpen: (v: boolean) => void

  /** Status Bar 표시용 */
  status: string | null
  setStatus: (s: string | null) => void
}

const Ctx = createContext<GradientStore | null>(null)

export function GradientProvider({ children }: { children: ReactNode }) {
  const [presets, setPresets] = useState<Gradient[]>(DEFAULT_GRADIENT_PRESETS)
  const [activePresetId, setActivePresetId] = useState(DEFAULT_GRADIENT_PRESETS[0].id)
  const [gradient, setGradient] = useState<Gradient>(() =>
    cloneGradient(DEFAULT_GRADIENT_PRESETS[0]),
  )
  const [gradientType, setGradientType] = useState<GradientType>('linear')
  const [reverse, setReverse] = useState(false)
  const [dither, setDither] = useState(false)
  const [transparency, setTransparency] = useState(true)
  const [opacity, setOpacity] = useState(100)
  const [blendMode, setBlendMode] = useState('normal')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const applyPreset = useCallback(
    (id: string) => {
      const p = presets.find((x) => x.id === id)
      if (!p) return
      setActivePresetId(id)
      setGradient(cloneGradient(p))
    },
    [presets],
  )

  const savePreset = useCallback(
    (name: string) => {
      setGradient((g) => {
        const preset = { ...cloneGradient(g), id: `preset-user-${Date.now()}`, name }
        setPresets((prev) => [...prev, preset])
        setActivePresetId(preset.id)
        return g
      })
    },
    [],
  )

  const value = useMemo(
    () => ({
      gradient, setGradient,
      gradientType, setGradientType,
      reverse, setReverse,
      dither, setDither,
      transparency, setTransparency,
      opacity, setOpacity,
      blendMode, setBlendMode,
      presets, activePresetId, applyPreset, savePreset,
      pickerOpen, setPickerOpen,
      editorOpen, setEditorOpen,
      status, setStatus,
    }),
    [
      gradient, gradientType, reverse, dither, transparency, opacity, blendMode,
      presets, activePresetId, applyPreset, savePreset, pickerOpen, editorOpen, status,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGradientStore(): GradientStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useGradientStore must be used within GradientProvider')
  return ctx
}
