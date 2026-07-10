import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { FilterParams, FilterType } from '../engine/filterEngine'

/** Dialog 가 있는 필터 (Sharpen 은 즉시 적용) */
export type FilterDialogType = 'gaussianBlur' | 'addNoise' | null

export type LastFilter = { type: FilterType; params: FilterParams }

type FilterStore = {
  /** 현재 열려 있는 Filter Dialog */
  dialog: FilterDialogType
  openDialog: (d: Exclude<FilterDialogType, null>) => void
  closeDialog: () => void
  /** 마지막 적용 필터 (Ctrl+F / 마지막 필터 메뉴) */
  lastFilter: LastFilter | null
  setLastFilter: (f: LastFilter) => void
  /** Status Bar 표시용 상태 메시지 */
  status: string | null
  setStatus: (s: string | null) => void
  /** 편집 중인 Smart Filter (트리 더블클릭 / Smart Object 에 필터 추가 시) */
  smartEdit: { layerId: string; filterId: string } | null
  openSmartFilterEdit: (layerId: string, filterId: string) => void
  closeSmartFilterEdit: () => void
  /** 혼합 옵션(Blend Mode / Opacity) 편집 중인 Smart Filter */
  blendEdit: { layerId: string; filterId: string } | null
  openSmartFilterBlend: (layerId: string, filterId: string) => void
  closeSmartFilterBlend: () => void
}

const Ctx = createContext<FilterStore | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<FilterDialogType>(null)
  const [lastFilter, setLastFilter] = useState<LastFilter | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [smartEdit, setSmartEdit] = useState<{ layerId: string; filterId: string } | null>(null)
  const [blendEdit, setBlendEdit] = useState<{ layerId: string; filterId: string } | null>(null)

  const openDialog = useCallback((d: Exclude<FilterDialogType, null>) => setDialog(d), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const openSmartFilterEdit = useCallback(
    (layerId: string, filterId: string) => setSmartEdit({ layerId, filterId }),
    [],
  )
  const closeSmartFilterEdit = useCallback(() => setSmartEdit(null), [])
  const openSmartFilterBlend = useCallback(
    (layerId: string, filterId: string) => setBlendEdit({ layerId, filterId }),
    [],
  )
  const closeSmartFilterBlend = useCallback(() => setBlendEdit(null), [])

  const value = useMemo(
    () => ({
      dialog,
      openDialog,
      closeDialog,
      lastFilter,
      setLastFilter,
      status,
      setStatus,
      smartEdit,
      openSmartFilterEdit,
      closeSmartFilterEdit,
      blendEdit,
      openSmartFilterBlend,
      closeSmartFilterBlend,
    }),
    [
      dialog,
      openDialog,
      closeDialog,
      lastFilter,
      status,
      smartEdit,
      openSmartFilterEdit,
      closeSmartFilterEdit,
      blendEdit,
      openSmartFilterBlend,
      closeSmartFilterBlend,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFilterStore(): FilterStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFilterStore must be used within FilterProvider')
  return ctx
}
