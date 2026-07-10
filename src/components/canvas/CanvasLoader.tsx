import { useOpenStore } from '../../store/openStore'

export function CanvasLoader() {
  const { isLoading, loadingProgress, psdImport } = useOpenStore()
  // PSD Import 중에는 전용 진행 대화상자(PsdImportDialog)가 표시된다
  if (!isLoading || psdImport) return null
  return (
    <div className="canvas-loader">
      <div className="canvas-loader__box">
        <div className="canvas-loader__spinner" />
        <div className="canvas-loader__label">여는 중…</div>
        <div className="canvas-loader__bar">
          <div className="canvas-loader__fill" style={{ width: `${loadingProgress}%` }} />
        </div>
        <div className="canvas-loader__pct">{loadingProgress}%</div>
      </div>
    </div>
  )
}
