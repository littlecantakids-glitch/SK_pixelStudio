import { FORMAT_LABEL, type SaveFormat } from '../../../types/save'

const FORMATS: SaveFormat[] = ['png', 'jpeg', 'webp']

type Props = {
  value: SaveFormat
  onChange: (f: SaveFormat) => void
}

export function FormatSelector({ value, onChange }: Props) {
  return (
    <div className="sa-field">
      <label className="sa-field__label">형식</label>
      <select
        className="sa-field__select"
        value={value}
        onChange={(e) => onChange(e.target.value as SaveFormat)}
      >
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABEL[f]}
          </option>
        ))}
      </select>
    </div>
  )
}
