import { FORMAT_MIME, SUPPORTS_QUALITY, type SaveFormat } from '../../types/save'

/** 캔버스를 지정 포맷/품질의 Blob으로 인코딩한다. */
export function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: SaveFormat,
  quality: number,
): Promise<Blob> {
  const mime = FORMAT_MIME[format]
  const q = SUPPORTS_QUALITY[format]
    ? Math.min(1, Math.max(0, quality / 100))
    : undefined
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('이미지 인코딩에 실패했습니다.'))
      },
      mime,
      q,
    )
  })
}
