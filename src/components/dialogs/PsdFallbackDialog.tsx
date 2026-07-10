import { AlertTriangle } from 'lucide-react'
import { useOpenStore } from '../../store/openStore'

/**
 * Composite Fallback 대화상자 — 일부 레이어 파싱 실패 시 선택지 제공.
 * [합성 이미지로 열기] [지원되는 레이어만 열기] [취소]
 */
export function PsdFallbackDialog() {
  const { psdFallback, resolvePsdFallback } = useOpenStore()
  if (!psdFallback) return null

  return (
    <div className="psd-error-backdrop" role="alertdialog" aria-modal="true">
      <div className="psd-error psd-fallback">
        <div className="psd-error__titlebar">Adobe Photoshop</div>
        <div className="psd-error__body">
          <span className="psd-error__icon">
            <AlertTriangle size={28} />
          </span>
          <div className="psd-error__text">
            <div className="psd-error__message">
              일부 레이어를 읽지 못했습니다. ({psdFallback.total}개 중{' '}
              {psdFallback.failed}개 실패)
              <br />
              문서를 어떻게 여시겠습니까?
            </div>
            <div className="psd-error__file" title={psdFallback.fileName}>
              {psdFallback.fileName}
            </div>
          </div>
        </div>
        <div className="psd-error__actions psd-fallback__actions">
          <button
            type="button"
            className="psd-fallback__btn"
            onClick={() => resolvePsdFallback('cancel')}
          >
            취소
          </button>
          <button
            type="button"
            className="psd-fallback__btn"
            onClick={() => resolvePsdFallback('composite')}
          >
            합성 이미지로 열기
          </button>
          <button
            type="button"
            className="psd-error__ok"
            autoFocus
            onClick={() => resolvePsdFallback('partial')}
          >
            지원되는 레이어만 열기
          </button>
        </div>
      </div>
    </div>
  )
}
