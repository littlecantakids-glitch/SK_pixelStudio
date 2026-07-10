import { ChannelsPanel } from './ChannelsPanel'
import { ColorPanel } from './ColorPanel'
import { LayersPanel } from './LayersPanel'
import { PropertiesPanel } from './PropertiesPanel'

export function RightPanels() {
  return (
    <aside className="rightpanels">
      <ColorPanel />
      <PropertiesPanel />
      {/* 채널 · 패스 · 작업 내역을 한 그룹에 탭으로 */}
      <ChannelsPanel />
      <LayersPanel />
    </aside>
  )
}
