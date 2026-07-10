import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Rect } from '../types'

/**
 * Crop Tool 의 휘발성(비-Undo) 상태.
 * Crop 은 Commit 전까지 Layer 를 수정하지 않는다 — box/angle 은 Overlay 로만 렌더되고,
 * 실제 Document 변경은 Enter/DoubleClick 시 reducer(CROP)가 수행한다.
 */
type CropStore = {
  active: boolean
  docId: string | null
  /** Crop 영역 (문서 좌표, 축 정렬) */
  box: Rect
  /** Straighten/Rotate 각도(도) — 이미지에 적용할 회전 */
  angle: number
  /** 잘린 픽셀 삭제 (ON=파괴적, OFF=비파괴 — 캔버스 밖에 숨김) */
  deleteCropped: boolean
  /** Straighten 모드 (수평선 드래그) */
  straighten: boolean

  begin: (docId: string, box: Rect) => void
  setBox: (box: Rect) => void
  setAngle: (a: number) => void
  setDeleteCropped: (v: boolean) => void
  setStraighten: (v: boolean) => void
  cancel: () => void
}

const Ctx = createContext<CropStore | null>(null)

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 }

export function CropProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)
  const [box, setBox] = useState<Rect>(EMPTY)
  const [angle, setAngle] = useState(0)
  const [deleteCropped, setDeleteCropped] = useState(false)
  const [straighten, setStraighten] = useState(false)

  const begin = useCallback((id: string, b: Rect) => {
    setDocId(id)
    setBox(b)
    setAngle(0)
    setStraighten(false)
    setActive(true)
  }, [])

  const cancel = useCallback(() => {
    setActive(false)
    setDocId(null)
    setAngle(0)
    setStraighten(false)
  }, [])

  const value = useMemo(
    () => ({
      active,
      docId,
      box,
      angle,
      deleteCropped,
      straighten,
      begin,
      setBox,
      setAngle,
      setDeleteCropped,
      setStraighten,
      cancel,
    }),
    [active, docId, box, angle, deleteCropped, straighten, begin, cancel],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCropStore(): CropStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCropStore must be used within CropProvider')
  return ctx
}
