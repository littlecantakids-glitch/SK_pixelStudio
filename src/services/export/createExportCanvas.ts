import type { OpenDocument } from '../../types'

/** 문서의 실제 픽셀 크기로 내보내기용 캔버스를 생성한다. (Viewport 상태와 무관) */
export function createExportCanvas(doc: OpenDocument): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(doc.width))
  canvas.height = Math.max(1, Math.round(doc.height))
  return canvas
}
