import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { RGBA, SampleSource } from '../engine/samplingEngine'

/** Eyedropper Tool 옵션 + Hover 색상 (Status Bar / HUD 표시용) */
type EyedropperStore = {
  /** Sample Size (1 = Point Sample) */
  sampleSize: number
  setSampleSize: (v: number) => void
  /** Sample Source — Current / Current & Below / All Layers */
  sampleSource: SampleSource
  setSampleSource: (v: SampleSource) => void
  /** HUD(확대 미리보기) 표시 여부 */
  showHud: boolean
  setShowHud: (v: boolean) => void
  /** 현재 Hover 중인 픽셀 색 (도구 비활성/캔버스 밖 = null) */
  hover: RGBA | null
  setHover: (c: RGBA | null) => void
  /** Mask Gray Sampling 중 여부 (Status Bar 안내) */
  maskSampling: boolean
  setMaskSampling: (v: boolean) => void
}

const Ctx = createContext<EyedropperStore | null>(null)

export function EyedropperProvider({ children }: { children: ReactNode }) {
  const [sampleSize, setSampleSize] = useState(1)
  const [sampleSource, setSampleSource] = useState<SampleSource>('all')
  const [showHud, setShowHud] = useState(true)
  const [hover, _setHover] = useState<RGBA | null>(null)
  const [maskSampling, setMaskSampling] = useState(false)

  // 같은 색이면 re-render 생략 (pointermove 마다 호출됨)
  const setHover = useCallback((c: RGBA | null) => {
    _setHover((prev) => {
      if (prev === c) return prev
      if (prev && c && prev.r === c.r && prev.g === c.g && prev.b === c.b && prev.a === c.a)
        return prev
      return c
    })
  }, [])

  const value = useMemo(
    () => ({
      sampleSize,
      setSampleSize,
      sampleSource,
      setSampleSource,
      showHud,
      setShowHud,
      hover,
      setHover,
      maskSampling,
      setMaskSampling,
    }),
    [sampleSize, sampleSource, showHud, hover, setHover, maskSampling],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEyedropperStore(): EyedropperStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEyedropperStore must be used within EyedropperProvider')
  return ctx
}
