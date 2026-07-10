import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useEditorDispatch } from '../state'
import type { Layer, OpenDocument, RecentFile } from '../types'
import {
  FILE_ACCEPT,
  OpenError,
  extOf,
  isPsdFile,
  isSupported,
  readImageFile,
} from '../services/fileReader'
import {
  normalizePsdLayerOrder,
  parsePSD,
  psdErrorMessage,
  validateComposite,
  PSDParseError,
  PSD_STAGE_LABELS,
  type CompositeValidation,
} from '../services/psd'
import { makeThumbnail } from '../services/thumbnailGenerator'
import { createHistoryItem } from '../types/history'
import { emptySelection } from '../types'
import { MASK_DEFAULTS } from '../engine/maskEngine'
import {
  clearRecentFiles,
  getRecentBlob,
  getRecentFiles,
  putRecentFile,
} from '../services/indexedDb'

export type ToastKind = 'info' | 'error' | 'success'
export type Toast = { id: number; message: string; kind: ToastKind }

/** PSD Import 진행 상태 (진행 대화상자 표시용) */
export type PsdImportState = {
  fileName: string
  /** 단계 라벨 — "PSD 헤더 읽는 중…" 등 */
  label: string
  /** 0~100 */
  percent: number
}

/** Import 실패 정보 (오류 대화상자 표시용) */
export type ImportErrorState = {
  fileName: string
  message: string
}

/** 일부 레이어 파싱 실패 시 사용자 선택 (Composite Fallback 대화상자) */
export type PsdFallbackChoice = 'composite' | 'partial' | 'cancel'

export type PsdFallbackState = {
  fileName: string
  failed: number
  total: number
}

/** PSD Import Pixel 비교 디버그 (개발 모드 — Ctrl+Alt+D 로 열기) */
export type PsdDebugState = {
  fileName: string
  validation: CompositeValidation
}

type OpenStore = {
  isLoading: boolean
  loadingProgress: number
  draggingFile: boolean
  recentFiles: RecentFile[]
  toasts: Toast[]
  psdImport: PsdImportState | null
  importError: ImportErrorState | null
  dismissImportError: () => void
  psdFallback: PsdFallbackState | null
  resolvePsdFallback: (choice: PsdFallbackChoice) => void
  /** 마지막 PSD Import 의 Pixel 비교 결과 (개발 모드에서만 채워짐) */
  psdDebug: PsdDebugState | null
  triggerPicker: () => void
  openFiles: (files: FileList | File[]) => Promise<void>
  openRecent: (id: string) => Promise<void>
  clearRecent: () => Promise<void>
  setDragging: (v: boolean) => void
  dismissToast: (id: number) => void
  toast: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<OpenStore | null>(null)

let toastSeq = 1

function backgroundLayer(): Layer {
  return {
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
    width: 0,
    height: 0,
    rotation: 0,
    ...MASK_DEFAULTS,
  }
}

/** 문서를 작업영역에 맞추는 대략적인 줌 배율(Fit To Screen) */
function fitZoom(w: number, h: number): number {
  const availW = Math.max(320, window.innerWidth - 62 - 260 - 40)
  const availH = Math.max(240, window.innerHeight - 30 - 28 - 150 - 70)
  const z = Math.min(availW / w, availH / h, 1) * 100
  return Math.max(5, Math.round(z * 100) / 100)
}

export function OpenProvider({ children }: { children: ReactNode }) {
  const dispatch = useEditorDispatch()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setLoading] = useState(false)
  const [loadingProgress, setProgress] = useState(0)
  const [draggingFile, setDragging] = useState(false)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [psdImport, setPsdImport] = useState<PsdImportState | null>(null)
  const [importError, setImportError] = useState<ImportErrorState | null>(null)
  const [psdFallback, setPsdFallback] = useState<PsdFallbackState | null>(null)
  const [psdDebug, setPsdDebug] = useState<PsdDebugState | null>(null)
  const fallbackResolver = useRef<((choice: PsdFallbackChoice) => void) | null>(null)

  const dismissImportError = useCallback(() => setImportError(null), [])

  /** Composite Fallback 대화상자를 띄우고 사용자 선택을 기다린다 */
  const askPsdFallback = useCallback(
    (state: PsdFallbackState) =>
      new Promise<PsdFallbackChoice>((resolve) => {
        fallbackResolver.current = resolve
        setPsdFallback(state)
      }),
    [],
  )

  const resolvePsdFallback = useCallback((choice: PsdFallbackChoice) => {
    fallbackResolver.current?.(choice)
    fallbackResolver.current = null
    setPsdFallback(null)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = toastSeq++
      setToasts((t) => [...t, { id, message, kind }])
      window.setTimeout(() => dismissToast(id), 3200)
    },
    [dismissToast],
  )

  const refreshRecent = useCallback(async () => {
    setRecentFiles(await getRecentFiles())
  }, [])

  useEffect(() => {
    void refreshRecent()
  }, [refreshRecent])

  /**
   * PSD 파일 하나를 Import — Parser 실행 → Layer Stack 복원 → Document 생성.
   * 개별 레이어 실패 시 Composite Fallback 선택지를 제공하고,
   * Import 는 History 를 만들지 않는다 (새 Document 의 초기 스냅샷 1개만).
   */
  const openPsdOne = useCallback(
    async (file: File, index: number, persist: boolean) => {
      setPsdImport({ fileName: file.name, label: '파일 읽는 중…', percent: 0 })
      try {
        const buffer = await file.arrayBuffer()
        const psd = await parsePSD(buffer, {
          onProgress: (p) =>
            setPsdImport({ fileName: file.name, label: p.label, percent: p.percent }),
        })
        const { width, height } = psd.header
        const composite = psd.composite.canvas

        // ── 그룹 구조 복원 + 편집기 Layer Stack 변환 ──
        setPsdImport({ fileName: file.name, label: PSD_STAGE_LABELS.groups, percent: 92 })
        const converted = normalizePsdLayerOrder(psd)
        const warnings = [...psd.layerMaskInfo.warnings, ...converted.warnings]
        let useComposite = converted.layers.length === 0

        // 일부 레이어를 읽지 못했으면 사용자에게 선택지를 준다
        if (!useComposite && psd.layerMaskInfo.failedCount > 0) {
          const choice = await askPsdFallback({
            fileName: file.name,
            failed: psd.layerMaskInfo.failedCount,
            total: psd.layerMaskInfo.layerCount,
          })
          if (choice === 'cancel') return false
          if (choice === 'composite') useComposite = true
        }
        // 레이어가 있어야 했는데 전부 실패한 경우 → Composite 로 열되 경고
        if (useComposite && psd.layerMaskInfo.failedCount > 0 && converted.layers.length === 0) {
          warnings.push('레이어를 읽지 못해 합성 이미지로 열었습니다')
        }

        // ── Layer Stack 구성 ──
        let layers: Layer[]
        let activeLayerId: string
        if (useComposite) {
          const bg = backgroundLayer()
          bg.type = 'image'
          bg.width = width
          bg.height = height
          bg.bitmap = composite
          layers = [bg]
          activeLayerId = bg.id
        } else {
          layers = converted.layers
          activeLayerId = converted.activeLayerId ?? layers[0].id
        }

        // ── 렌더 결과 확인 (개발 모드 Composite 검증) ──
        setPsdImport({ fileName: file.name, label: PSD_STAGE_LABELS.verify, percent: 96 })
        if (import.meta.env.DEV && !useComposite) {
          const v = validateComposite(composite, layers, width, height)
          if (v) {
            console.info(
              `[PSD] Composite 검증 (${file.name}) — Mean ${v.meanError} / Max ${v.maxError} / Diff ${v.diffPercent}% @ ${v.sampleSize} · Ctrl+Alt+D 로 Difference Overlay 보기`,
            )
            setPsdDebug({ fileName: file.name, validation: v })
            if (v.meanError > 10 || v.diffPercent > 25) {
              warnings.push(
                `렌더 결과가 원본 합성 이미지와 다릅니다 (평균 오차 ${v.meanError}, 차이 픽셀 ${v.diffPercent}%)`,
              )
            }
          }
        }

        // ── Document 생성 ──
        setPsdImport({ fileName: file.name, label: PSD_STAGE_LABELS.document, percent: 98 })
        const thumbnail = makeThumbnail(composite)
        const doc: OpenDocument = {
          id: `doc-${Date.now()}-${index}`,
          name: file.name,
          width,
          height,
          resolution: Math.round(psd.dpi),
          colorMode: 'RGB',
          bitDepth: psd.header.depth,
          background: 'image',
          fileType: extOf(file.name),
          fileSize: file.size,
          fileHandle: null,
          dirty: false,
          zoom: fitZoom(width, height),
          layers,
          activeLayerId,
          selection: emptySelection(width, height),
          history: [createHistoryItem('PSD 열기', 'document', layers, activeLayerId, null)],
          historyIndex: 0,
        }
        dispatch({ type: 'ADD_DOCUMENT', document: doc })
        setPsdImport({ fileName: file.name, label: '완료', percent: 100 })

        // ── Import 결과 안내 ──
        if (!useComposite) {
          const groups = layers.filter((l) => l.type === 'group').length
          toast(
            `${file.name}: 레이어 ${layers.length - groups}개${groups ? `, 그룹 ${groups}개` : ''} 복원`,
            'success',
          )
        } else if (psd.layerMaskInfo.layerCount > 1) {
          toast(`${file.name}: 합성 이미지로 열었습니다.`, 'info')
        }
        if (warnings.length) {
          console.warn(`[PSD] Import 경고 (${file.name})`, warnings)
          const head = warnings.slice(0, 2).join('\n')
          toast(
            `가져오기 경고 ${warnings.length}건\n${head}${warnings.length > 2 ? `\n외 ${warnings.length - 2}건 (콘솔 참고)` : ''}`,
            'info',
          )
        }

        if (persist) {
          try {
            await putRecentFile({
              id: `recent-${file.name}-${file.size}`,
              name: file.name,
              type: file.type || extOf(file.name),
              size: file.size,
              thumbnail,
              modified: Date.now(),
              blob: file,
            })
          } catch {
            // 저장 실패는 열기 자체를 막지 않음
          }
        }
        return true
      } catch (e) {
        // 사용자 취소는 오류 대화상자를 띄우지 않는다
        if (e instanceof PSDParseError && e.kind === 'aborted') return false
        setImportError({ fileName: file.name, message: psdErrorMessage(e) })
        return false
      } finally {
        setPsdImport(null)
      }
    },
    [dispatch, toast, askPsdFallback],
  )

  /** 실제 파일 하나를 문서로 여는 내부 처리 */
  const openOne = useCallback(
    async (file: File, index: number, persist: boolean) => {
      if (!isSupported(file.name)) {
        toast(`지원하지 않는 파일 형식입니다: ${file.name}`, 'error')
        return false
      }
      if (isPsdFile(file.name)) {
        return openPsdOne(file, index, persist)
      }
      const loaded = await readImageFile(file)
      const canRender = !!loaded.img
      const width = loaded.width
      const height = loaded.height
      const thumbnail = canRender ? makeThumbnail(loaded.img) : ''

      const bg = backgroundLayer()
      bg.width = width
      bg.height = height
      if (canRender && loaded.img) {
        bg.type = 'image'
        bg.bitmap = loaded.img
      }
      const doc: OpenDocument = {
        id: `doc-${Date.now()}-${index}`,
        name: file.name,
        width,
        height,
        resolution: 72,
        colorMode: 'RGB',
        bitDepth: 8,
        background: 'image',
        fileType: extOf(file.name),
        fileSize: file.size,
        imageSrc: canRender ? loaded.src : undefined,
        fileHandle: null,
        dirty: false,
        zoom: fitZoom(width, height),
        layers: [bg],
        activeLayerId: bg.id,
        selection: emptySelection(width, height),
        history: [createHistoryItem('이미지 열기', 'document', [bg], bg.id, null)],
        historyIndex: 0,
      }
      dispatch({ type: 'ADD_DOCUMENT', document: doc })

      if (persist) {
        try {
          await putRecentFile({
            id: `recent-${file.name}-${file.size}`,
            name: file.name,
            type: file.type || extOf(file.name),
            size: file.size,
            thumbnail,
            modified: Date.now(),
            blob: file,
          })
        } catch {
          // 저장 실패는 열기 자체를 막지 않음
        }
      }
      return true
    },
    [dispatch, toast, openPsdOne],
  )

  const openFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files)
      if (!arr.length) return
      setLoading(true)
      setProgress(0)
      let opened = 0
      for (let i = 0; i < arr.length; i++) {
        try {
          const ok = await openOne(arr[i], i, true)
          if (ok) opened++
        } catch (e) {
          if (e instanceof OpenError && e.kind === 'toolarge') {
            toast(`이미지가 너무 큽니다: ${arr[i].name}`, 'error')
          } else if (e instanceof OpenError && e.kind === 'unsupported') {
            toast(`지원하지 않는 파일 형식입니다: ${arr[i].name}`, 'error')
          } else {
            toast(`파일을 열 수 없습니다: ${arr[i].name}`, 'error')
          }
        }
        setProgress(Math.round(((i + 1) / arr.length) * 100))
      }
      setLoading(false)
      setProgress(0)
      if (opened) {
        toast(`${opened}개 파일을 열었습니다.`, 'success')
        void refreshRecent()
      }
    },
    [openOne, refreshRecent, toast],
  )

  const openRecent = useCallback(
    async (id: string) => {
      const rec = await getRecentBlob(id)
      if (!rec || !rec.blob) {
        toast('최근 파일을 다시 열 수 없습니다.', 'error')
        return
      }
      const file =
        rec.blob instanceof File
          ? rec.blob
          : new File([rec.blob], rec.name, { type: rec.type })
      await openFiles([file])
    },
    [openFiles, toast],
  )

  const clearRecent = useCallback(async () => {
    await clearRecentFiles()
    await refreshRecent()
  }, [refreshRecent])

  const triggerPicker = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) void openFiles(e.target.files)
      e.target.value = '' // 같은 파일 재선택 허용
    },
    [openFiles],
  )

  // Ctrl+O → 파일 선택창
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        triggerPicker()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [triggerPicker])

  return (
    <Ctx.Provider
      value={{
        isLoading,
        loadingProgress,
        draggingFile,
        recentFiles,
        toasts,
        psdImport,
        importError,
        dismissImportError,
        psdFallback,
        resolvePsdFallback,
        psdDebug,
        triggerPicker,
        openFiles,
        openRecent,
        clearRecent,
        setDragging,
        dismissToast,
        toast,
      }}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={onInputChange}
      />
    </Ctx.Provider>
  )
}

export function useOpenStore(): OpenStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOpenStore must be used within OpenProvider')
  return ctx
}
