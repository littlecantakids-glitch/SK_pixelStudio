import {
  BIT_DEPTHS,
  COLOR_MODES,
  type BitDepth,
  type ColorMode,
} from '../../../types/document'

type Props = {
  mode: ColorMode
  bitDepth: BitDepth
  onModeChange: (m: ColorMode) => void
  onBitDepthChange: (b: BitDepth) => void
}

export function ColorModeSelector({ mode, bitDepth, onModeChange, onBitDepthChange }: Props) {
  return (
    <div className="ndf">
      <label className="ndf__label">색상 모드</label>
      <div className="ndf__control ndf__control--split">
        <select
          className="ndf__select ndf__select--grow"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as ColorMode)}
        >
          {COLOR_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className="ndf__select ndf__select--depth"
          value={bitDepth}
          onChange={(e) => onBitDepthChange(Number(e.target.value) as BitDepth)}
        >
          {BIT_DEPTHS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
