import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Layer, Rect, VectorPath } from '../types'

/**
 * Clipboard 데이터 — Document 와 완전히 독립적이며 문서를 닫아도 유지된다.
 * 향후 OS Clipboard / Drag&Drop / 외부 이미지 붙여넣기로 확장 가능하도록 설계.
 */
export type ClipboardData = {
  type: 'pixels' | 'layer' | 'text' | 'path'
  bitmap?: HTMLCanvasElement
  layers?: Layer[]
  path?: VectorPath
  text?: string
  bounds?: Rect
  width: number
  height: number
  /** Mask 에서 복사한 경우 붙여넣기 힌트 */
  fromMask?: boolean
  sourceDocumentId?: string
  timestamp: number
}

/** Paste 애니메이션 트리거 (붙여넣은 영역 플래시) */
export type PasteFlash = { id: number; bounds: Rect } | null

type ClipboardStore = {
  data: ClipboardData | null
  setData: (d: ClipboardData | null) => void
  /** Status Bar 용 최근 동작 메시지 (몇 초 후 사라짐) */
  status: string | null
  setStatus: (msg: string | null) => void
  flash: PasteFlash
  triggerFlash: (bounds: Rect) => void
  hasPasteable: boolean
}

const Ctx = createContext<ClipboardStore | null>(null)

let flashSeq = 0

export function ClipboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ClipboardData | null>(null)
  const [status, setStatusState] = useState<string | null>(null)
  const [flash, setFlash] = useState<PasteFlash>(null)
  const statusTimer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  const setStatus = useCallback((msg: string | null) => {
    setStatusState(msg)
    if (statusTimer.current) window.clearTimeout(statusTimer.current)
    if (msg) statusTimer.current = window.setTimeout(() => setStatusState(null), 4000)
  }, [])

  const triggerFlash = useCallback((bounds: Rect) => {
    flashSeq += 1
    setFlash({ id: flashSeq, bounds })
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 450)
  }, [])

  const hasPasteable =
    !!data &&
    ((data.type === 'pixels' && !!data.bitmap) ||
      (data.type === 'layer' && (!!data.bitmap || !!data.layers?.length)))

  const value = useMemo(
    () => ({ data, setData, status, setStatus, flash, triggerFlash, hasPasteable }),
    [data, status, setStatus, flash, triggerFlash, hasPasteable],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useClipboardStore(): ClipboardStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useClipboardStore must be used within ClipboardProvider')
  return ctx
}
