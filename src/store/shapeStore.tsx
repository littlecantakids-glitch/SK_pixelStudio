import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ShapeKind, StrokeAlign } from '../types'

/** Shape Tool 모드 — Photoshop 옵션바 좌측 (현재 'shape' 만 실제 동작) */
export type ShapeToolMode = 'shape' | 'path' | 'pixels'

/**
 * Shape Tool 전용 휘발성(비-Undo) 상태.
 * Shape 데이터 자체는 Layer(Document/state)에 저장되고 History 로 관리된다.
 * 여기서는 현재 선택된 도형 종류와 새 도형에 적용할 Fill/Stroke 기본값을 관리한다.
 */
type ShapeStore = {
  /** 현재 Shape 도구 (Rectangle/Ellipse/Line ...) — Flyout 로 전환 */
  kind: ShapeKind
  setKind: (k: ShapeKind) => void
  mode: ShapeToolMode
  setMode: (m: ShapeToolMode) => void

  fillColor: string
  setFillColor: (c: string) => void
  fillEnabled: boolean
  setFillEnabled: (v: boolean) => void

  strokeColor: string
  setStrokeColor: (c: string) => void
  strokeEnabled: boolean
  setStrokeEnabled: (v: boolean) => void
  strokeWidth: number
  setStrokeWidth: (w: number) => void
  strokeAlign: StrokeAlign
  setStrokeAlign: (a: StrokeAlign) => void

  /** roundRect 모서리 반경(px) */
  radius: number
  setRadius: (r: number) => void
  /** polygon 변 개수 (구조 준비) */
  sides: number
  setSides: (n: number) => void
}

const Ctx = createContext<ShapeStore | null>(null)

export function ShapeProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<ShapeKind>('rectangle')
  const [mode, setMode] = useState<ShapeToolMode>('shape')
  const [fillColor, setFillColor] = useState('#7f7f7f')
  const [fillEnabled, setFillEnabled] = useState(true)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeEnabled, setStrokeEnabled] = useState(false)
  const [strokeWidth, setStrokeWidth] = useState(1)
  const [strokeAlign, setStrokeAlign] = useState<StrokeAlign>('center')
  const [radius, setRadius] = useState(12)
  const [sides, setSides] = useState(5)

  const value = useMemo(
    () => ({
      kind,
      setKind,
      mode,
      setMode,
      fillColor,
      setFillColor,
      fillEnabled,
      setFillEnabled,
      strokeColor,
      setStrokeColor,
      strokeEnabled,
      setStrokeEnabled,
      strokeWidth,
      setStrokeWidth,
      strokeAlign,
      setStrokeAlign,
      radius,
      setRadius,
      sides,
      setSides,
    }),
    [
      kind,
      mode,
      fillColor,
      fillEnabled,
      strokeColor,
      strokeEnabled,
      strokeWidth,
      strokeAlign,
      radius,
      sides,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShapeStore(): ShapeStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useShapeStore must be used within ShapeProvider')
  return ctx
}
