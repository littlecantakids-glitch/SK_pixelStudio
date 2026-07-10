import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/** Magic Wand Tool 옵션 (Photoshop Options Bar 대응) — Color Matching 은 Paint Bucket 엔진 공유 */
type WandStore = {
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
  /** Status Bar 표시용 — 마지막 선택 픽셀 수 */
  status: string | null
  setStatus: (s: string | null) => void
}

const Ctx = createContext<WandStore | null>(null)

export function WandProvider({ children }: { children: ReactNode }) {
  const [tolerance, _setTolerance] = useState(32)
  const [antiAlias, setAntiAlias] = useState(true)
  const [contiguous, setContiguous] = useState(true)
  const [sampleAll, setSampleAll] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const setTolerance = (v: number) => _setTolerance(Math.min(255, Math.max(0, Math.round(v))))

  const value = useMemo(
    () => ({
      tolerance, setTolerance,
      antiAlias, setAntiAlias,
      contiguous, setContiguous,
      sampleAll, setSampleAll,
      status, setStatus,
    }),
    [tolerance, antiAlias, contiguous, sampleAll, status],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWandStore(): WandStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWandStore must be used within WandProvider')
  return ctx
}
