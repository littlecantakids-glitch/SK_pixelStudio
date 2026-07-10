import type { Box, Handle } from '../../engine/transformEngine'
import type { GestureMode } from '../../hooks/useTransformTool'

type Props = {
  box: Box
  pivot: { x: number; y: number }
  scale: number
  onGesture: (mode: GestureMode, handle: Handle | null, clientX: number, clientY: number) => void
}

const HANDLES: { h: Handle; x: number; y: number; cursor: string }[] = [
  { h: 'top-left', x: 0, y: 0, cursor: 'nwse-resize' },
  { h: 'top', x: 0.5, y: 0, cursor: 'ns-resize' },
  { h: 'top-right', x: 1, y: 0, cursor: 'nesw-resize' },
  { h: 'right', x: 1, y: 0.5, cursor: 'ew-resize' },
  { h: 'bottom-right', x: 1, y: 1, cursor: 'nwse-resize' },
  { h: 'bottom', x: 0.5, y: 1, cursor: 'ns-resize' },
  { h: 'bottom-left', x: 0, y: 1, cursor: 'nesw-resize' },
  { h: 'left', x: 0, y: 0.5, cursor: 'ew-resize' },
]

/**
 * 변형 박스 (카메라 내부, 캔버스 좌표 기준). 선/핸들은 1/scale 로 보정해 화면상 일정 크기 유지.
 * 회전은 box.rot 를 CSS transform 으로 표현한다.
 */
export function TransformBox({ box, pivot, scale, onGesture }: Props) {
  const inv = 1 / (scale || 1)
  const handleSize = 8 * inv
  const w = box.hw * 2
  const h = box.hh * 2
  const left = box.cx - box.hw
  const top = box.cy - box.hh

  return (
    <>
      {/* 회전 링: 박스보다 약간 크게, 뒤쪽에 두어 바깥 근처 드래그 시 회전 */}
      <div
        className="tbox-rotate"
        style={{
          left: left - 14 * inv,
          top: top - 14 * inv,
          width: w + 28 * inv,
          height: h + 28 * inv,
          transform: `rotate(${box.rot}deg)`,
          transformOrigin: `${box.hw + 14 * inv}px ${box.hh + 14 * inv}px`,
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onGesture('rotate', null, e.clientX, e.clientY)
        }}
      />

      <div
        className="tbox"
        style={{
          left,
          top,
          width: w,
          height: h,
          borderWidth: inv,
          transform: `rotate(${box.rot}deg)`,
          transformOrigin: `${box.hw}px ${box.hh}px`,
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onGesture('move', null, e.clientX, e.clientY)
        }}
      >
        {HANDLES.map((hd) => (
          <span
            key={hd.h}
            className="tbox__handle"
            style={{
              left: `${hd.x * 100}%`,
              top: `${hd.y * 100}%`,
              width: handleSize,
              height: handleSize,
              marginLeft: -handleSize / 2,
              marginTop: -handleSize / 2,
              borderWidth: inv,
              cursor: hd.cursor,
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              onGesture('scale', hd.h, e.clientX, e.clientY)
            }}
          />
        ))}
      </div>

      {/* Pivot 포인트 */}
      <span
        className="tbox__pivot"
        style={{
          left: pivot.x,
          top: pivot.y,
          width: 12 * inv,
          height: 12 * inv,
          marginLeft: -6 * inv,
          marginTop: -6 * inv,
          borderWidth: inv,
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onGesture('pivot', null, e.clientX, e.clientY)
        }}
      />
    </>
  )
}
