import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from './components/AppShell'
import { EditorProvider } from './state'
import { DocumentProvider } from './store/documentStore'
import { OpenProvider } from './store/openStore'
import { MoveProvider } from './store/moveStore'
import { TransformProvider } from './store/transformStore'
import { SelectionProvider } from './store/selectionStore'
import { BrushProvider } from './store/brushStore'
import { CloneProvider } from './store/cloneStore'
import { HealingProvider } from './store/healingStore'
import { PathProvider } from './store/pathStore'
import { ShapeProvider } from './store/shapeStore'
import { TextProvider } from './store/textStore'
import { CropProvider } from './store/cropStore'
import { ClipboardProvider } from './store/clipboardStore'
import { FilterProvider } from './store/filterStore'
import { GradientProvider } from './store/gradientStore'
import { EyedropperProvider } from './store/eyedropperStore'
import { BucketProvider } from './store/bucketStore'
import { WandProvider } from './store/wandStore'
import './styles/editor.css'
import './styles/dialog.css'
import './styles/open.css'
import './styles/viewport.css'
import './styles/save.css'
import './styles/layers.css'
import './styles/move.css'
import './styles/transform.css'
import './styles/history.css'
import './styles/selection.css'
import './styles/brush.css'
import './styles/filter.css'
import './styles/path.css'
import './styles/clipboard.css'
import './styles/shape.css'
import './styles/text.css'
import './styles/smart.css'
import './styles/crop.css'
import './styles/gradient.css'
import './styles/eyedropper.css'
import './styles/psd.css'

import { watchFontLoads } from './engine/fontManager'

// 폰트 로드 감지 시작 (로드 완료 시 RenderEngine 이 텍스트 재렌더)
watchFontLoads()

// PWA 서비스 워커 등록 (standalone 설치용). 실패해도 앱 동작에는 영향 없음.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EditorProvider>
      <ClipboardProvider>
      <OpenProvider>
        <DocumentProvider>
          <MoveProvider>
            <SelectionProvider>
              <BrushProvider>
                <CloneProvider>
                  <HealingProvider>
                    <PathProvider>
                      <ShapeProvider>
                        <TextProvider>
                          <CropProvider>
                            <FilterProvider>
                              <GradientProvider>
                                <EyedropperProvider>
                                  <BucketProvider>
                                    <WandProvider>
                                      <TransformProvider>
                                        <AppShell />
                                      </TransformProvider>
                                    </WandProvider>
                                  </BucketProvider>
                                </EyedropperProvider>
                              </GradientProvider>
                            </FilterProvider>
                          </CropProvider>
                        </TextProvider>
                      </ShapeProvider>
                    </PathProvider>
                  </HealingProvider>
                </CloneProvider>
              </BrushProvider>
            </SelectionProvider>
          </MoveProvider>
        </DocumentProvider>
      </OpenProvider>
      </ClipboardProvider>
    </EditorProvider>
  </StrictMode>,
)
