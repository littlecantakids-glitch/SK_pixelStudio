import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useOpenStore } from '../../store/openStore'

/**
 * PSD Import Pixel 비교 디버그 (개발 모드) — Ctrl+Alt+D 로 토글.
 * Photoshop Composite ↓ 현재 Import 렌더 ↓ Difference Overlay 를 나란히 표시해
 * Smart Object 변형/혼합/순서 왜곡을 픽셀 단위로 확인한다.
 */
export function PsdDiffDialog() {
  const { psdDebug } = useOpenStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!import.meta.env.DEV || !open) return null

  if (!psdDebug) {
    return (
      <div className="psd-diff-backdrop" onClick={() => setOpen(false)}>
        <div className="psd-diff psd-diff--empty">
          PSD 를 가져온 후 사용할 수 있습니다 (개발 모드)
        </div>
      </div>
    )
  }

  const v = psdDebug.validation
  return (
    <div className="psd-diff-backdrop" role="dialog" aria-modal="true">
      <div className="psd-diff">
        <div className="psd-diff__titlebar">
          <span>
            PSD Composite 비교 — {psdDebug.fileName} · Mean {v.meanError} · Max{' '}
            {v.maxError} · Diff {v.diffPercent}% · {v.sampleSize}
          </span>
          <button type="button" className="psd-diff__close" onClick={() => setOpen(false)}>
            <X size={14} />
          </button>
        </div>
        <div className="psd-diff__body">
          <DiffPane title="Photoshop Composite" source={v.reference} />
          <DiffPane title="현재 Import 결과" source={v.rendered} />
          <DiffPane title="Difference Overlay" source={v.diff} />
        </div>
        <div className="psd-diff__hint">
          빨강 = 오차 8 초과 픽셀 · Ctrl+Alt+D 로 닫기
        </div>
      </div>
    </div>
  )
}

function DiffPane({ title, source }: { title: string; source: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = source.width
    c.height = source.height
    c.getContext('2d')?.drawImage(source, 0, 0)
  }, [source])
  return (
    <div className="psd-diff__pane">
      <div className="psd-diff__label">{title}</div>
      <canvas ref={ref} className="psd-diff__canvas" />
    </div>
  )
}
