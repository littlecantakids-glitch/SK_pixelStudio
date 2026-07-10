import { CanvasArea } from './CanvasArea'
import { RightPanels } from './RightPanels'

export function Workspace() {
  return (
    <div className="workspace">
      <CanvasArea />
      <RightPanels />
    </div>
  )
}
