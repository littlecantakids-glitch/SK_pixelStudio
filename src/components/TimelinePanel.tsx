import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Rewind,
  Settings,
  Scissors,
  Film,
  ChevronDown,
} from 'lucide-react'
import { useEditor, useEditorDispatch } from '../state'

export function TimelinePanel() {
  const { isPlaying, timelineEnabled } = useEditor()
  const dispatch = useEditorDispatch()

  return (
    <section className="timeline">
      <div className="timeline__tabs">
        <button type="button" className="panel__tab panel__tab--active">
          타임라인
        </button>
      </div>

      <div className="timeline__body">
        <div className="timeline__controls">
          <button type="button" className="timeline__ctl" title="처음으로">
            <SkipBack size={13} />
          </button>
          <button type="button" className="timeline__ctl" title="이전 프레임">
            <Rewind size={13} />
          </button>
          <button
            type="button"
            className={`timeline__ctl timeline__ctl--play${isPlaying ? ' timeline__ctl--active' : ''}`}
            title={isPlaying ? '정지' : '재생'}
            onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" className="timeline__ctl" title="다음 프레임">
            <SkipForward size={13} />
          </button>
          <span className="timeline__sep" />
          <button type="button" className="timeline__ctl" title="설정">
            <Settings size={13} />
          </button>
          <button type="button" className="timeline__ctl" title="분할">
            <Scissors size={13} />
          </button>
          <button type="button" className="timeline__ctl" title="렌더링">
            <Film size={13} />
          </button>
        </div>

        {timelineEnabled ? (
          <div className="timeline__track-area">
            <div className="timeline__ruler">
              {Array.from({ length: 20 }).map((_, i) => (
                <span key={i} className="timeline__frame-tick">
                  {i}f
                </span>
              ))}
            </div>
            <div className="timeline__track">
              <span className="timeline__track-label">레이어 0</span>
              <div className="timeline__clip" />
            </div>
          </div>
        ) : (
          <div className="timeline__empty">
            <button
              type="button"
              className="timeline__create"
              onClick={() => dispatch({ type: 'TOGGLE_TIMELINE' })}
            >
              비디오 타임라인 만들기
              <ChevronDown size={13} />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
