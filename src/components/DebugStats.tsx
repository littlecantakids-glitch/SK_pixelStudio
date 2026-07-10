import { useEffect, useState } from 'react'
import { getActiveEngine, type RenderStats } from '../engine/renderEngine'
import { textCacheStats } from '../engine/textEngine'
import { missingFonts } from '../engine/fontManager'
import { useActiveDocument, useEditor } from '../state'
import { useBrushStore } from '../store/brushStore'
import { useClipboardStore } from '../store/clipboardStore'

/** 개발 모드 전용 오버레이 — Render Stats + 현재 Tool/Target/Composite 상태 */
export function DebugStats() {
  const [stats, setStats] = useState<RenderStats | null>(null)
  const { activeTool } = useEditor()
  const doc = useActiveDocument()
  const { mode, spacing, preview } = useBrushStore()
  const { data: clip } = useClipboardStore()

  useEffect(() => {
    if (!import.meta.env.DEV) return
    let raf = 0
    const tick = () => {
      const e = getActiveEngine()
      setStats(e ? { ...e.stats } : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!import.meta.env.DEV || !stats) return null

  const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId)
  const target = doc?.activeTarget === 'mask' && activeLayer?.mask ? 'mask' : 'bitmap'
  const paintTool = activeTool === 'brush' || activeTool === 'eraser'
  const composite = !paintTool
    ? '-'
    : target === 'mask'
      ? 'source-over'
      : activeTool === 'eraser'
        ? 'destination-out'
        : mode === 'erase'
          ? 'destination-out'
          : mode === 'normal'
            ? 'source-over'
            : mode

  return (
    <div className="debug-stats">
      <div>FPS: {stats.fps}</div>
      <div>Render: {stats.renderTime.toFixed(2)}ms</div>
      <div>Layers: {stats.layerCount}</div>
      <div>Overlays: {stats.overlayCount}</div>
      <div>Dirty: {stats.dirty ? 'yes' : 'no'}</div>
      <div>Tool: {activeTool}</div>
      {paintTool && (
        <>
          <div>Target: {target}</div>
          <div>Composite: {composite}</div>
          <div>Selection: {doc?.selection.active ? 'yes' : 'no'}</div>
          <div>Pressure: 1 (mouse)</div>
          <div>Spacing: {spacing}%</div>
          <div>Stroke: {preview.active ? 'active' : '-'}</div>
        </>
      )}
      <div className="debug-stats__sep" />
      <div>
        Text cache: {textCacheStats().bitmaps} glyph / {textCacheStats().measures} measure
      </div>
      {missingFonts().length > 0 && <div>Missing fonts: {missingFonts().length}</div>}
      <div className="debug-stats__sep" />
      <div>Clipboard: {clip ? clip.type : 'empty'}</div>
      {clip && (
        <>
          <div>
            Size: {clip.width} × {clip.height}
          </div>
          {clip.bounds && (
            <div>
              Bounds: {clip.bounds.x},{clip.bounds.y}
            </div>
          )}
          <div>Mem: {((clip.width * clip.height * 4) / 1024 / 1024).toFixed(2)} MB</div>
          <div>Time: {new Date(clip.timestamp).toLocaleTimeString()}</div>
        </>
      )}
    </div>
  )
}
