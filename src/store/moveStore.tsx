import { createContext, useContext, useState, type ReactNode } from 'react'

export type AutoSelectMode = 'layer' | 'group'

type MoveStore = {
  autoSelect: boolean
  autoSelectMode: AutoSelectMode
  showTransform: boolean
  dragging: boolean
  setAutoSelect: (v: boolean) => void
  setAutoSelectMode: (v: AutoSelectMode) => void
  setShowTransform: (v: boolean) => void
  setDragging: (v: boolean) => void
}

const Ctx = createContext<MoveStore | null>(null)

export function MoveProvider({ children }: { children: ReactNode }) {
  const [autoSelect, setAutoSelect] = useState(true)
  const [autoSelectMode, setAutoSelectMode] = useState<AutoSelectMode>('layer')
  const [showTransform, setShowTransform] = useState(true)
  const [dragging, setDragging] = useState(false)

  return (
    <Ctx.Provider
      value={{
        autoSelect,
        autoSelectMode,
        showTransform,
        dragging,
        setAutoSelect,
        setAutoSelectMode,
        setShowTransform,
        setDragging,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useMoveStore(): MoveStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMoveStore must be used within MoveProvider')
  return ctx
}
