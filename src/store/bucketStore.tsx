import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type BucketFillType = 'foreground' | 'pattern'

/** Paint Bucket Tool 옵션 (Photoshop Options Bar 대응) */
type BucketStore = {
  /** 채우기 소스 — 전경색 / 패턴 */
  fillType: BucketFillType
  setFillType: (v: BucketFillType) => void
  /** 선택된 Pattern Preset id */
  patternId: string
  setPatternId: (v: string) => void
  /** 0~255 */
  tolerance: number
  setTolerance: (v: number) => void
  antiAlias: boolean
  setAntiAlias: (v: boolean) => void
  contiguous: boolean
  setContiguous: (v: boolean) => void
  /** ON = RenderEngine 결과 기준 Sampling, OFF = 현재 Layer Bitmap 만 */
  sampleAll: boolean
  setSampleAll: (v: boolean) => void
  opacity: number
  setOpacity: (v: number) => void
  mode: string
  setMode: (v: string) => void
  /** Status Bar 표시용 */
  status: string | null
  setStatus: (s: string | null) => void
}

const Ctx = createContext<BucketStore | null>(null)

export function BucketProvider({ children }: { children: ReactNode }) {
  const [fillType, setFillType] = useState<BucketFillType>('foreground')
  const [patternId, setPatternId] = useState('pat-checker')
  const [tolerance, _setTolerance] = useState(32)
  const [antiAlias, setAntiAlias] = useState(true)
  const [contiguous, setContiguous] = useState(true)
  const [sampleAll, setSampleAll] = useState(false)
  const [opacity, _setOpacity] = useState(100)
  const [mode, setMode] = useState('normal')
  const [status, setStatus] = useState<string | null>(null)

  const setTolerance = (v: number) => _setTolerance(Math.min(255, Math.max(0, Math.round(v))))
  const setOpacity = (v: number) => _setOpacity(Math.min(100, Math.max(0, Math.round(v))))

  const value = useMemo(
    () => ({
      fillType, setFillType,
      patternId, setPatternId,
      tolerance, setTolerance,
      antiAlias, setAntiAlias,
      contiguous, setContiguous,
      sampleAll, setSampleAll,
      opacity, setOpacity,
      mode, setMode,
      status, setStatus,
    }),
    [fillType, patternId, tolerance, antiAlias, contiguous, sampleAll, opacity, mode, status],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBucketStore(): BucketStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useBucketStore must be used within BucketProvider')
  return ctx
}
