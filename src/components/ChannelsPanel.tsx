import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Menu, Trash2 } from 'lucide-react'
import { PathsPanel } from './PathsPanel'
import { useHistory } from '../hooks/useHistory'
import { HistoryRow } from './History/HistoryRow'
import { HistoryMenu } from './History/HistoryMenu'

type Channel = {
  id: string
  name: string
  shortcut: string
  color: string
  visible: boolean
}

const INITIAL: Channel[] = [
  { id: 'rgb', name: 'RGB', shortcut: 'Ctrl+2', color: 'linear-gradient(135deg,#888,#ccc)', visible: true },
  { id: 'r', name: '빨강', shortcut: 'Ctrl+3', color: '#c0c0c0', visible: true },
  { id: 'g', name: '녹색', shortcut: 'Ctrl+4', color: '#c0c0c0', visible: true },
  { id: 'b', name: '파랑', shortcut: 'Ctrl+5', color: '#c0c0c0', visible: true },
]

/** 채널 / 패스 / 작업 내역 탭을 공유하는 패널 (Photoshop 처럼 한 그룹에 탭으로) */
export function ChannelsPanel() {
  // 기본 탭은 작업 내역
  const [tab, setTab] = useState<'history' | 'channels' | 'paths'>('history')
  const [channels, setChannels] = useState(INITIAL)
  const { items, currentIndex, go, clear } = useHistory()
  const [histMenu, setHistMenu] = useState<{ x: number; y: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const toggle = (id: string) =>
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)))

  // 스택이 쌓이면 항상 최신(현재) 항목을 보이도록 스크롤
  useEffect(() => {
    if (tab !== 'history') return
    const el = listRef.current?.children[currentIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [tab, currentIndex, items.length])

  return (
    <section className="panel panel--channels">
      <div className="panel__tabs">
        <button
          type="button"
          className={`panel__tab${tab === 'history' ? ' panel__tab--active' : ''}`}
          onClick={() => setTab('history')}
        >
          작업 내역
        </button>
        <button
          type="button"
          className={`panel__tab${tab === 'channels' ? ' panel__tab--active' : ''}`}
          onClick={() => setTab('channels')}
        >
          채널
        </button>
        <button
          type="button"
          className={`panel__tab${tab === 'paths' ? ' panel__tab--active' : ''}`}
          onClick={() => setTab('paths')}
        >
          패스
        </button>
        {tab === 'history' && (
          <>
            <div className="panel__tabs-spacer" />
            <button
              type="button"
              className="history__menu-btn"
              title="패널 메뉴"
              onClick={(e) => setHistMenu({ x: e.clientX - 160, y: e.clientY + 6 })}
            >
              <Menu size={13} />
            </button>
          </>
        )}
      </div>

      <div className="panel__body panel__body--nopad">
        {tab === 'channels' && (
          <div className="channels">
            {channels.map((c) => (
              <div key={c.id} className="channels__row">
                <button
                  type="button"
                  className="channels__eye"
                  onClick={() => toggle(c.id)}
                  title="채널 보기 전환"
                >
                  {c.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <span className="channels__thumb" style={{ background: c.color }} />
                <span className="channels__name">{c.name}</span>
                <span className="channels__shortcut">{c.shortcut}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'paths' && <PathsPanel />}

        {tab === 'history' && (
          <>
            <div className="history__list" ref={listRef}>
              {items.map((item, i) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  active={i === currentIndex}
                  dimmed={i > currentIndex}
                  onClick={() => go(i)}
                />
              ))}
            </div>
            <div className="history__footer">
              <span className="history__count">
                {currentIndex + 1} / {items.length}
              </span>
              <button type="button" className="layers__fbtn" title="작업 내역 지우기" onClick={() => clear()}>
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {histMenu && (
        <HistoryMenu x={histMenu.x} y={histMenu.y} onClose={() => setHistMenu(null)} onClear={clear} />
      )}
    </section>
  )
}
