import { RectangleHorizontal, RectangleVertical } from 'lucide-react'
import type { Orientation } from '../../../types/document'

type Props = {
  value: Orientation
  artboard: boolean
  onChange: (o: Orientation) => void
  onArtboardChange: (v: boolean) => void
}

export function OrientationSelector({ value, artboard, onChange, onArtboardChange }: Props) {
  return (
    <div className="ndf ndf--row">
      <div className="ndf__col">
        <label className="ndf__label">방향</label>
        <div className="orient">
          <button
            type="button"
            className={`orient__btn${value === 'portrait' ? ' orient__btn--active' : ''}`}
            title="세로 방향"
            onClick={() => onChange('portrait')}
          >
            <RectangleVertical size={16} />
          </button>
          <button
            type="button"
            className={`orient__btn${value === 'landscape' ? ' orient__btn--active' : ''}`}
            title="가로 방향"
            onClick={() => onChange('landscape')}
          >
            <RectangleHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="ndf__col">
        <label className="ndf__label">아트보드</label>
        <div className="orient">
          <label className="artboard-check">
            <input
              type="checkbox"
              checked={artboard}
              onChange={(e) => onArtboardChange(e.target.checked)}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
