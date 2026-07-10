type Props = {
  value: number
  onChange: (v: number) => void
}

export function QualitySlider({ value, onChange }: Props) {
  return (
    <div className="sa-field">
      <label className="sa-field__label">품질</label>
      <div className="sa-quality">
        <input
          type="range"
          min={1}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="sa-quality__slider"
        />
        <input
          type="number"
          min={1}
          max={100}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isNaN(n)) onChange(Math.min(100, Math.max(1, n)))
          }}
          className="sa-quality__num"
        />
      </div>
    </div>
  )
}
