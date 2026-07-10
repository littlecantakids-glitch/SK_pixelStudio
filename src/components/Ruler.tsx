type Props = {
  orientation: 'horizontal' | 'vertical'
  length: number // px 화면 길이
  step?: number // 눈금 간격(px)
}

/** Photoshop식 눈금자. 50px 마다 눈금, 100px 마다 숫자 라벨 */
export function Ruler({ orientation, length, step = 50 }: Props) {
  const ticks: number[] = []
  for (let v = 0; v <= length; v += step) ticks.push(v)

  if (orientation === 'horizontal') {
    return (
      <div className="ruler ruler--h">
        {ticks.map((v) => (
          <div
            key={v}
            className={`ruler__tick ruler__tick--h${
              v % (step * 2) === 0 ? ' ruler__tick--major' : ''
            }`}
            style={{ left: v }}
          >
            {v % (step * 2) === 0 && <span className="ruler__label">{v}</span>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="ruler ruler--v">
      {ticks.map((v) => (
        <div
          key={v}
          className={`ruler__tick ruler__tick--v${
            v % (step * 2) === 0 ? ' ruler__tick--major' : ''
          }`}
          style={{ top: v }}
        >
          {v % (step * 2) === 0 && <span className="ruler__label ruler__label--v">{v}</span>}
        </div>
      ))}
    </div>
  )
}
