import { useCallback } from 'react'
import { useActiveDocument, useEditorDispatch } from '../state'
import { useDocumentStore } from '../store/documentStore'
import { useOpenStore } from '../store/openStore'
import type { OpenDocument } from '../types'
import {
  ensureExtension,
  type SaveFormat,
  type SaveOptions,
} from '../types/save'
import { createExportCanvas } from '../services/export/createExportCanvas'
import { renderVisibleLayers } from '../services/export/renderLayers'
import { encodeCanvas } from '../services/export/encodeCanvas'
import { saveAsNewFile, saveToExistingHandle } from '../services/export/saveBlob'

function normalizeFormat(fileType?: string): SaveFormat {
  const t = (fileType ?? '').toLowerCase()
  if (t === 'jpg' || t === 'jpeg') return 'jpeg'
  if (t === 'webp') return 'webp'
  return 'png'
}

/** 문서의 현재 상태로 기본 저장 옵션을 만든다. */
export function defaultSaveOptions(doc: OpenDocument): SaveOptions {
  const format = normalizeFormat(doc.fileType)
  return {
    fileName: ensureExtension(doc.name, format),
    format,
    quality: 90,
    transparency: doc.background === 'transparent',
    includeMetadata: true,
    colorProfile: 'sRGB',
  }
}

/** 내보내기 파이프라인: 실제 Document 캔버스 기준 Blob 생성 (Viewport 무관) */
export async function buildExportBlob(
  doc: OpenDocument,
  options: SaveOptions,
): Promise<Blob> {
  const canvas = createExportCanvas(doc)
  renderVisibleLayers(canvas, doc, options)
  return encodeCanvas(canvas, options.format, options.quality)
}

export function useSaveDocument() {
  const active = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { openSaveAs, closeSaveAs } = useDocumentStore()
  const { toast } = useOpenStore()

  // Save As 대화상자에서 최종 저장 실행
  const confirmSaveAs = useCallback(
    async (options: SaveOptions): Promise<boolean> => {
      if (!active) return false
      const fileName = ensureExtension(options.fileName, options.format)
      try {
        const blob = await buildExportBlob(active, { ...options, fileName })
        const res = await saveAsNewFile(blob, fileName, options.format)
        if (res.error === 'aborted') return false
        if (!res.ok) {
          toast(res.error === 'permission' ? 'Permission denied' : 'Failed to save file', 'error')
          return false
        }
        dispatch({
          type: 'UPDATE_DOCUMENT',
          id: active.id,
          patch: {
            name: fileName,
            fileType: options.format,
            fileHandle: res.handle ?? null,
            dirty: false,
          },
        })
        toast('Saved successfully', 'success')
        closeSaveAs()
        return true
      } catch {
        toast('Failed to save file', 'error')
        return false
      }
    },
    [active, dispatch, toast, closeSaveAs],
  )

  // Save (Ctrl+S): 핸들 있으면 덮어쓰기, 없으면 Save As
  const save = useCallback(async (): Promise<boolean> => {
    if (!active) return false
    if (active.fileHandle) {
      try {
        const options = defaultSaveOptions(active)
        const blob = await buildExportBlob(active, options)
        const res = await saveToExistingHandle(active.fileHandle, blob)
        if (!res.ok) {
          toast(res.error === 'permission' ? 'Permission denied' : 'Failed to save file', 'error')
          return false
        }
        dispatch({ type: 'UPDATE_DOCUMENT', id: active.id, patch: { dirty: false } })
        toast('Saved successfully', 'success')
        return true
      } catch {
        toast('Failed to save file', 'error')
        return false
      }
    }
    openSaveAs()
    return false
  }, [active, dispatch, toast, openSaveAs])

  const saveAs = useCallback(() => {
    if (active) openSaveAs()
  }, [active, openSaveAs])

  return { save, saveAs, confirmSaveAs }
}
