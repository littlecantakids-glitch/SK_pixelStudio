// 파일 열기 관련 유틸 및 이미지 읽기 서비스

// 브라우저가 <img>로 직접 렌더링 가능한 형식
export const RENDERABLE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg']
// PSD Import Engine 이 파싱하는 형식 (psb 는 구조만 준비 — 명확한 오류 안내)
export const PSD_EXTS = ['psd', 'psb']
// 지원은 하지만 브라우저에서 직접 디코딩이 안 되는 형식(UI/문서만 생성)
export const NON_RENDERABLE_EXTS = [...PSD_EXTS, 'tif', 'tiff']

export const SUPPORTED_EXTS = [...RENDERABLE_EXTS, ...NON_RENDERABLE_EXTS]

export const FILE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.psd,.psb,.tif,.tiff,image/*'

// 픽셀 수가 이보다 크면 메모리 부족 위험으로 간주
const MAX_DIMENSION = 30000

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function isSupported(name: string): boolean {
  return SUPPORTED_EXTS.includes(extOf(name))
}

export function isRenderable(name: string): boolean {
  return RENDERABLE_EXTS.includes(extOf(name))
}

/** PSD Import Engine 으로 여는 파일인지 (.psd / .psb) */
export function isPsdFile(name: string): boolean {
  return PSD_EXTS.includes(extOf(name))
}

export class OpenError extends Error {
  constructor(
    public kind: 'unsupported' | 'corrupt' | 'toolarge',
    message: string,
  ) {
    super(message)
  }
}

export type LoadedImage = {
  img: HTMLImageElement | null
  width: number
  height: number
  src?: string
}

/**
 * 이미지 파일을 읽어 HTMLImageElement 와 크기를 반환.
 * - 렌더 가능한 형식: 실제 디코딩. 손상 시 corrupt 에러.
 * - 그 외(psd/tiff): 디코딩 없이 문서만 생성(placeholder 크기).
 */
export function readImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    if (!isSupported(file.name)) {
      reject(new OpenError('unsupported', '지원하지 않는 파일 형식입니다.'))
      return
    }

    if (!isRenderable(file.name)) {
      // PSD/TIFF 등: 브라우저 렌더 불가 → 기본 크기의 빈 문서로 처리
      resolve({ img: null, width: 1920, height: 1080 })
      return
    }

    const src = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const width = img.naturalWidth || img.width
      const height = img.naturalHeight || img.height
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        URL.revokeObjectURL(src)
        reject(new OpenError('toolarge', '이미지가 너무 큽니다.'))
        return
      }
      resolve({ img, width, height, src })
    }
    img.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new OpenError('corrupt', '파일을 열 수 없습니다.'))
    }
    img.src = src
  })
}
