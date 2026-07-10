import { useRef } from 'react'
import { useActiveDocument, useEditorDispatch } from '../../state'
import type { TextWarp, WarpStyle } from '../../types'

const WARP_STYLES: { value: WarpStyle; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'arc', label: '부채꼴' },
  { value: 'arcLower', label: '아래 부채꼴' },
  { value: 'arcUpper', label: '위 부채꼴' },
  { value: 'arch', label: '아치' },
  { value: 'bulge', label: '돌출' },
  { value: 'shellLower', label: '아래가 넓은 조개' },
  { value: 'shellUpper', label: '위가 넓은 조개' },
  { value: 'flag', label: '깃발' },
  { value: 'wave', label: '물결' },
  { value: 'fish', label: '물고기' },
  { value: 'rise', label: '상승' },
]

const DEFAULT_WARP: TextWarp = { style: 'arc', bend: 50, horizontal: 0, vertical: 0 }

/** Warp Text 대화상자 — 활성 Type Layer 의 warp 를 실시간 편집 */
export function WarpDialog({ layerId, onClose }: { layerId: string; onClose: () => void }) {
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const layer = doc?.layers.find((l) => l.id === layerId)
  const original = useRef<TextWarp | undefined>(layer?.text?.warp)

  if (!layer?.text) return null
  const warp = layer.text.warp ?? { style: 'none', bend: 0, horizontal: 0, vertical: 0 }

  const setWarp = (next: TextWarp, commit = false) => {
    dispatch({
      type: 'UPDATE_TEXT',
      id: layerId,
      patch: { text: { ...layer.text!, warp: next } },
      ...(commit ? { label: '텍스트 뒤틀기' } : {}),
    })
  }

  const setStyle = (style: WarpStyle) => {
    if (style === 'none') setWarp({ ...warp, style: 'none' })
    else setWarp({ ...(warp.style === 'none' ? DEFAULT_WARP : warp), style })
  }

  const disabled = warp.style === 'none'

  return (
    <div className="warp-modal__backdrop" onMouseDown={onClose}>
      <div className="warp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="warp-modal__title">텍스트 뒤틀기</div>
        <div className="warp-modal__body">
          <label className="warp-modal__row">
            <span>스타일</span>
            <select value={warp.style} onChange={(e) => setStyle(e.target.value as WarpStyle)}>
              {WARP_STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="warp-modal__slider">
            <span>구부리기</span>
            <input type="range" min={-100} max={100} value={warp.bend} disabled={disabled} onChange={(e) => setWarp({ ...warp, bend: e.target.valueAsNumber })} />
            <b>{warp.bend}%</b>
          </label>
          <label className="warp-modal__slider">
            <span>가로 왜곡</span>
            <input type="range" min={-100} max={100} value={warp.horizontal} disabled={disabled} onChange={(e) => setWarp({ ...warp, horizontal: e.target.valueAsNumber })} />
            <b>{warp.horizontal}%</b>
          </label>
          <label className="warp-modal__slider">
            <span>세로 왜곡</span>
            <input type="range" min={-100} max={100} value={warp.vertical} disabled={disabled} onChange={(e) => setWarp({ ...warp, vertical: e.target.valueAsNumber })} />
            <b>{warp.vertical}%</b>
          </label>
        </div>
        <div className="warp-modal__actions">
          <button
            type="button"
            className="warp-modal__btn"
            onClick={() => {
              setWarp(original.current ?? { style: 'none', bend: 0, horizontal: 0, vertical: 0 })
              onClose()
            }}
          >
            취소
          </button>
          <button
            type="button"
            className="warp-modal__btn warp-modal__btn--primary"
            onClick={() => {
              setWarp(warp, true)
              onClose()
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
