import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { MenuItem } from '../menuData'
import type { RecentFile } from '../types'
import { RecentFiles } from './recent/RecentFiles'

type Props = {
  items: MenuItem[]
  onSelect: (label: string) => void
  recentFiles?: RecentFile[]
  onOpenRecent?: (id: string) => void
  onClearRecent?: () => void
}

export function MenuDropdown({
  items,
  onSelect,
  recentFiles = [],
  onOpenRecent,
  onClearRecent,
}: Props) {
  const [hoverKey, setHoverKey] = useState<string | null>(null)

  return (
    <div className="menu-dropdown" role="menu">
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={`sep-${i}`} className="menu-dropdown__separator" />
        }
        const hasRecentFlyout = item.key === 'recent'
        const hoverId = item.key ?? (item.children ? item.label : null)
        return (
          <div
            key={item.label}
            className="menu-dropdown__row"
            onMouseEnter={() => setHoverKey(hoverId)}
          >
            <button
              type="button"
              role="menuitem"
              className={`menu-dropdown__item${
                item.disabled ? ' menu-dropdown__item--disabled' : ''
              }`}
              disabled={item.disabled}
              onClick={() => !item.disabled && !item.children && onSelect(item.label)}
            >
              <span className="menu-dropdown__label">{item.label}</span>
              {item.shortcut && (
                <span className="menu-dropdown__shortcut">{item.shortcut}</span>
              )}
              {item.submenu && (
                <ChevronRight size={12} className="menu-dropdown__arrow" />
              )}
            </button>
            {hasRecentFlyout && hoverKey === 'recent' && onOpenRecent && onClearRecent && (
              <RecentFiles
                files={recentFiles}
                onOpen={onOpenRecent}
                onClear={onClearRecent}
              />
            )}
            {item.children && hoverKey === item.label && (
              <div className="menu-dropdown menu-dropdown--sub" role="menu">
                {item.children.map((child, j) =>
                  child.type === 'separator' ? (
                    <div key={`csep-${j}`} className="menu-dropdown__separator" />
                  ) : (
                    <button
                      key={child.label}
                      type="button"
                      role="menuitem"
                      className={`menu-dropdown__item${
                        child.disabled ? ' menu-dropdown__item--disabled' : ''
                      }`}
                      disabled={child.disabled}
                      onClick={() => !child.disabled && onSelect(child.label)}
                    >
                      <span className="menu-dropdown__label">{child.label}</span>
                      {child.shortcut && (
                        <span className="menu-dropdown__shortcut">{child.shortcut}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
