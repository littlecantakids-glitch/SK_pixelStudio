import { FORMAT_EXT, FORMAT_LABEL, FORMAT_MIME, type SaveFormat } from '../../types/save'

export function supportsFSA(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
}

/** Save As: 저장 위치 선택 대화상자 */
export async function pickSaveFile(
  fileName: string,
  format: SaveFormat,
): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null
  return window.showSaveFilePicker({
    suggestedName: fileName,
    types: [
      {
        description: `${FORMAT_LABEL[format]} Image`,
        accept: { [FORMAT_MIME[format]]: [`.${FORMAT_EXT[format]}`] },
      },
    ],
  })
}

type PermissionCapableHandle = FileSystemFileHandle & {
  queryPermission?: (d: { mode: string }) => Promise<PermissionState>
  requestPermission?: (d: { mode: string }) => Promise<PermissionState>
}

/** 핸들에 쓰기 권한이 있는지 확인하고, 필요 시 요청한다. */
export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const h = handle as PermissionCapableHandle
  if (!h.queryPermission) return true
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  if (!h.requestPermission) return false
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export async function writeToHandle(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

/** Fallback: Blob URL + a[download] 자동 클릭 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
