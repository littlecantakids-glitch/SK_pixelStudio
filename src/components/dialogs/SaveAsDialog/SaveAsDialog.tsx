import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useActiveDocument } from '../../../state'
import { useDocumentStore } from '../../../store/documentStore'
import { useSaveDocument, defaultSaveOptions } from '../../../hooks/useSaveDocument'
import {
  SUPPORTS_QUALITY,
  SUPPORTS_TRANSPARENCY,
  ensureExtension,
  type SaveColorProfile,
  type SaveFormat,
  type SaveOptions,
} from '../../../types/save'
import { FormatSelector } from './FormatSelector'
import { QualitySlider } from './QualitySlider'
import { SavePreview } from './SavePreview'

export function SaveAsDialog() {
  const { isSaveAsOpen, closeSaveAs } = useDocumentStore()
  const active = useActiveDocument()
  const { confirmSaveAs } = useSaveDocument()
  const [options, setOptions] = useState<SaveOptions | null>(null)
  const [busy, setBusy] = useState(false)

  // 열릴 때 활성 문서 기준 기본 옵션 초기화
  useEffect(() => {
    if (isSaveAsOpen && active) {
      setOptions(defaultSaveOptions(active))
      setBusy(false)
    }
  }, [isSaveAsOpen, active])

  if (!isSaveAsOpen || !active || !options) return null

  const update = (patch: Partial<SaveOptions>) =>
    setOptions((o) => (o ? { ...o, ...patch } : o))

  const onFormatChange = (format: SaveFormat) => {
    update({
      format,
      fileName: ensureExtension(options.fileName, format),
      transparency: SUPPORTS_TRANSPARENCY[format] ? options.transparency : false,
    })
  }

  const onSave = async () => {
    setBusy(true)
    const ok = await confirmSaveAs(options)
    if (!ok) setBusy(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSaveAs()
    } else if (e.key === 'Enter') {
      const tag = (e.target as HTMLElement).tagName
      if (tag !== 'SELECT' && tag !== 'BUTTON') {
        e.preventDefault()
        void onSave()
      }
    }
  }

  return (
    <div className="ndd-backdrop" onMouseDown={closeSaveAs}>
      <div
        className="sa-dialog"
        role="dialog"
        aria-label="다른 이름으로 저장"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="ndd__titlebar">
          <span className="ndd__title">다른 이름으로 저장</span>
          <button type="button" className="ndd__close" onClick={closeSaveAs} title="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="sa-dialog__body">
          <div className="sa-field">
            <label className="sa-field__label">파일 이름</label>
            <input
              className="sa-field__input"
              value={options.fileName}
              autoFocus
              onChange={(e) => update({ fileName: e.target.value })}
            />
          </div>

          <FormatSelector value={options.format} onChange={onFormatChange} />

          {SUPPORTS_QUALITY[options.format] && (
            <QualitySlider value={options.quality} onChange={(q) => update({ quality: q })} />
          )}

          {SUPPORTS_TRANSPARENCY[options.format] && (
            <label className="sa-check">
              <input
                type="checkbox"
                checked={options.transparency}
                onChange={(e) => update({ transparency: e.target.checked })}
              />
              <span>투명도 유지</span>
            </label>
          )}

          <label className="sa-check">
            <input
              type="checkbox"
              checked={options.includeMetadata}
              onChange={(e) => update({ includeMetadata: e.target.checked })}
            />
            <span>메타데이터 포함</span>
          </label>

          <div className="sa-field">
            <label className="sa-field__label">색상 프로필</label>
            <select
              className="sa-field__select"
              value={options.colorProfile}
              onChange={(e) => update({ colorProfile: e.target.value as SaveColorProfile })}
            >
              <option value="sRGB">sRGB IEC61966-2.1</option>
              <option value="DisplayP3">Display P3</option>
            </select>
          </div>

          <SavePreview doc={active} options={options} />
        </div>

        <div className="ndd__actions">
          <button
            type="button"
            className="ndd__btn ndd__btn--primary"
            disabled={busy || !options.fileName.trim()}
            onClick={onSave}
          >
            {busy ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="ndd__btn" onClick={closeSaveAs}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
