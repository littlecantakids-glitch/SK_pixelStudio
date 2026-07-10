import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { TextAlign, TextAntiAlias } from '../types'

/** Type Tool 종류 — Flyout (현재 horizontal 만 실제 구현) */
export type TextToolKind = 'horizontal' | 'vertical' | 'maskH' | 'maskV'

/** 현재 편집 중인 Type Layer 세션 */
export type TextEditing = { layerId: string; docId: string } | null

/**
 * Text Tool 전용 상태.
 * 새 Text 에 적용할 기본 문자/단락 속성과, 현재 편집 세션(caret) 을 관리한다.
 * Text 데이터 자체는 Layer(Document/state)에 저장되고 History 로 관리된다.
 */
type TextStore = {
  kind: TextToolKind
  setKind: (k: TextToolKind) => void

  fontFamily: string
  setFontFamily: (v: string) => void
  fontSize: number
  setFontSize: (v: number) => void
  fontWeight: number
  setFontWeight: (v: number) => void
  fontStyle: 'normal' | 'italic'
  setFontStyle: (v: 'normal' | 'italic') => void
  tracking: number
  setTracking: (v: number) => void
  leading: number
  setLeading: (v: number) => void
  color: string
  setColor: (v: string) => void
  alignment: TextAlign
  setAlignment: (v: TextAlign) => void
  antiAlias: TextAntiAlias
  setAntiAlias: (v: TextAntiAlias) => void
  baselineShift: number
  setBaselineShift: (v: number) => void
  hScale: number
  setHScale: (v: number) => void
  vScale: number
  setVScale: (v: number) => void

  /** 편집 세션 (caret) — null 이면 편집 아님 */
  editing: TextEditing
  setEditing: (e: TextEditing) => void
  /** Character/Paragraph 패널 표시 여부 */
  panelOpen: boolean
  setPanelOpen: (v: boolean) => void
}

const Ctx = createContext<TextStore | null>(null)

export function TextProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<TextToolKind>('horizontal')
  const [fontFamily, setFontFamily] = useState('Arial')
  const [fontSize, setFontSize] = useState(72)
  const [fontWeight, setFontWeight] = useState(400)
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal')
  const [tracking, setTracking] = useState(0)
  const [leading, setLeading] = useState(0)
  const [color, setColor] = useState('#000000')
  const [alignment, setAlignment] = useState<TextAlign>('left')
  const [antiAlias, setAntiAlias] = useState<TextAntiAlias>('smooth')
  const [baselineShift, setBaselineShift] = useState(0)
  const [hScale, setHScale] = useState(100)
  const [vScale, setVScale] = useState(100)
  const [editing, setEditing] = useState<TextEditing>(null)
  const [panelOpen, setPanelOpen] = useState(true)

  const value = useMemo(
    () => ({
      kind,
      setKind,
      fontFamily,
      setFontFamily,
      fontSize,
      setFontSize,
      fontWeight,
      setFontWeight,
      fontStyle,
      setFontStyle,
      tracking,
      setTracking,
      leading,
      setLeading,
      color,
      setColor,
      alignment,
      setAlignment,
      antiAlias,
      setAntiAlias,
      baselineShift,
      setBaselineShift,
      hScale,
      setHScale,
      vScale,
      setVScale,
      editing,
      setEditing,
      panelOpen,
      setPanelOpen,
    }),
    [
      kind,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      tracking,
      leading,
      color,
      alignment,
      antiAlias,
      baselineShift,
      hScale,
      vScale,
      editing,
      panelOpen,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTextStore(): TextStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTextStore must be used within TextProvider')
  return ctx
}
