import type { DocumentPreset } from '../../../types/document'
import { PresetCard } from './PresetCard'

type Props = {
  documents: DocumentPreset[]
  selectedId: string | null
  onSelect: (preset: DocumentPreset) => void
}

export function RecentPanel({ documents, selectedId, onSelect }: Props) {
  return (
    <div className="recent-panel">
      <div className="recent-panel__title">내 최근 항목 ({documents.length})</div>
      <div className="recent-panel__grid">
        {documents.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            selected={preset.id === selectedId}
            onSelect={() => onSelect(preset)}
          />
        ))}
      </div>
    </div>
  )
}
