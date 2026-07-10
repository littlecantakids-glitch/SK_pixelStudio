import { LeftToolbar } from './LeftToolbar'
import { OptionsBar } from './OptionsBar'
import { TimelinePanel } from './TimelinePanel'
import { TopMenuBar } from './TopMenuBar'
import { Workspace } from './Workspace'
import { NewDocumentDialog } from './dialogs/NewDocumentDialog/NewDocumentDialog'
import { FilterDialogs } from './dialogs/FilterDialogs'
import { GradientEditor } from './gradient/GradientEditor'
import { SaveAsDialog } from './dialogs/SaveAsDialog/SaveAsDialog'
import { UnsavedChangesDialog } from './dialogs/SaveAsDialog/UnsavedChangesDialog'
import { PsdImportDialog } from './dialogs/PsdImportDialog'
import { PsdFallbackDialog } from './dialogs/PsdFallbackDialog'
import { PsdDiffDialog } from './dialogs/PsdDiffDialog'
import { ImportErrorDialog } from './dialogs/ImportErrorDialog'
import { DropOverlay } from './workspace/DropOverlay'
import { CanvasLoader } from './canvas/CanvasLoader'
import { Toaster } from './Toaster'
import { DebugStats } from './DebugStats'
import { useDragOpen } from '../hooks/useDragOpen'
import { useSaveShortcuts } from '../hooks/useSaveShortcuts'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { useLayerShortcuts } from '../hooks/useLayerShortcuts'
import { useHistoryShortcuts } from '../hooks/useHistoryShortcuts'
import { useClipboardShortcuts } from '../hooks/useClipboardShortcuts'
import { useGlobalShortcutGuard } from '../hooks/useGlobalShortcutGuard'

export function AppShell() {
  useGlobalShortcutGuard() // 앱 단축키 우선 + 막을 수 있는 브라우저 기본 동작 차단
  useDragOpen() // 앱 전체(window)에서 파일 드래그 열기 활성화
  useSaveShortcuts() // Ctrl+S / Ctrl+Shift+S
  useUnsavedChanges() // 저장되지 않은 변경 경고
  useLayerShortcuts() // Ctrl+Shift+N / Delete
  useHistoryShortcuts() // Ctrl+Z / Ctrl+Shift+Z
  useClipboardShortcuts() // Ctrl+C / X / V / Shift+C / Shift+V / J

  return (
    <div className="app-shell">
      <TopMenuBar />
      <OptionsBar />
      <div className="app-shell__main">
        <LeftToolbar />
        <div className="app-shell__center">
          <Workspace />
          <TimelinePanel />
        </div>
      </div>
      <NewDocumentDialog />
      <FilterDialogs />
      <GradientEditor />
      <SaveAsDialog />
      <UnsavedChangesDialog />
      <PsdImportDialog />
      <PsdFallbackDialog />
      <PsdDiffDialog />
      <ImportErrorDialog />
      <DropOverlay />
      <CanvasLoader />
      <Toaster />
      <DebugStats />
    </div>
  )
}
