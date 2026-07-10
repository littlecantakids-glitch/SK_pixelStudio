import {
  Blend,
  CircleDot,
  Clock,
  Contrast,
  FileImage,
  Layers as LayersIcon,
  Move,
  Scaling,
  PenTool,
} from 'lucide-react'
import type { HistoryItem, HistoryType } from '../../types/history'

const ICON: Record<HistoryType, typeof Clock> = {
  document: FileImage,
  layer: LayersIcon,
  transform: Scaling,
  brush: Clock,
  selection: Clock,
  mask: CircleDot,
  adjustment: Contrast,
  gradient: Blend,
  crop: Clock,
  text: Clock,
  filter: Clock,
  path: PenTool,
}

type Props = {
  item: HistoryItem
  active: boolean
  dimmed: boolean // 현재 인덱스 이후 항목(redo 대상)은 흐리게
  onClick: () => void
}

export function HistoryRow({ item, active, dimmed, onClick }: Props) {
  const Icon = ICON[item.type] ?? Move
  return (
    <button
      type="button"
      className={`history-row${active ? ' history-row--active' : ''}${
        dimmed ? ' history-row--dimmed' : ''
      }`}
      onClick={onClick}
    >
      <Icon size={13} className="history-row__icon" />
      <span className="history-row__name">{item.name}</span>
    </button>
  )
}
