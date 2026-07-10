import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/** Pen Tool 모드 — Photoshop 옵션바 좌측 드롭다운 (현재 'path' 만 실제 동작) */
export type PenMode = 'path' | 'shape' | 'pixels'

/**
 * Pen Tool / Path 편집의 휘발성(비-Undo) 상태.
 * Path 데이터 자체는 Document(state) 에 저장되고 History 로 관리된다.
 */
type PathStore = {
  penMode: PenMode
  setPenMode: (m: PenMode) => void
  /** 고무줄 미리보기 (마지막 Anchor → 커서 곡선) */
  rubberBand: boolean
  setRubberBand: (v: boolean) => void
  /** 자동 추가/삭제 (세그먼트 위 Anchor 추가, Anchor 위 삭제) */
  autoAddDelete: boolean
  setAutoAddDelete: (v: boolean) => void
  /** Toolbar Pen Flyout 열림 여부 */
  flyoutOpen: boolean
  setFlyoutOpen: (v: boolean) => void
}

const Ctx = createContext<PathStore | null>(null)

export function PathProvider({ children }: { children: ReactNode }) {
  const [penMode, setPenMode] = useState<PenMode>('path')
  const [rubberBand, setRubberBand] = useState(true)
  const [autoAddDelete, setAutoAddDelete] = useState(true)
  const [flyoutOpen, setFlyoutOpen] = useState(false)

  const value = useMemo(
    () => ({
      penMode,
      setPenMode,
      rubberBand,
      setRubberBand,
      autoAddDelete,
      setAutoAddDelete,
      flyoutOpen,
      setFlyoutOpen,
    }),
    [penMode, rubberBand, autoAddDelete, flyoutOpen],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePathStore(): PathStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePathStore must be used within PathProvider')
  return ctx
}
