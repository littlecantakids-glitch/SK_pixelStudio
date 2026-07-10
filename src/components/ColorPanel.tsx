import { useRef, useState } from 'react'
import { useEditor, useEditorDispatch } from '../state'

type Tab = 'color' | 'swatches' | 'gradients' | 'patterns'

const TABS: { id: Tab; label: string }[] = [
  { id: 'color', label: '색상' },
  { id: 'swatches', label: '색상 견본' },
  { id: 'gradients', label: '그라디언트' },
  { id: 'patterns', label: '패턴' },
]

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function ColorPanel() {
  const { foregroundColor } = useEditor()
  const dispatch = useEditorDispatch()
  const [tab, setTab] = useState<Tab>('color')
  const [hue, setHue] = useState(130)
  const [sv, setSv] = useState({ s: 0.7, v: 0.85 })
  const fieldRef = useRef<HTMLDivElement>(null)

  const pickSV = (e: React.MouseEvent) => {
    const el = fieldRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))
    setSv({ s, v })
    dispatch({ type: 'SET_FOREGROUND', color: hsvToHex(hue, s, v) })
  }

  const setHueVal = (h: number) => {
    setHue(h)
    dispatch({ type: 'SET_FOREGROUND', color: hsvToHex(h, sv.s, sv.v) })
  }

  return (
    <section className="panel panel--color">
      <div className="panel__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`panel__tab${tab === t.id ? ' panel__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'color' ? (
        <div className="colorpanel__body">
          <div className="colorpanel__swatches">
            <div
              className="colorpanel__fg"
              style={{ background: foregroundColor }}
              title="전경색"
            />
            <div className="colorpanel__bg" title="배경색" />
          </div>

          <div
            className="colorpanel__field"
            ref={fieldRef}
            style={{ background: hsvToHex(hue, 1, 1) }}
            onMouseDown={pickSV}
          >
            <div className="colorpanel__field-white" />
            <div className="colorpanel__field-black" />
            <div
              className="colorpanel__cursor"
              style={{
                left: `${sv.s * 100}%`,
                top: `${(1 - sv.v) * 100}%`,
              }}
            />
          </div>

          <div className="colorpanel__hue">
            <input
              type="range"
              min={0}
              max={359}
              value={hue}
              onChange={(e) => setHueVal(Number(e.target.value))}
              className="colorpanel__hue-slider"
              // eslint-disable-next-line
              style={{ writingMode: 'vertical-lr' as any, direction: 'rtl' }}
            />
          </div>
        </div>
      ) : (
        <div className="colorpanel__placeholder">
          {tab === 'swatches' && (
            <div className="colorpanel__grid">
              {[
                '#000000', '#ffffff', '#ff0000', '#ff7f00', '#ffff00',
                '#00ff00', '#00ffff', '#0000ff', '#7f00ff', '#ff00ff',
                '#7f7f7f', '#c0c0c0', '#804000', '#008040', '#004080',
              ].map((c) => (
                <button
                  key={c}
                  type="button"
                  className="colorpanel__chip"
                  style={{ background: c }}
                  title={c}
                  onClick={() => dispatch({ type: 'SET_FOREGROUND', color: c })}
                />
              ))}
            </div>
          )}
          {tab === 'gradients' && <span className="panel__empty">그라디언트 사전 설정</span>}
          {tab === 'patterns' && <span className="panel__empty">패턴 사전 설정</span>}
        </div>
      )}
    </section>
  )
}
