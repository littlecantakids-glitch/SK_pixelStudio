import type { SaveFormat } from '../../types/save'
import {
  downloadBlob,
  ensureWritePermission,
  pickSaveFile,
  supportsFSA,
  writeToHandle,
} from './fileSystemAccess'

export type SaveResult = {
  ok: boolean
  handle?: FileSystemFileHandle | null
  method: 'fsa' | 'download' | 'none'
  error?: 'permission' | 'aborted' | 'failed'
}

/** Save: 기존 파일 핸들에 덮어쓰기 */
export async function saveToExistingHandle(
  handle: FileSystemFileHandle,
  blob: Blob,
): Promise<SaveResult> {
  try {
    if (!(await ensureWritePermission(handle))) {
      return { ok: false, method: 'fsa', error: 'permission' }
    }
    await writeToHandle(handle, blob)
    return { ok: true, handle, method: 'fsa' }
  } catch {
    return { ok: false, method: 'fsa', error: 'failed' }
  }
}

/** Save As: 위치 선택 후 저장. FSA 미지원/취소 시 다운로드로 폴백. */
export async function saveAsNewFile(
  blob: Blob,
  fileName: string,
  format: SaveFormat,
): Promise<SaveResult> {
  if (supportsFSA()) {
    try {
      const handle = await pickSaveFile(fileName, format)
      if (handle) {
        if (!(await ensureWritePermission(handle))) {
          return { ok: false, method: 'fsa', error: 'permission' }
        }
        await writeToHandle(handle, blob)
        return { ok: true, handle, method: 'fsa' }
      }
    } catch (e) {
      // 사용자가 취소한 경우 다운로드로 폴백하지 않음
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { ok: false, method: 'fsa', error: 'aborted' }
      }
      // 그 외 오류는 다운로드로 폴백
    }
  }
  try {
    downloadBlob(blob, fileName)
    return { ok: true, handle: null, method: 'download' }
  } catch {
    return { ok: false, method: 'download', error: 'failed' }
  }
}
