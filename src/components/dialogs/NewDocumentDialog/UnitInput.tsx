import { LENGTH_UNITS, type LengthUnit } from '../../../types/document'

type Props = {
  label: string
  value: number
  unit?: LengthUnit
  onValueChange: (v: number) => void
  onUnitChange?: (u: LengthUnit) => void
  showUnit?: boolean
  invalid?: boolean
  min?: number
  max?: number
}

/** 숫자 입력 + (선택적) 단위 드롭다운을 붙인 필드 */
export function UnitInput({
  label,
  value,
  unit,
  onValueChange,
  onUnitChange,
  showUnit = true,
  invalid,
  min,
  max,
}: Props) {
  return (
    <div className="ndf">
      <label className="ndf__label">{label}</label>
      <div className={`ndf__control${invalid ? ' ndf__control--invalid' : ''}`}>
        <input
          type="number"
          className="ndf__input"
          value={Number.isNaN(value) ? '' : value}
          min={min}
          max={max}
          onChange={(e) => onValueChange(e.target.valueAsNumber)}
        />
        {showUnit && unit && (
          <select
            className="ndf__unit"
            value={unit}
            onChange={(e) => onUnitChange?.(e.target.value as LengthUnit)}
          >
            {LENGTH_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
