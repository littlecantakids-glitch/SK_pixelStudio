import { Upload } from 'lucide-react'
import { useOpenStore } from '../../store/openStore'

export function DropOverlay() {
  const { draggingFile } = useOpenStore()
  if (!draggingFile) return null
  return (
    <div className="drop-overlay">
      <div className="drop-overlay__box">
        <Upload size={44} />
        <span className="drop-overlay__title">여기에 놓아 열기</span>
        <span className="drop-overlay__sub">Drop to Open</span>
      </div>
    </div>
  )
}
