import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useOpenStore } from '../../store/openStore'

/**
 * Import 오류 대화상자 — Photoshop Desktop 의 오류 알림 스타일.
 * "…이기 때문에 요청을 완료할 수 없습니다." 문구 + 확인 버튼.
 */
export function ImportErrorDialog() {
  const { importError, dismissImportError } = useOpenStore()
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (importError) okRef.current?.focus()
  }, [importError])

  useEffect(() => {
    if (!importError) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        dismissImportError()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [importError, dismissImportError])

  if (!importError) return null

  return (
    <div className="psd-error-backdrop" role="alertdialog" aria-modal="true">
      <div className="psd-error">
        <div className="psd-error__titlebar">Adobe Photoshop</div>
        <div className="psd-error__body">
          <span className="psd-error__icon">
            <AlertTriangle size={28} />
          </span>
          <div className="psd-error__text">
            <div className="psd-error__message">{importError.message}</div>
            <div className="psd-error__file" title={importError.fileName}>
              {importError.fileName}
            </div>
          </div>
        </div>
        <div className="psd-error__actions">
          <button
            ref={okRef}
            type="button"
            className="psd-error__ok"
            onClick={dismissImportError}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
