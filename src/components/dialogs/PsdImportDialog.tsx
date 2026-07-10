import { FileImage } from 'lucide-react'
import { useOpenStore } from '../../store/openStore'

/**
 * PSD Import 진행 대화상자 — Photoshop Desktop 의 진행 표시기 스타일.
 * Parser 의 단계(헤더 → 리소스 → 합성 이미지 → 문서)를 실시간 표시한다.
 */
export function PsdImportDialog() {
  const { psdImport } = useOpenStore()
  if (!psdImport) return null

  return (
    <div className="psd-progress-backdrop" role="dialog" aria-modal="true">
      <div className="psd-progress">
        <div className="psd-progress__titlebar">Photoshop 문서 가져오기</div>
        <div className="psd-progress__body">
          <div className="psd-progress__file">
            <span className="psd-file-icon psd-file-icon--large">
              <FileImage size={18} />
              <span className="psd-file-icon__ext">PSD</span>
            </span>
            <span className="psd-progress__name" title={psdImport.fileName}>
              {psdImport.fileName}
            </span>
          </div>
          <div className="psd-progress__stage">{psdImport.label}</div>
          <div className="psd-progress__track">
            <div
              className="psd-progress__fill"
              style={{ width: `${psdImport.percent}%` }}
            />
          </div>
          <div className="psd-progress__pct">{psdImport.percent}%</div>
        </div>
      </div>
    </div>
  )
}
