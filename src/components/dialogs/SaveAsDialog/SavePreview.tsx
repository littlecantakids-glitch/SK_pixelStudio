import { useEffect, useState } from 'react'
import type { OpenDocument } from '../../../types'
import { FORMAT_LABEL, type SaveOptions } from '../../../types/save'
import { buildExportBlob } from '../../../hooks/useSaveDocument'

type Props = {
  doc: OpenDocument
  options: SaveOptions
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '계산 중…'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 실제 내보내기 파이프라인으로 예상 파일 크기를 산출해 표시 */
export function SavePreview({ doc, options }: Props) {
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setSize(null)
    const t = window.setTimeout(() => {
      buildExportBlob(doc, options)
        .then((blob) => {
          if (!cancelled) setSize(blob.size)
        })
        .catch(() => {
          if (!cancelled) setSize(null)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [doc, options])

  return (
    <div className="sa-preview">
      <div className="sa-preview__row">
        <span className="sa-preview__k">크기</span>
        <span className="sa-preview__v">
          {doc.width} x {doc.height} 픽셀
        </span>
      </div>
      <div className="sa-preview__row">
        <span className="sa-preview__k">형식</span>
        <span className="sa-preview__v">{FORMAT_LABEL[options.format]}</span>
      </div>
      <div className="sa-preview__row">
        <span className="sa-preview__k">예상 파일 크기</span>
        <span className="sa-preview__v">{formatSize(size)}</span>
      </div>
    </div>
  )
}
