import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useEditor, useEditorDispatch } from '../state'
import { useRecentDocuments } from '../hooks/useRecentDocuments'
import { BACKGROUND_HEX, type DocumentPreset } from '../types/document'
import { createHistoryItem } from '../types/history'
import { emptySelection } from '../types'
import { MASK_DEFAULTS } from '../engine/maskEngine'

type DocumentStore = {
  isNewOpen: boolean
  openNew: () => void
  closeNew: () => void
  recent: DocumentPreset[]
  createDocument: (preset: DocumentPreset) => void
  // Save As 대화상자
  isSaveAsOpen: boolean
  openSaveAs: () => void
  closeSaveAs: () => void
  // 저장 안 됨 경고 (문서 닫기)
  unsavedDocId: string | null
  requestCloseDocument: (id: string) => void
  confirmDiscardClose: () => void
  cancelClose: () => void
}

const Ctx = createContext<DocumentStore | null>(null)

let counter = 1

export function DocumentProvider({ children }: { children: ReactNode }) {
  const editorDispatch = useEditorDispatch()
  const { documents } = useEditor()
  const { recent, addRecent } = useRecentDocuments()
  const [isNewOpen, setNewOpen] = useState(false)
  const [isSaveAsOpen, setSaveAsOpen] = useState(false)
  const [unsavedDocId, setUnsavedDocId] = useState<string | null>(null)

  const openNew = useCallback(() => setNewOpen(true), [])
  const closeNew = useCallback(() => setNewOpen(false), [])
  const openSaveAs = useCallback(() => setSaveAsOpen(true), [])
  const closeSaveAs = useCallback(() => setSaveAsOpen(false), [])

  // 문서 닫기 요청: dirty면 경고 대화상자, 아니면 즉시 닫기
  const requestCloseDocument = useCallback(
    (id: string) => {
      const doc = documents.find((d) => d.id === id)
      if (doc?.dirty) setUnsavedDocId(id)
      else editorDispatch({ type: 'CLOSE_DOCUMENT', id })
    },
    [documents, editorDispatch],
  )
  const confirmDiscardClose = useCallback(() => {
    if (unsavedDocId) editorDispatch({ type: 'CLOSE_DOCUMENT', id: unsavedDocId })
    setUnsavedDocId(null)
  }, [unsavedDocId, editorDispatch])
  const cancelClose = useCallback(() => setUnsavedDocId(null), [])

  const createDocument = useCallback(
    (preset: DocumentPreset) => {
      counter += 1
      const background =
        preset.background === 'custom'
          ? preset.backgroundColor ?? '#ffffff'
          : BACKGROUND_HEX[preset.background]

      const name =
        preset.name && preset.name !== '클립보드' && preset.name !== '사용자 정의'
          ? preset.name
          : `제목 없음-${counter}`

      editorDispatch({
        type: 'ADD_DOCUMENT',
        document: {
          id: `doc-${Date.now()}`,
          name,
          width: Math.round(preset.width),
          height: Math.round(preset.height),
          resolution: preset.resolution,
          background,
          colorMode: preset.colorMode,
          bitDepth: preset.bitDepth,
          fileHandle: null,
          dirty: true,
          zoom: fitZoom(preset.width, preset.height),
          layers: [
            {
              id: 'layer-bg',
              name: '배경',
              type: 'background',
              visible: true,
              locked: true,
              selected: true,
              opacity: 100,
              fill: 100,
              blendMode: 'normal',
              x: 0,
              y: 0,
              width: Math.round(preset.width),
              height: Math.round(preset.height),
              rotation: 0,
              ...MASK_DEFAULTS,
            },
          ],
          activeLayerId: 'layer-bg',
          selection: emptySelection(Math.round(preset.width), Math.round(preset.height)),
          history: [
            createHistoryItem(
              '새 문서',
              'document',
              [
                {
                  id: 'layer-bg',
                  name: '배경',
                  type: 'background',
                  visible: true,
                  locked: true,
                  selected: true,
                  opacity: 100,
                  fill: 100,
                  blendMode: 'normal',
                  x: 0,
                  y: 0,
                  width: Math.round(preset.width),
                  height: Math.round(preset.height),
                  rotation: 0,
                  ...MASK_DEFAULTS,
                },
              ],
              'layer-bg',
            ),
          ],
          historyIndex: 0,
        },
      })
      addRecent({ ...preset, id: `doc-${Date.now()}` })
      setNewOpen(false)
    },
    [editorDispatch, addRecent],
  )

  // Ctrl+N → 새 문서 대화상자 열기 (브라우저 새 창 기본 동작 차단)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setNewOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Ctx.Provider
      value={{
        isNewOpen,
        openNew,
        closeNew,
        recent,
        createDocument,
        isSaveAsOpen,
        openSaveAs,
        closeSaveAs,
        unsavedDocId,
        requestCloseDocument,
        confirmDiscardClose,
        cancelClose,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

/** 캔버스가 작업영역에 적당히 들어오도록 대략적인 줌 배율 계산 */
function fitZoom(w: number, h: number): number {
  const longest = Math.max(w, h)
  if (longest <= 800) return 100
  const z = Math.round((1400 / longest) * 100)
  return Math.max(8, Math.min(100, z))
}

export function useDocumentStore(): DocumentStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDocumentStore must be used within DocumentProvider')
  return ctx
}
