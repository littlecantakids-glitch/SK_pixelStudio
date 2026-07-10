import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { SampleMode } from '../engine/cloneEngine'

/** Healing Source 종류 — 'sampled'(Alt-Click 샘플) / 'pattern'(패턴, 구조 준비) */
export type HealingSource = 'sampled' | 'pattern'

/**
 * Healing Brush Tool 전용 상태.
 * 브러시 팁(Size/Hardness/Mode/Preset)은 brushStore 를 재사용하고,
 * 여기서는 Healing 고유 옵션(Aligned/Sample/Diffusion/Source)과 Source 지점을 관리한다.
 */
type HealingStore = {
  aligned: boolean
  setAligned: (v: boolean) => void
  sampleMode: SampleMode
  setSampleMode: (m: SampleMode) => void
  /** 경계 확산 정도 1~7 (낮음=디테일 보존, 높음=부드러운 색 전이) */
  diffusion: number
  setDiffusion: (v: number) => void
  source: HealingSource
  setSource: (s: HealingSource) => void
  /** Alt-Click Source 기준점 (문서 좌표) */
  sourcePoint: { x: number; y: number } | null
  sourceDocId: string | null
  setSourcePoint: (p: { x: number; y: number }, docId: string) => void
  clearSourcePoint: () => void
}

const Ctx = createContext<HealingStore | null>(null)

export function HealingProvider({ children }: { children: ReactNode }) {
  const [aligned, setAligned] = useState(true)
  const [sampleMode, setSampleMode] = useState<SampleMode>('current')
  const [diffusion, _setDiffusion] = useState(5)
  const [source, setSource] = useState<HealingSource>('sampled')
  const [sourcePoint, setSourceState] = useState<{ x: number; y: number } | null>(null)
  const [sourceDocId, setSourceDocId] = useState<string | null>(null)

  const setDiffusion = useCallback(
    (v: number) => _setDiffusion(Math.max(1, Math.min(7, Math.round(v)))),
    [],
  )
  const setSourcePoint = useCallback((p: { x: number; y: number }, docId: string) => {
    setSourceState(p)
    setSourceDocId(docId)
  }, [])
  const clearSourcePoint = useCallback(() => {
    setSourceState(null)
    setSourceDocId(null)
  }, [])

  const value = useMemo(
    () => ({
      aligned,
      setAligned,
      sampleMode,
      setSampleMode,
      diffusion,
      setDiffusion,
      source,
      setSource,
      sourcePoint,
      sourceDocId,
      setSourcePoint,
      clearSourcePoint,
    }),
    [aligned, sampleMode, diffusion, source, sourcePoint, sourceDocId, setDiffusion, setSourcePoint, clearSourcePoint],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHealingStore(): HealingStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useHealingStore must be used within HealingProvider')
  return ctx
}
