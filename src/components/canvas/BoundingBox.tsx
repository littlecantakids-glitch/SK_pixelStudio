import type { Layer } from '../../types'

type Props = {
  layer: Layer
  docWidth: number
  docHeight: number
  scale: number
}

/**
 * Active Layer 주위 Transform Box (표시 전용, Resize 없음).
 * 카메라(camera) 내부에 렌더되어 함께 스케일되므로, 선/핸들 크기는 1/scale로 보정한다.
 */
export function BoundingBox({ layer, docWidth, docHeight, scale }: Props) {
  const w = layer.width || docWidth
  const h = layer.height || docHeight
  const inv = 1 / (scale || 1)
  const handle = 7 * inv

  const handles = [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1, 0.5],
    [1, 1],
    [0.5, 1],
    [0, 1],
    [0, 0.5],
  ]

  return (
    <div
      className="bbox"
      style={{
        left: layer.x,
        top: layer.y,
        width: w,
        height: h,
        borderWidth: inv,
      }}
    >
      {handles.map(([hx, hy], i) => (
        <span
          key={i}
          className="bbox__handle"
          style={{
            left: `${hx * 100}%`,
            top: `${hy * 100}%`,
            width: handle,
            height: handle,
            marginLeft: -handle / 2,
            marginTop: -handle / 2,
            borderWidth: inv,
          }}
        />
      ))}
    </div>
  )
}
