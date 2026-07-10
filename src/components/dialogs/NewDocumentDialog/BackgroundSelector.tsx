import {
  BACKGROUNDS,
  BACKGROUND_HEX,
  type BackgroundKind,
} from '../../../types/document'

type Props = {
  value: BackgroundKind
  customColor: string
  onChange: (v: BackgroundKind) => void
  onCustomColorChange: (c: string) => void
}

export function BackgroundSelector({ value, customColor, onChange, onCustomColorChange }: Props) {
  const swatch =
    value === 'custom'
      ? customColor
      : value === 'transparent'
        ? undefined
        : BACKGROUND_HEX[value]

  return (
    <div className="ndf">
      <label className="ndf__label">배경 내용</label>
      <div className="ndf__control ndf__control--split">
        <select
          className="ndf__select ndf__select--grow"
          value={value}
          onChange={(e) => onChange(e.target.value as BackgroundKind)}
        >
          {BACKGROUNDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        {value === 'custom' ? (
          <input
            type="color"
            className="ndf__color"
            value={customColor}
            onChange={(e) => onCustomColorChange(e.target.value)}
          />
        ) : (
          <span
            className={`ndf__bg-preview${value === 'transparent' ? ' ndf__bg-preview--transparent' : ''}`}
            style={swatch ? { background: swatch } : undefined}
          />
        )}
      </div>
    </div>
  )
}
