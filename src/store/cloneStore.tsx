import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { SampleMode } from '../engine/cloneEngine'

/** Clone Source Overlay 색상 (Photoshop Clone Source 패널) */
export type OverlayColor = 'cyan' | 'green' | 'red' | 'orange'

/** Overlay 색상 → CSS rgb (Overlay/Source Circle 틴트) */
export const OVERLAY_RGB: Record<OverlayColor, [number, number, number]> = {
  cyan: [0, 190, 220],
  green: [40, 200, 90],
  red: [230, 60, 60],
  orange: [240, 150, 40],
}

/**
 * Clone Stamp Tool 전용 상태.
 * 브러시 팁 파라미터(Size/Hardness/Opacity/Flow/Mode/Preset)는 brushStore 를 재사용하고,
 * 여기서는 복제 도장 고유 옵션(Aligned/Sample/Pressure/Overlay)과 Source 지점을 관리한다.
 */
type CloneStore = {
  /** Aligned: ON = Stroke 종료 후에도 Source Offset 유지, OFF = 매 Stroke Source Start 로 리셋 */
  aligned: boolean
  setAligned: (v: boolean) => void
  /** 샘플링 범위 (현재 레이어 / 현재 이하 / 모든 레이어) */
  sampleMode: SampleMode
  setSampleMode: (m: SampleMode) => void

  // Tablet Pressure (마우스는 pressure=1 로 무효) — Size/Opacity/Flow 각각 토글
  sizePressure: boolean
  opacityPressure: boolean
  flowPressure: boolean
  setSizePressure: (v: boolean) => void
  setOpacityPressure: (v: boolean) => void
  setFlowPressure: (v: boolean) => void

  // Clone Source Overlay
  /** 브러시 내부 실시간 Source Preview + Source Circle 표시 */
  showOverlay: boolean
  setShowOverlay: (v: boolean) => void
  /** Overlay 투명도 0/25/50/75/100 */
  overlayOpacity: number
  setOverlayOpacity: (v: number) => void
  /** Overlay 색상 */
  overlayColor: OverlayColor
  setOverlayColor: (c: OverlayColor) => void
  /** Source ↔ Target 연결선 표시 */
  showConnection: boolean
  setShowConnection: (v: boolean) => void

  /** Alt-Click 으로 지정된 Source 기준점 (문서 좌표). 미지정 시 null */
  source: { x: number; y: number } | null
  /** Source 지정된 문서 id */
  sourceDocId: string | null
  setSource: (p: { x: number; y: number }, docId: string) => void
  clearSource: () => void
}

const Ctx = createContext<CloneStore | null>(null)

export function CloneProvider({ children }: { children: ReactNode }) {
  const [aligned, setAligned] = useState(true)
  const [sampleMode, setSampleMode] = useState<SampleMode>('current')
  const [sizePressure, setSizePressure] = useState(false)
  const [opacityPressure, setOpacityPressure] = useState(false)
  const [flowPressure, setFlowPressure] = useState(true)
  const [showOverlay, setShowOverlay] = useState(true)
  const [overlayOpacity, setOverlayOpacity] = useState(50)
  const [overlayColor, setOverlayColor] = useState<OverlayColor>('cyan')
  const [showConnection, setShowConnection] = useState(false)
  const [source, setSourceState] = useState<{ x: number; y: number } | null>(null)
  const [sourceDocId, setSourceDocId] = useState<string | null>(null)

  const setSource = useCallback((p: { x: number; y: number }, docId: string) => {
    setSourceState(p)
    setSourceDocId(docId)
  }, [])

  const clearSource = useCallback(() => {
    setSourceState(null)
    setSourceDocId(null)
  }, [])

  const value = useMemo(
    () => ({
      aligned,
      setAligned,
      sampleMode,
      setSampleMode,
      sizePressure,
      opacityPressure,
      flowPressure,
      setSizePressure,
      setOpacityPressure,
      setFlowPressure,
      showOverlay,
      setShowOverlay,
      overlayOpacity,
      setOverlayOpacity,
      overlayColor,
      setOverlayColor,
      showConnection,
      setShowConnection,
      source,
      sourceDocId,
      setSource,
      clearSource,
    }),
    [
      aligned,
      sampleMode,
      sizePressure,
      opacityPressure,
      flowPressure,
      showOverlay,
      overlayOpacity,
      overlayColor,
      showConnection,
      source,
      sourceDocId,
      setSource,
      clearSource,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCloneStore(): CloneStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCloneStore must be used within CloneProvider')
  return ctx
}
