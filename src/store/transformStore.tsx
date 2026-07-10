import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { useActiveDocument, useEditorDispatch } from '../state'
import { useOpenStore } from './openStore'
import type { Layer } from '../types'
import {
  applyBoxToLayers,
  commonBox,
  type Box,
} from '../engine/transformEngine'

type TransformStore = {
  active: boolean
  docId: string | null
  targetIds: string[]
  box0: Box | null
  box: Box | null
  pivot: { x: number; y: number } | null
  previewLayers: Layer[] | null
  begin: () => void
  setBox: (box: Box) => void
  setPivot: (x: number, y: number) => void
  commit: () => void
  cancel: () => void
}

const Ctx = createContext<TransformStore | null>(null)

export function TransformProvider({ children }: { children: ReactNode }) {
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { toast } = useOpenStore()

  const [active, setActive] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)
  const [targetIds, setTargetIds] = useState<string[]>([])
  const [box0, setBox0] = useState<Box | null>(null)
  const [box, setBoxState] = useState<Box | null>(null)
  const [pivot, setPivotState] = useState<{ x: number; y: number } | null>(null)
  const [original, setOriginal] = useState<Layer[] | null>(null)
  const [previewLayers, setPreview] = useState<Layer[] | null>(null)

  const begin = useCallback(() => {
    if (!doc) return
    const selected = doc.layers.filter((l) => l.selected)
    const base = selected.length
      ? selected
      : doc.layers.filter((l) => l.id === doc.activeLayerId)
    const visible = base.filter((l) => l.visible)
    if (visible.length === 0) {
      toast('변형할 레이어가 없습니다.', 'error')
      return
    }
    // 배경/잠금이 하나라도 포함되면 변형 불가 (Photoshop 안정성)
    if (visible.some((l) => l.type === 'background' || l.locked)) {
      toast('Layer is locked.', 'error')
      return
    }
    const targets = visible.filter((l) => (l.width || 0) > 0 && (l.height || 0) > 0)
    if (targets.length === 0) {
      toast('변형할 수 없는 레이어입니다.', 'error')
      return
    }
    const b0 = commonBox(targets)
    setActive(true)
    setDocId(doc.id)
    setTargetIds(targets.map((l) => l.id))
    setBox0(b0)
    setBoxState(b0)
    setPivotState({ x: b0.cx, y: b0.cy })
    setOriginal(doc.layers)
    setPreview(doc.layers)
  }, [doc, toast])

  const setBox = useCallback(
    (next: Box) => {
      if (!original || !box0) return
      setBoxState(next)
      const targetSet = new Set(targetIds)
      setPreview(applyBoxToLayers(original, targetSet, box0, next))
    },
    [original, box0, targetIds],
  )

  const setPivot = useCallback((x: number, y: number) => {
    setPivotState({ x, y })
  }, [])

  const reset = useCallback(() => {
    setActive(false)
    setDocId(null)
    setTargetIds([])
    setBox0(null)
    setBoxState(null)
    setPivotState(null)
    setOriginal(null)
    setPreview(null)
  }, [])

  const commit = useCallback(() => {
    if (!active || !docId || !previewLayers) {
      reset()
      return
    }
    dispatch({ type: 'APPLY_LAYERS', id: docId, layers: previewLayers, label: '자유 변형' })
    reset()
  }, [active, docId, previewLayers, dispatch, reset])

  const cancel = useCallback(() => {
    reset()
  }, [reset])

  return (
    <Ctx.Provider
      value={{
        active,
        docId,
        targetIds,
        box0,
        box,
        pivot,
        previewLayers,
        begin,
        setBox,
        setPivot,
        commit,
        cancel,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useTransformStore(): TransformStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTransformStore must be used within TransformProvider')
  return ctx
}
