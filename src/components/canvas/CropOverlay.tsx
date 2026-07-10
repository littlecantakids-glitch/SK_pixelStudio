import { useCropStore } from '../../store/cropStore'

/**
 * Crop Overlay — 어두운 바깥 영역 + Crop 경계 + Rule of Thirds + 8 핸들.
 * canvas__doc(문서 좌표) 내부에 배치되어 카메라 scale 로 확대된다.
 * 선/핸들 크기는 scale 로 나눠 화면 기준 일정 px 로 유지한다.
 */
export function CropOverlay({ docW, docH, scale }: { docW: number; docH: number; scale: number }) {
  const { active, box } = useCropStore()
  if (!active) return null
  const s = Math.max(0.01, scale)
  const lw = 1 / s // 경계선 두께 (화면 1px)
  const hs = 10 / s // 핸들 크기
  const bx = box.x
  const by = box.y
  const bw = box.width
  const bh = box.height

  // 어두운 바깥 영역 (문서 범위 내에서 box 를 제외)
  const clampX = Math.max(0, Math.min(docW, bx))
  const clampY = Math.max(0, Math.min(docH, by))
  const clampR = Math.max(0, Math.min(docW, bx + bw))
  const clampB = Math.max(0, Math.min(docH, by + bh))
  const dark = 'rgba(0,0,0,0.55)'
  const darks: React.CSSProperties[] = [
    { left: 0, top: 0, width: docW, height: clampY },
    { left: 0, top: clampB, width: docW, height: Math.max(0, docH - clampB) },
    { left: 0, top: clampY, width: clampX, height: Math.max(0, clampB - clampY) },
    { left: clampR, top: clampY, width: Math.max(0, docW - clampR), height: Math.max(0, clampB - clampY) },
  ]

  const handles: { x: number; y: number }[] = [
    { x: bx, y: by },
    { x: bx + bw / 2, y: by },
    { x: bx + bw, y: by },
    { x: bx + bw, y: by + bh / 2 },
    { x: bx + bw, y: by + bh },
    { x: bx + bw / 2, y: by + bh },
    { x: bx, y: by + bh },
    { x: bx, y: by + bh / 2 },
  ]

  return (
    <div className="crop-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {darks.map((st, i) => (
        <div key={i} className="crop-overlay__dark" style={{ position: 'absolute', background: dark, ...st }} />
      ))}

      {/* 경계 + Rule of Thirds */}
      <div
        className="crop-overlay__box"
        style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, boxShadow: `0 0 0 ${lw}px rgba(255,255,255,0.95)` }}
      >
        {[1, 2].map((i) => (
          <div key={`v${i}`} style={{ position: 'absolute', left: (bw * i) / 3, top: 0, width: lw, height: bh, background: 'rgba(255,255,255,0.4)' }} />
        ))}
        {[1, 2].map((i) => (
          <div key={`h${i}`} style={{ position: 'absolute', top: (bh * i) / 3, left: 0, height: lw, width: bw, background: 'rgba(255,255,255,0.4)' }} />
        ))}
      </div>

      {/* 8 핸들 */}
      {handles.map((h, i) => (
        <div
          key={i}
          className="crop-overlay__handle"
          style={{
            position: 'absolute',
            left: h.x - hs / 2,
            top: h.y - hs / 2,
            width: hs,
            height: hs,
            background: '#fff',
            border: `${lw}px solid rgba(0,0,0,0.6)`,
            boxSizing: 'border-box',
          }}
        />
      ))}
    </div>
  )
}
