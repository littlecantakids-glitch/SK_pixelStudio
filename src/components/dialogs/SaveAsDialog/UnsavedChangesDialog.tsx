import { useEditor } from '../../../state'
import { useDocumentStore } from '../../../store/documentStore'
import { useSaveDocument } from '../../../hooks/useSaveDocument'

export function UnsavedChangesDialog() {
  const { unsavedDocId, confirmDiscardClose, cancelClose } = useDocumentStore()
  const { documents } = useEditor()
  const { save } = useSaveDocument()

  if (!unsavedDocId) return null
  const doc = documents.find((d) => d.id === unsavedDocId)
  if (!doc) return null

  const onSave = async () => {
    const saved = await save()
    if (saved) confirmDiscardClose()
    else cancelClose() // 저장이 Save As 로 넘어갔거나 취소됨 → 닫기 보류
  }

  return (
    <div className="ndd-backdrop" onMouseDown={cancelClose}>
      <div
        className="unsaved-dialog"
        role="dialog"
        aria-label="변경 내용 저장"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="unsaved-dialog__body">
          <div className="unsaved-dialog__title">변경 내용을 저장하시겠습니까?</div>
          <div className="unsaved-dialog__msg">
            "{doc.name}"에 저장되지 않은 변경 내용이 있습니다. 닫기 전에 저장하시겠습니까?
          </div>
        </div>
        <div className="unsaved-dialog__actions">
          <button type="button" className="ndd__btn ndd__btn--primary" onClick={onSave}>
            저장
          </button>
          <button type="button" className="ndd__btn" onClick={confirmDiscardClose}>
            저장 안 함
          </button>
          <button type="button" className="ndd__btn" onClick={cancelClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
