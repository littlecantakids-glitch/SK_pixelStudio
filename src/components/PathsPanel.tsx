import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, Trash2, Plus, Lasso, PaintBucket, PenLine } from 'lucide-react'
import { useActiveDocument, useEditorDispatch } from '../state'
import { usePathActions } from '../hooks/usePathActions'
import { buildPath2D, createWorkPath, newPathId, pathBounds } from '../engine/pathEngine'
import type { VectorPath } from '../types'

/** 패스 미니 썸네일 — 바운딩 박스를 40×34 박스에 맞춰 아웃라인 렌더 */
function PathThumb({ path }: { path: VectorPath }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    const b = pathBounds(path)
    if (!b || path.points.length === 0) return
    const pad = 4
    const sx = (c.width - pad * 2) / (b.w || 1)
    const sy = (c.height - pad * 2) / (b.h || 1)
    const s = Math.min(sx, sy, 4)
    ctx.save()
    ctx.translate(pad + (c.width - pad * 2 - b.w * s) / 2, pad + (c.height - pad * 2 - b.h * s) / 2)
    ctx.scale(s, s)
    ctx.translate(-b.x, -b.y)
    ctx.lineWidth = 1 / s
    ctx.strokeStyle = '#cfcfcf'
    ctx.stroke(buildPath2D(path))
    ctx.restore()
  }, [path])
  return <canvas ref={ref} width={44} height={34} className="paths__thumb-canvas" />
}

/** Photoshop식 패스 패널 — Work Path / Saved Path 목록 + Fill/Stroke/Selection/New/Delete */
export function PathsPanel() {
  const doc = useActiveDocument()
  const dispatch = useEditorDispatch()
  const { makeSelection, fillPath, strokePath } = usePathActions()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const paths = useMemo(() => doc?.paths ?? [], [doc?.paths])
  const activeId = doc?.activePathId ?? null

  const newPath = () => {
    const p = createWorkPath(`패스 ${paths.length + 1}`)
    p.id = newPathId()
    dispatch({ type: 'APPLY_PATHS', paths: [...paths, p], activePathId: p.id, label: '새 패스' })
  }

  const commitRename = (id: string) => {
    if (draft.trim()) dispatch({ type: 'RENAME_PATH', id, name: draft.trim() })
    setEditing(null)
  }

  return (
    <div className="paths">
      <div className="paths__list">
        {paths.length === 0 ? (
          <div className="panel__empty panel__empty--pad">패스 없음</div>
        ) : (
          paths.map((p) => (
            <div
              key={p.id}
              className={`paths__row${p.id === activeId ? ' paths__row--active' : ''}`}
              onMouseDown={() => dispatch({ type: 'SELECT_PATH', id: p.id })}
            >
              <button
                type="button"
                className="paths__eye"
                title="패스 보기 전환"
                onMouseDown={(e) => {
                  e.stopPropagation()
                  dispatch({ type: 'TOGGLE_PATH_VISIBILITY', id: p.id })
                }}
              >
                {p.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <span className="paths__thumb">
                <PathThumb path={p} />
              </span>
              {editing === p.id ? (
                <input
                  className="paths__rename"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(p.id)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="paths__name"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setEditing(p.id)
                    setDraft(p.name)
                  }}
                >
                  {p.name}
                  {p.closed ? '' : ' (열림)'}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="paths__toolbar">
        <button type="button" className="paths__btn" title="패스를 선택 영역으로 (Make Selection)" onClick={makeSelection}>
          <Lasso size={14} />
        </button>
        <button type="button" className="paths__btn" title="브러시로 패스 획 (Stroke Path)" onClick={strokePath}>
          <PenLine size={14} />
        </button>
        <button type="button" className="paths__btn" title="전경색으로 패스 칠 (Fill Path)" onClick={fillPath}>
          <PaintBucket size={14} />
        </button>
        <span className="paths__toolbar-gap" />
        <button type="button" className="paths__btn" title="새 패스 만들기" onClick={newPath}>
          <Plus size={14} />
        </button>
        <button
          type="button"
          className="paths__btn"
          title="패스 삭제"
          disabled={!activeId}
          onClick={() => activeId && dispatch({ type: 'DELETE_PATH', id: activeId })}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
