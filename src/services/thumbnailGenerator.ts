// 256px 썸네일 생성 (Recent Files 표시용)

const THUMB_MAX = 256

export function makeThumbnail(
  img: HTMLImageElement | HTMLCanvasElement | null,
  max = THUMB_MAX,
): string {
  if (!img) return ''
  const w = img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width
  const h = img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height
  if (!w || !h) return ''

  const scale = Math.min(max / w, max / h, 1)
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(img, 0, 0, tw, th)
  try {
    return canvas.toDataURL('image/png')
  } catch {
    // SVG 등 교차 출처/보안 제약으로 실패할 수 있음
    return ''
  }
}
