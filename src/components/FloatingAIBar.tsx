import { Sparkles, MonitorSmartphone, ImagePlus, MoreHorizontal } from 'lucide-react'

const ITEMS = [
  { id: 'generate', label: '이미지 생성', Icon: Sparkles },
  { id: 'device', label: '장치에서 추가', Icon: MonitorSmartphone },
  { id: 'stock', label: '무료 스톡 이미지 추가', Icon: ImagePlus },
]

export function FloatingAIBar() {
  return (
    <div className="ai-bar">
      <span className="ai-bar__grip">⋮</span>
      {ITEMS.map(({ id, label, Icon }) => (
        <button key={id} type="button" className="ai-bar__btn">
          <Icon size={14} className="ai-bar__icon" />
          <span>{label}</span>
        </button>
      ))}
      <button type="button" className="ai-bar__more" title="더보기">
        <MoreHorizontal size={15} />
      </button>
    </div>
  )
}
