import { useEffect, useMemo, useRef } from 'react'
import type { OpenDocument } from '../../types'
import { boundaryContours } from '../../engine/selectionEngine'
import { useSelectionStore, type SelectionDraft } from '../../store/selectionStore'

type Props = {
  doc: OpenDocument
  getScale: () => number
}

/** 마칭 앤츠 + 진행 중 draft 미리보기. 실제 Canvas(레이어)는 수정하지 않는다. */
export function SelectionOverlay({ doc, getScale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { draft } = useSelectionStore()
  const draftRef = useRef<SelectionDraft>(draft)
  draftRef.current = draft

  // 확정 선택 경계 Path (mask 변경 시에만 재계산)
  // 이어진 폐곡선으로 만들어야 dash 가 경로를 따라 흐른다 — 1px 선분 나열은
  // subpath 마다 dash 위상이 리셋되어 테두리 전체가 깜박이는 원인이 된다.
  const boundaryPath = useMemo(() => {
    const mask = doc.selection.mask
    if (!mask || !doc.selection.active) return null
    const contours = boundaryContours(mask, doc.width, doc.height)
    const path = new Path2D()
    for (const c of contours) {
      path.moveTo(c[0], c[1])
      for (let i = 2; i < c.length; i += 2) path.lineTo(c[i], c[i + 1])
      path.closePath()
    }
    return path
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.selection.mask, doc.selection.active, doc.width, doc.height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = doc.width
    canvas.height = doc.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let t0 = 0
    let curK = 1

    const draftPath = (d: SelectionDraft): Path2D | null => {
      if (!d) return null
      const p = new Path2D()
      if (d.kind === 'rect') {
        p.rect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0))
      } else if (d.kind === 'ellipse') {
        const cx = (d.x0 + d.x1) / 2
        const cy = (d.y0 + d.y1) / 2
        const rx = Math.abs(d.x1 - d.x0) / 2
        const ry = Math.abs(d.y1 - d.y0) / 2
        if (rx > 0 && ry > 0) p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      } else if (d.kind === 'lasso') {
        if (d.points.length) {
          p.moveTo(d.points[0][0], d.points[0][1])
          for (const [x, y] of d.points) p.lineTo(x, y)
        }
      } else if (d.kind === 'polygon') {
        if (d.points.length) {
          p.moveTo(d.points[0][0], d.points[0][1])
          for (const [x, y] of d.points) p.lineTo(x, y)
          p.lineTo(d.cursor[0], d.cursor[1])
        }
      }
      return p
    }

    const strokeAnts = (path: Path2D, scale: number, offset: number) => {
      const lw = 1 / scale
      ctx.lineWidth = lw
      ctx.setLineDash([])
      ctx.strokeStyle = '#ffffff'
      ctx.stroke(path)
      ctx.setLineDash([4 / scale, 4 / scale])
      ctx.lineDashOffset = -offset / scale
      ctx.strokeStyle = '#000000'
      ctx.stroke(path)
      ctx.setLineDash([])
    }

    const tick = (t: number) => {
      if (!t0) t0 = t
      const offset = ((t - t0) / 60) % 8
      const scale = getScale() || 1
      // 슈퍼샘플링 — 캔버스는 CSS 로 문서 크기에 맞춰지고 카메라로 확대되므로,
      // 내부 해상도를 (줌 × devicePixelRatio) 배로 올려야 앤츠가 화면 해상도로 선명하다.
      const dpr = window.devicePixelRatio || 1
      const k = Math.min(3, Math.max(1, Math.ceil(scale * dpr)))
      if (k !== curK) {
        curK = k
        canvas.width = doc.width * k
        canvas.height = doc.height * k
      }
      ctx.setTransform(k, 0, 0, k, 0, 0)
      ctx.clearRect(0, 0, doc.width, doc.height)
      if (boundaryPath) strokeAnts(boundaryPath, scale, offset)
      const dp = draftPath(draftRef.current)
      if (dp) strokeAnts(dp, scale, offset)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [doc.width, doc.height, boundaryPath, getScale])

  return <canvas className="selection-overlay" ref={canvasRef} />
}
