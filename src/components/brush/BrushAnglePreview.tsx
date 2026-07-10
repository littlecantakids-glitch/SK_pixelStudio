import { useRef } from 'react'
import { useBrushStore } from '../../store/brushStore'

const BOX = 76

/**
 * Popup 좌측의 브러시 팁 프리뷰 — Photoshop처럼 원 + 십자선 + 각도 화살표.
 * 화살표(또는 원)를 드래그하면 브러시 각도가 바뀐다. roundness 는 타원율로 반영.
 */
export function BrushAnglePreview() {
  const { angle, setAngle, roundness } = useBrushStore()
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const angleFromEvent = (e: PointerEvent | React.PointerEvent) => {
    const svg = ref.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    if (dx === 0 && dy === 0) return null
    // 화면 y축은 아래가 + 이므로 반전, Photoshop처럼 3시 방향이 0°
    return Math.round((-Math.atan2(dy, dx) * 180) / Math.PI)
  }

  const onDown = (e: React.PointerEvent) => {
    dragging.current = true
    const a = angleFromEvent(e)
    if (a != null) setAngle(a)
    const move = (ev: PointerEvent) => {
      if (!dragging.current) return
      const v = angleFromEvent(ev)
      if (v != null) setAngle(v)
    }
    const up = () => {
      dragging.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const c = BOX / 2
  const r = BOX / 2 - 10
  const ry = r * Math.max(0.05, roundness / 100)

  return (
    <svg
      ref={ref}
      className="brush-popup__tipview"
      width={BOX}
      height={BOX}
      viewBox={`0 0 ${BOX} ${BOX}`}
      onPointerDown={onDown}
    >
      <g transform={`rotate(${-angle} ${c} ${c})`}>
        {/* 팁 외곽 (roundness 반영 타원) */}
        <ellipse cx={c} cy={c} rx={r} ry={ry} fill="none" stroke="#c9c9c9" strokeWidth="1.5" />
        {/* 십자선 */}
        <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="#8a8a8a" strokeWidth="1" />
        <line x1={c} y1={c - ry} x2={c} y2={c + ry} stroke="#8a8a8a" strokeWidth="1" />
        {/* 각도 핸들 (3시 방향 화살표) */}
        <polygon
          points={`${c + r + 2},${c - 5} ${c + r + 9},${c} ${c + r + 2},${c + 5}`}
          fill="#dcdcdc"
        />
        {/* 상/하 roundness 핸들 점 */}
        <circle cx={c} cy={c - ry} r={2.4} fill="#dcdcdc" />
        <circle cx={c} cy={c + ry} r={2.4} fill="#dcdcdc" />
      </g>
    </svg>
  )
}
