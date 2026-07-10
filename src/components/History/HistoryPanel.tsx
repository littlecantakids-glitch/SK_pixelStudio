import { useRef, useState } from 'react'
import { Menu, Trash2 } from 'lucide-react'
import { useHistory } from '../../hooks/useHistory'
import { HistoryRow } from './HistoryRow'
import { HistoryMenu } from './HistoryMenu'

export function HistoryPanel() {
  const { items, currentIndex, go, clear } = useHistory()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <section className="panel panel--history">
      <div className="panel__tabs">
        <button type="button" className="panel__tab panel__tab--active">
          작업 내역
        </button>
        <div className="panel__tabs-spacer" />
        <button
          type="button"
          className="history__menu-btn"
          title="패널 메뉴"
          onClick={(e) => setMenu({ x: e.clientX - 160, y: e.clientY + 6 })}
        >
          <Menu size={13} />
        </button>
      </div>

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
        <button
          type="button"
          className="layers__fbtn"
          title="작업 내역 지우기"
          onClick={() => clear()}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {menu && (
        <HistoryMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onClear={clear}
        />
      )}
    </section>
  )
}
