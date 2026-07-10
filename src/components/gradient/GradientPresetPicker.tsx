import { useEffect, useRef } from 'react'
import { useGradientStore } from '../../store/gradientStore'
import { useEditorDispatch } from '../../state'
import { GradientStrip } from './GradientStrip'

/**
 * Gradient Preset Picker — Options Bar 프리셋 버튼 ▾ 클릭 시 열리는 Photoshop식 팝업.
 * Preset 선택 시 현재 Gradient 를 교체하고 History('그라디언트 사전 설정 변경')를 기록한다.
 */
export function GradientPresetPicker({ anchor }: { anchor: DOMRect | null }) {
  const { pickerOpen, setPickerOpen, presets, activePresetId, applyPreset, setEditorOpen } =
    useGradientStore()
  const dispatch = useEditorDispatch()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t)) return
      if (t.closest('.gradbar__preset')) return
      setPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen, setPickerOpen])

  if (!pickerOpen) return null
  const top = anchor ? anchor.bottom + 6 : 64
  const left = anchor ? Math.max(8, anchor.left) : 70

  return (
    <div className="grad-picker" style={{ top, left }} ref={ref}>
      <div className="grad-picker__title">그라디언트 사전 설정</div>
      <div className="grad-picker__list">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`grad-picker__item${p.id === activePresetId ? ' grad-picker__item--active' : ''}`}
            title={p.name}
            onClick={() => {
              applyPreset(p.id)
              dispatch({ type: 'ADD_HISTORY', entry: '그라디언트 사전 설정 변경' })
            }}
          >
            <GradientStrip gradient={p} width={92} height={16} />
            <span className="grad-picker__name">{p.name}</span>
          </button>
        ))}
      </div>
      <div className="grad-picker__footer">
        <button
          type="button"
          className="grad-picker__edit"
          onClick={() => {
            setPickerOpen(false)
            setEditorOpen(true)
          }}
        >
          그라디언트 편집...
        </button>
      </div>
    </div>
  )
}
