import { FileImage } from 'lucide-react'
import type { RecentFile } from '../../types'
import { isPsdFile } from '../../services/fileReader'

type Props = {
  files: RecentFile[]
  onOpen: (id: string) => void
  onClear: () => void
}

/** File → 최근 파일 열기 서브메뉴 (오른쪽 플라이아웃) */
export function RecentFiles({ files, onOpen, onClear }: Props) {
  return (
    <div className="menu-dropdown menu-dropdown--submenu" role="menu">
      {files.length === 0 ? (
        <div className="menu-dropdown__item menu-dropdown__item--disabled">
          <span className="menu-dropdown__label">최근 항목 없음</span>
        </div>
      ) : (
        <>
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              className="menu-dropdown__item recent-item"
              onClick={() => onOpen(f.id)}
              title={`${f.name} · ${formatSize(f.size)}`}
            >
              {f.thumbnail ? (
                <img className="recent-item__thumb" src={f.thumbnail} alt="" />
              ) : isPsdFile(f.name) ? (
                <span className="psd-file-icon">
                  <FileImage size={13} />
                  <span className="psd-file-icon__ext">PSD</span>
                </span>
              ) : (
                <span className="recent-item__thumb recent-item__thumb--empty" />
              )}
              <span className="menu-dropdown__label recent-item__name">{f.name}</span>
            </button>
          ))}
          <div className="menu-dropdown__separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-dropdown__item"
            onClick={onClear}
          >
            <span className="menu-dropdown__label">최근 파일 목록 지우기</span>
          </button>
        </>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
