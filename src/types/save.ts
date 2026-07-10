// Save / Save As 관련 타입 및 상수

export type SaveFormat = 'png' | 'jpeg' | 'webp'

export type SaveColorProfile = 'sRGB' | 'DisplayP3'

export type SaveOptions = {
  fileName: string
  format: SaveFormat
  quality: number // 1~100 (JPEG/WEBP)
  transparency: boolean // PNG/WEBP
  includeMetadata: boolean // 현재 UI만
  colorProfile: SaveColorProfile // 현재 sRGB만 실제 적용
}

export const FORMAT_MIME: Record<SaveFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export const FORMAT_EXT: Record<SaveFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
}

export const FORMAT_LABEL: Record<SaveFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WEBP',
}

export const SUPPORTS_TRANSPARENCY: Record<SaveFormat, boolean> = {
  png: true,
  jpeg: false,
  webp: true,
}

export const SUPPORTS_QUALITY: Record<SaveFormat, boolean> = {
  png: false,
  jpeg: true,
  webp: true,
}

/** 파일명에 올바른 확장자를 보장 */
export function ensureExtension(name: string, format: SaveFormat): string {
  const ext = FORMAT_EXT[format]
  const stripped = name.replace(/\.(png|jpe?g|webp|gif|bmp|tiff?|psd)$/i, '')
  return `${stripped || 'untitled'}.${ext}`
}

// File System Access API 타입 보강 (일부 브라우저 lib 미포함)
declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string
      types?: {
        description?: string
        accept: Record<string, string[]>
      }[]
    }) => Promise<FileSystemFileHandle>
  }
}
