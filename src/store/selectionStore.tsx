import { createContext, useContext, useState, type ReactNode } from 'react'
import type { SelectionOperation } from '../types'

export type MarqueeMode = 'rectangle' | 'ellipse'
export type LassoMode = 'lasso' | 'polygon'

/** 드래그 중 임시 선택 미리보기 상태 */
export type SelectionDraft =
  | { kind: 'rect' | 'ellipse'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'lasso'; points: number[][] }
  | { kind: 'polygon'; points: number[][]; cursor: [number, number] }
  | null

type SelectionStore = {
  marqueeMode: MarqueeMode
  lassoMode: LassoMode
  operation: SelectionOperation
  feather: number
  antiAlias: boolean
  draft: SelectionDraft
  setMarqueeMode: (m: MarqueeMode) => void
  setLassoMode: (m: LassoMode) => void
  setOperation: (o: SelectionOperation) => void
  setFeather: (v: number) => void
  setAntiAlias: (v: boolean) => void
  setDraft: (d: SelectionDraft) => void
}

const Ctx = createContext<SelectionStore | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [marqueeMode, setMarqueeMode] = useState<MarqueeMode>('rectangle')
  const [lassoMode, setLassoMode] = useState<LassoMode>('lasso')
  const [operation, setOperation] = useState<SelectionOperation>('new')
  const [feather, setFeather] = useState(0)
  const [antiAlias, setAntiAlias] = useState(true)
  const [draft, setDraft] = useState<SelectionDraft>(null)

  return (
    <Ctx.Provider
      value={{
        marqueeMode,
        lassoMode,
        operation,
        feather,
        antiAlias,
        draft,
        setMarqueeMode,
        setLassoMode,
        setOperation,
        setFeather,
        setAntiAlias,
        setDraft,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useSelectionStore(): SelectionStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSelectionStore must be used within SelectionProvider')
  return ctx
}
