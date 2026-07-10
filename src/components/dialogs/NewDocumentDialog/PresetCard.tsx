import { Clipboard, File } from 'lucide-react'
import type { DocumentPreset } from '../../../types/document'

type Props = {
  preset: DocumentPreset
  selected: boolean
  onSelect: () => void
}

export function PresetCard({ preset, selected, onSelect }: Props) {
  const isClipboard = preset.name === '클립보드'
  return (
    <button
      type="button"
      className={`preset-card${selected ? ' preset-card--selected' : ''}`}
      onClick={onSelect}
    >
      <span className="preset-card__thumb">
        {isClipboard ? <Clipboard size={30} /> : <File size={30} />}
      </span>
      <span className="preset-card__name">{preset.name}</span>
      <span className="preset-card__meta">
        {preset.width} x {preset.height} 픽셀 @ {preset.resolution} ppi
      </span>
    </button>
  )
}
