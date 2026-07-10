import { useState } from 'react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  X,
  ArrowUpDown,
  ArrowLeftRight,
  MoveVertical,
} from 'lucide-react'
import { useActiveDocument, useEditorDispatch } from '../state'
import { useTextStore } from '../store/textStore'
import type { TextAlign, TextAntiAlias, TextSpec } from '../types'
import { measureTextSpec, textLayerName } from '../engine/textEngine'
import { isFontMissing } from '../engine/fontManager'

const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Tahoma',
  'Impact',
  'Comic Sans MS',
  'Malgun Gothic',
  'Nanum Gothic',
  'Noto Sans KR',
]

/** Font Style 프리셋 → weight/style */
const STYLE_PRESETS: { label: string; weight: number; style: 'normal' | 'italic' }[] = [
  { label: 'Regular', weight: 400, style: 'normal' },
  { label: 'Italic', weight: 400, style: 'italic' },
  { label: 'Bold', weight: 700, style: 'normal' },
  { label: 'Bold Italic', weight: 700, style: 'italic' },
]

/**
 * Character / Paragraph 패널 (Photoshop 스타일 플로팅).
 * Text Tool 활성 시 표시. 값 변경은 스토어 기본값 + (선택/편집 중인) Type Layer 에 함께 반영된다.
 */
export function TypePanels() {
  const s = useTextStore()
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const [tab, setTab] = useState<'char' | 'para'>('char')

  const target =
    doc?.layers.find((l) => l.id === doc.activeLayerId && l.type === 'text' && l.text) ?? null
  const cur = target?.text

  /** 스토어 기본값 + 활성 Type Layer 에 스펙 변경 반영 (History 1개) */
  const apply = (partial: Partial<TextSpec>, label: string) => {
    if (target?.text) {
      const nextSpec: TextSpec = { ...target.text, ...partial }
      const m = measureTextSpec(nextSpec)
      dispatch({
        type: 'UPDATE_TEXT',
        id: target.id,
        patch: { text: nextSpec, width: m.width, height: m.height, name: textLayerName(nextSpec.content) },
        label,
      })
    }
  }

  const fontFamily = cur?.fontFamily ?? s.fontFamily
  const fontSize = cur?.fontSize ?? s.fontSize
  const weight = cur?.fontWeight ?? s.fontWeight
  const style = cur?.fontStyle ?? s.fontStyle
  const tracking = cur?.tracking ?? s.tracking
  const leading = cur?.leading ?? s.leading
  const baseline = cur?.baselineShift ?? s.baselineShift
  const hScale = cur?.hScale ?? s.hScale
  const vScale = cur?.vScale ?? s.vScale
  const color = cur?.color ?? s.color
  const alignment = cur?.alignment ?? s.alignment
  const antiAlias = cur?.antiAlias ?? s.antiAlias

  const setFamily = (v: string) => {
    s.setFontFamily(v)
    apply({ fontFamily: v }, '글꼴 변경')
  }
  const setStylePreset = (label: string) => {
    const p = STYLE_PRESETS.find((x) => x.label === label) ?? STYLE_PRESETS[0]
    s.setFontWeight(p.weight)
    s.setFontStyle(p.style)
    apply({ fontWeight: p.weight, fontStyle: p.style }, '글꼴 스타일 변경')
  }
  const setSize = (v: number) => {
    const n = Math.max(1, v)
    s.setFontSize(n)
    apply({ fontSize: n }, '글꼴 크기 변경')
  }
  const setLeading = (v: number) => {
    s.setLeading(Math.max(0, v))
    apply({ leading: Math.max(0, v) }, '행간 변경')
  }
  const setTracking = (v: number) => {
    s.setTracking(v)
    apply({ tracking: v }, '자간 변경')
  }
  const setBaseline = (v: number) => {
    s.setBaselineShift(v)
    apply({ baselineShift: v }, '기준선 이동')
  }
  const setHScale = (v: number) => {
    const n = Math.max(1, v)
    s.setHScale(n)
    apply({ hScale: n }, '가로 비율 변경')
  }
  const setVScale = (v: number) => {
    const n = Math.max(1, v)
    s.setVScale(n)
    apply({ vScale: n }, '세로 비율 변경')
  }
  const setColor = (v: string) => {
    s.setColor(v)
    apply({ color: v }, '색상 변경')
  }
  const setAlign = (v: TextAlign) => {
    s.setAlignment(v)
    apply({ alignment: v }, '단락 정렬 변경')
  }
  const setAntiAlias = (v: TextAntiAlias) => {
    s.setAntiAlias(v)
    apply({ antiAlias: v }, 'Anti-Alias 변경')
  }
  const setWeight = (v: number) => {
    s.setFontWeight(v)
    apply({ fontWeight: v }, '글꼴 굵기 변경')
  }
  const ot = cur?.openType ?? {
    ligatures: true,
    kerning: true,
    smallCaps: false,
    oldStyle: false,
    fractions: false,
    stylisticSet: 0,
  }
  const setOT = (partial: Partial<typeof ot>) => apply({ openType: { ...ot, ...partial } }, 'OpenType 변경')
  const grid = cur?.baselineGrid ?? 0
  const setGrid = (v: number) => apply({ baselineGrid: Math.max(0, v) }, '기준선 격자 변경')

  const curStyleLabel =
    STYLE_PRESETS.find((p) => p.weight === weight && p.style === style)?.label ?? 'Regular'

  return (
    <div className="type-panels" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="type-panels__tabs">
        <button
          type="button"
          className={`type-panels__tab${tab === 'char' ? ' type-panels__tab--active' : ''}`}
          onClick={() => setTab('char')}
        >
          문자
        </button>
        <button
          type="button"
          className={`type-panels__tab${tab === 'para' ? ' type-panels__tab--active' : ''}`}
          onClick={() => setTab('para')}
        >
          단락
        </button>
        <button type="button" className="type-panels__close" title="패널 닫기" onClick={() => s.setPanelOpen(false)}>
          <X size={13} />
        </button>
      </div>

      {tab === 'char' ? (
        <div className="type-panels__body">
          <select className="type-select" value={fontFamily} onChange={(e) => setFamily(e.target.value)}>
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
          {isFontMissing(fontFamily) && (
            <div className="type-row" style={{ fontSize: 10, color: '#e0a34a' }}>
              ⚠ 글꼴 없음 — 대체 글꼴로 표시됩니다
            </div>
          )}

          <div className="type-row">
            <select className="type-select type-row__full" value={curStyleLabel} onChange={(e) => setStylePreset(e.target.value)}>
              {STYLE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="type-row">
            <label className="type-field" title="글꼴 크기">
              <span>T</span>
              <input type="number" min={1} value={Math.round(fontSize)} onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setSize(e.target.valueAsNumber)} />
            </label>
            <label className="type-field" title="행간 (0 = 자동)">
              <ArrowUpDown size={12} />
              <input type="number" min={0} value={Math.round(leading)} onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setLeading(e.target.valueAsNumber)} />
            </label>
          </div>

          <div className="type-row">
            <label className="type-field" title="자간 (트래킹)">
              <span>VA</span>
              <input type="number" value={Math.round(tracking)} onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setTracking(e.target.valueAsNumber)} />
            </label>
            <label className="type-field" title="기준선 이동">
              <MoveVertical size={12} />
              <input type="number" value={Math.round(baseline)} onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setBaseline(e.target.valueAsNumber)} />
            </label>
          </div>

          <div className="type-row">
            <label className="type-field" title="세로 비율">
              <ArrowUpDown size={12} />
              <input type="number" min={1} value={Math.round(vScale)} onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setVScale(e.target.valueAsNumber)} />
            </label>
            <label className="type-field" title="가로 비율">
              <ArrowLeftRight size={12} />
              <input type="number" min={1} value={Math.round(hScale)} onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && setHScale(e.target.valueAsNumber)} />
            </label>
          </div>

          <div className="type-panels__section-title">앤티 앨리어스</div>
          <select className="type-select" value={antiAlias} onChange={(e) => setAntiAlias(e.target.value as TextAntiAlias)}>
            <option value="none">없음</option>
            <option value="sharp">선명하게</option>
            <option value="crisp">뚜렷하게</option>
            <option value="strong">강하게</option>
            <option value="smooth">매끄럽게</option>
          </select>

          <div className="type-panels__section-title">굵기 (가변 글꼴)</div>
          <label className="type-row">
            <input
              type="range"
              min={100}
              max={900}
              step={10}
              value={weight}
              style={{ flex: 1 }}
              onChange={(e) => setWeight(e.target.valueAsNumber)}
            />
            <span style={{ width: 34, textAlign: 'right' }}>{weight}</span>
          </label>

          <div className="type-panels__section-title">OpenType</div>
          <div className="type-btn-group" style={{ flexWrap: 'wrap' }}>
            <button type="button" className={`type-btn${ot.ligatures ? ' type-btn--active' : ''}`} title="합자 (Ligature)" onClick={() => setOT({ ligatures: !ot.ligatures })}>
              fi
            </button>
            <button type="button" className={`type-btn${ot.kerning ? ' type-btn--active' : ''}`} title="커닝 (Kerning)" onClick={() => setOT({ kerning: !ot.kerning })}>
              AV
            </button>
            <button type="button" className={`type-btn${ot.smallCaps ? ' type-btn--active' : ''}`} title="스몰 캡스 (Small Caps)" onClick={() => setOT({ smallCaps: !ot.smallCaps })}>
              Tt
            </button>
            <button type="button" className={`type-btn${ot.oldStyle ? ' type-btn--active' : ''}`} title="올드 스타일 숫자" onClick={() => setOT({ oldStyle: !ot.oldStyle })}>
              12
            </button>
            <button type="button" className={`type-btn${ot.fractions ? ' type-btn--active' : ''}`} title="분수 (Fractions)" onClick={() => setOT({ fractions: !ot.fractions })}>
              ½
            </button>
          </div>
          <label className="type-row">
            <span style={{ width: 90 }}>스타일 세트</span>
            <select className="type-select" value={ot.stylisticSet} onChange={(e) => setOT({ stylisticSet: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? '없음' : `SS0${n}`}
                </option>
              ))}
            </select>
          </label>

          <div className="type-panels__section-title">색상</div>
          <input type="color" className="type-color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      ) : (
        <div className="type-panels__body">
          <div className="type-panels__section-title">정렬</div>
          <div className="type-btn-group">
            <button type="button" className={`type-btn${alignment === 'left' ? ' type-btn--active' : ''}`} title="왼쪽 정렬" onClick={() => setAlign('left')}>
              <AlignLeft size={14} />
            </button>
            <button type="button" className={`type-btn${alignment === 'center' ? ' type-btn--active' : ''}`} title="가운데 정렬" onClick={() => setAlign('center')}>
              <AlignCenter size={14} />
            </button>
            <button type="button" className={`type-btn${alignment === 'right' ? ' type-btn--active' : ''}`} title="오른쪽 정렬" onClick={() => setAlign('right')}>
              <AlignRight size={14} />
            </button>
            <button type="button" className="type-btn" title="양쪽 정렬 (준비 중)" disabled>
              <AlignJustify size={14} />
            </button>
          </div>

          <div className="type-panels__section-title">단락 텍스트</div>
          <div className="type-row" style={{ fontSize: 10, color: '#8a8a8a' }}>
            {cur?.box ? `영역 텍스트 · ${Math.round(cur.box.width)}×${Math.round(cur.box.height)}px` : '문자 도구로 드래그하면 영역(단락) 텍스트'}
          </div>

          <div className="type-panels__section-title">기준선 격자</div>
          <label className="type-row">
            <input type="checkbox" checked={grid > 0} onChange={(e) => setGrid(e.target.checked ? Math.round(s.fontSize) : 0)} />
            <span style={{ flex: 1 }}>격자에 스냅</span>
            <input
              className="type-select"
              style={{ width: 56 }}
              type="number"
              min={0}
              value={Math.round(grid)}
              onChange={(e) => setGrid(e.target.valueAsNumber || 0)}
            />
          </label>
        </div>
      )}
    </div>
  )
}
