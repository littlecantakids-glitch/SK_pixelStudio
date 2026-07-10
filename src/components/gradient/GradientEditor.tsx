import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorDispatch } from '../../state'
import { useGradientStore } from '../../store/gradientStore'
import {
  cloneGradient,
  resolveColor,
  sampleGradientColor,
  stopId,
} from '../../engine/gradientEngine'
import { GradientStrip } from './GradientStrip'
import type { Gradient, GradientStop } from '../../types'

const BAR_W = 380
const BAR_H = 24

/**
 * Gradient Editor — Photoshop식 모달.
 * Color Stop 추가/삭제/이동, Opacity Stop, Midpoint, Preset 저장.
 * 편집은 store 의 gradient 에 실시간 반영되고, 취소 시 열 때 스냅샷으로 복원한다.
 */
export function GradientEditor() {
  const grad = useGradientStore()
  const { gradient, setGradient, editorOpen, setEditorOpen, presets, applyPreset, savePreset } = grad
  const { foregroundColor: fg, backgroundColor: bg } = useEditor()
  const dispatch = useEditorDispatch()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const snapshot = useRef<Gradient | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ kind: 'stop' | 'mid'; id: string } | null>(null)

  // 열릴 때 스냅샷 저장 (취소 복원용)
  useEffect(() => {
    if (editorOpen) {
      snapshot.current = cloneGradient(grad.gradient)
      setName(grad.gradient.name)
      setSelectedId(grad.gradient.stops[0]?.id ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen])

  if (!editorOpen) return null

  const stops = [...gradient.stops].sort((a, b) => a.position - b.position)
  const selected = stops.find((s) => s.id === selectedId) ?? null

  const updateStop = (id: string, patch: Partial<GradientStop>) => {
    setGradient({
      ...gradient,
      stops: gradient.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }

  const posFromEvent = (e: { clientX: number }): number => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r) return 0
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  }

  const addStop = (position: number) => {
    const sample = sampleGradientColor(gradient, position, fg, bg)
    const stop: GradientStop = { id: stopId(), position, color: sample.color, opacity: sample.opacity }
    setGradient({ ...gradient, stops: [...gradient.stops, stop] })
    setSelectedId(stop.id)
  }

  const deleteStop = (id: string) => {
    if (gradient.stops.length <= 2) return
    setGradient({ ...gradient, stops: gradient.stops.filter((s) => s.id !== id) })
    if (selectedId === id) setSelectedId(null)
  }

  const beginDrag = (kind: 'stop' | 'mid', id: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    dragging.current = { kind, id }
    setSelectedId(kind === 'stop' ? id : selectedId)
    const move = (ev: PointerEvent) => {
      const d = dragging.current
      if (!d) return
      const t = posFromEvent(ev)
      if (d.kind === 'stop') {
        updateStop(d.id, { position: t })
      } else {
        // Midpoint — 왼쪽 Stop 기준 상대 위치(0.05~0.95)
        const sorted = [...gradient.stops].sort((a, b) => a.position - b.position)
        const i = sorted.findIndex((s) => s.id === d.id)
        const a = sorted[i]
        const b2 = sorted[i + 1]
        if (!a || !b2) return
        const span = b2.position - a.position
        if (span <= 0) return
        updateStop(d.id, {
          midpoint: Math.min(0.95, Math.max(0.05, (t - a.position) / span)),
        })
      }
    }
    const up = () => {
      dragging.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const ok = () => {
    setGradient({ ...gradient, name: name || gradient.name })
    dispatch({ type: 'ADD_HISTORY', entry: '그라디언트 편집' })
    setEditorOpen(false)
  }
  const cancel = () => {
    if (snapshot.current) setGradient(snapshot.current)
    setEditorOpen(false)
  }

  return (
    <div className="filter-dialog__backdrop">
      <div className="grad-editor" role="dialog" aria-label="그라디언트 편집기">
        <div className="filter-dialog__title">그라디언트 편집기</div>
        <div className="grad-editor__body">
          {/* Preset 그리드 */}
          <div className="grad-editor__section-title">사전 설정</div>
          <div className="grad-editor__presets">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="grad-editor__preset"
                title={p.name}
                onClick={() => {
                  applyPreset(p.id)
                  setName(p.name)
                  setSelectedId(null)
                }}
              >
                <GradientStrip gradient={p} width={56} height={14} />
              </button>
            ))}
          </div>

          {/* 이름 + 저장 */}
          <div className="grad-editor__name-row">
            <span className="grad-editor__label">이름:</span>
            <input
              className="grad-editor__name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="button"
              className="filter-dialog__btn"
              onClick={() => {
                savePreset(name || '사용자 정의 그라디언트')
                dispatch({ type: 'ADD_HISTORY', entry: '그라디언트 사전 설정 저장' })
              }}
            >
              새 그라디언트
            </button>
          </div>

          {/* Gradient Bar + Stops */}
          <div className="grad-editor__bar-wrap">
            {/* Opacity Stops (위) */}
            <div className="grad-editor__stops grad-editor__stops--top">
              {stops.map((s) => (
                <button
                  key={`o-${s.id}`}
                  type="button"
                  className={`grad-editor__opstop${s.id === selectedId ? ' grad-editor__opstop--sel' : ''}`}
                  style={{ left: `${s.position * 100}%` }}
                  title={`불투명도 ${s.opacity}%`}
                  onPointerDown={beginDrag('stop', s.id)}
                >
                  <span
                    className="grad-editor__opstop-fill"
                    style={{ opacity: Math.max(0.08, s.opacity / 100) }}
                  />
                </button>
              ))}
            </div>
            <div
              className="grad-editor__bar"
              ref={barRef}
              onPointerDown={(e) => {
                // 빈 곳 클릭 = Stop 추가
                if ((e.target as HTMLElement).closest('button')) return
                addStop(posFromEvent(e))
              }}
            >
              <GradientStrip gradient={gradient} width={BAR_W} height={BAR_H} />
              {/* Midpoints */}
              {stops.slice(0, -1).map((s, i) => {
                const next = stops[i + 1]
                const mid = s.position + (next.position - s.position) * (s.midpoint ?? 0.5)
                return (
                  <button
                    key={`m-${s.id}`}
                    type="button"
                    className="grad-editor__mid"
                    style={{ left: `${mid * 100}%` }}
                    title="중간점"
                    onPointerDown={beginDrag('mid', s.id)}
                  />
                )
              })}
            </div>
            {/* Color Stops (아래) */}
            <div className="grad-editor__stops grad-editor__stops--bottom">
              {stops.map((s) => (
                <button
                  key={`c-${s.id}`}
                  type="button"
                  className={`grad-editor__cstop${s.id === selectedId ? ' grad-editor__cstop--sel' : ''}`}
                  style={{ left: `${s.position * 100}%` }}
                  title={`${Math.round(s.position * 100)}%`}
                  onPointerDown={beginDrag('stop', s.id)}
                  onDoubleClick={() => setSelectedId(s.id)}
                >
                  <span
                    className="grad-editor__cstop-fill"
                    style={{ background: resolveColor(s.color, fg, bg) }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* 선택된 Stop 컨트롤 */}
          <div className="grad-editor__stop-row">
            <span className="grad-editor__label">색상:</span>
            <input
              type="color"
              className="grad-editor__color"
              disabled={!selected}
              value={selected ? resolveColor(selected.color, fg, bg) : '#000000'}
              onChange={(e) => selected && updateStop(selected.id, { color: e.target.value })}
            />
            <span className="grad-editor__label">불투명도:</span>
            <input
              type="number"
              className="grad-editor__num"
              min={0}
              max={100}
              disabled={!selected}
              value={selected?.opacity ?? 100}
              onChange={(e) => {
                const v = e.target.valueAsNumber
                if (selected && !Number.isNaN(v))
                  updateStop(selected.id, { opacity: Math.min(100, Math.max(0, v)) })
              }}
            />
            <span className="grad-editor__label">위치:</span>
            <input
              type="number"
              className="grad-editor__num"
              min={0}
              max={100}
              disabled={!selected}
              value={selected ? Math.round(selected.position * 100) : 0}
              onChange={(e) => {
                const v = e.target.valueAsNumber
                if (selected && !Number.isNaN(v))
                  updateStop(selected.id, { position: Math.min(1, Math.max(0, v / 100)) })
              }}
            />
            <span className="grad-editor__unit">%</span>
            <button
              type="button"
              className="filter-dialog__btn"
              disabled={!selected || gradient.stops.length <= 2}
              onClick={() => selected && deleteStop(selected.id)}
            >
              삭제
            </button>
          </div>
          <div className="grad-editor__hint">
            바 아래 빈 곳 클릭 = Stop 추가 · Stop 드래그 = 이동 · ◇ 드래그 = 중간점
          </div>
        </div>
        <div className="grad-editor__footer">
          <button type="button" className="filter-dialog__btn filter-dialog__btn--primary" onClick={ok}>
            확인
          </button>
          <button type="button" className="filter-dialog__btn" onClick={cancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
