import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useOpenStore } from '../store/openStore'

export function Toaster() {
  const { toasts, dismissToast } = useOpenStore()
  if (!toasts.length) return null
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast__icon">
            {t.kind === 'error' && <AlertCircle size={15} />}
            {t.kind === 'success' && <CheckCircle2 size={15} />}
            {t.kind === 'info' && <Info size={15} />}
          </span>
          <span className="toast__msg">{t.message}</span>
          <button type="button" className="toast__close" onClick={() => dismissToast(t.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
