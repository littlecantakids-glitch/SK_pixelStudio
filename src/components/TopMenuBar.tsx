import { useEffect, useRef } from 'react'
import { Aperture, Bell, Cloud, Maximize2, Minus, Search, Share2, X } from 'lucide-react'
import { MENU_ITEMS, MENU_LABELS, type MenuItem } from '../menuData'
import { useEditor, useEditorDispatch } from '../state'
import { useActiveDocument } from '../state'
import { useDocumentStore } from '../store/documentStore'
import { useOpenFile } from '../hooks/useOpenFile'
import { useSaveDocument } from '../hooks/useSaveDocument'
import { useTransformStore } from '../store/transformStore'
import { useFilterStore } from '../store/filterStore'
import { useFilters } from '../hooks/useFilters'
import { useLayers } from '../hooks/useLayers'
import { createSmartFilter, SMART_FILTER_META, smartTypeForLabel } from '../engine/smartFilterEngine'
import { useClipboard } from '../hooks/useClipboard'
import { useOpenStore } from '../store/openStore'
import type { MenuId } from '../types'
import { MenuDropdown } from './MenuDropdown'

export function TopMenuBar() {
  const { activeMenu, activeDocumentId } = useEditor()
  const dispatch = useEditorDispatch()
  const { openNew, requestCloseDocument } = useDocumentStore()
  const { triggerPicker, openRecent, recentFiles, clearRecent } = useOpenFile()
  const { save, saveAs } = useSaveDocument()
  const { begin: beginTransform } = useTransformStore()
  const { lastFilter, openSmartFilterEdit } = useFilterStore()
  const { applyFilter } = useFilters()
  const { addSmartFilter } = useLayers()
  const { toast } = useOpenStore()
  const doc = useActiveDocument()
  const clipboard = useClipboard()
  const barRef = useRef<HTMLDivElement>(null)

  /** 편집 메뉴 — Clipboard/Selection 상태에 따라 disabled 동적 계산 */
  function editItems(): MenuItem[] {
    const canUndo = !!doc && doc.historyIndex > 0
    const canRedo = !!doc && doc.historyIndex < doc.history.length - 1
    const items = MENU_ITEMS.edit.map((it): MenuItem => {
      if (it.type !== 'item') return it
      switch (it.label) {
        case '실행 취소':
          return { ...it, disabled: !canUndo }
        case '다시 실행':
          return { ...it, disabled: !canRedo }
        case '오려두기':
          return { ...it, disabled: !clipboard.canCut }
        case '복사':
          return { ...it, disabled: !clipboard.canCopy }
        case '복사 병합':
          return { ...it, disabled: !doc }
        case '붙여넣기':
          return { ...it, disabled: !clipboard.canPaste }
        case '붙여넣기 특수':
          return {
            ...it,
            children: it.children?.map((c) =>
              c.type === 'item' && (c.label === '붙여넣기' || c.label === '제자리에 붙여넣기')
                ? { ...c, disabled: !clipboard.canPaste }
                : c,
            ),
          }
        case '지우기':
          return { ...it, disabled: !clipboard.canClear }
        case '칠...':
        case '획...':
          return { ...it, disabled: !doc }
        default:
          return it
      }
    })
    return items
  }

  /** 편집 메뉴 항목 실행 */
  function handleEditSelect(label: string) {
    switch (label) {
      case '실행 취소':
        dispatch({ type: 'UNDO' })
        return
      case '다시 실행':
        dispatch({ type: 'REDO' })
        return
      case '오려두기':
        clipboard.cut()
        return
      case '복사':
        clipboard.copy()
        return
      case '복사 병합':
        clipboard.copyMerged()
        return
      case '붙여넣기':
        clipboard.paste()
        return
      case '제자리에 붙여넣기':
        clipboard.pasteInPlace()
        return
      case '지우기':
        clipboard.clear()
        return
      case '칠...':
        clipboard.fill()
        return
      case '획...':
        clipboard.stroke()
        return
      default:
        if (label.startsWith('자유 변형')) beginTransform()
    }
  }

  /** Filter 메뉴 — 모든 필터를 비파괴 Smart Filter 로 적용 (일반 레이어는 자동으로 고급 개체 변환) */
  function handleFilterSelect(label: string) {
    if (label === '마지막 필터') {
      if (lastFilter) applyFilter(lastFilter.type, lastFilter.params)
      else toast('적용한 필터가 없습니다.', 'info')
      return
    }
    const smartType = smartTypeForLabel(label)
    if (!smartType) {
      toast('아직 지원되지 않는 필터입니다.', 'info')
      return
    }
    if (!SMART_FILTER_META[smartType].implemented) {
      toast('준비 중인 필터입니다.', 'info')
      return
    }
    const activeLayer = doc?.layers.find((l) => l.id === doc.activeLayerId)
    const isSmart = activeLayer?.type === 'smartObject' && !!activeLayer.smartDocId
    const convertible =
      !!activeLayer &&
      (activeLayer.type === 'raster' || activeLayer.type === 'image' || activeLayer.type === 'background')
    const hasParams = SMART_FILTER_META[smartType].params.length > 0

    if (isSmart && activeLayer) {
      // 이미 고급 개체 → 스택에 스마트 필터 추가 (파라미터가 있으면 편집 다이얼로그)
      const id = addSmartFilter(activeLayer.id, smartType)
      if (hasParams) openSmartFilterEdit(activeLayer.id, id)
      else toast(`${SMART_FILTER_META[smartType].label} 적용`, 'success')
    } else if (convertible) {
      // 일반 레이어 → 고급 개체로 자동 변환하면서 스마트 필터를 붙인다 (비파괴, 스택 생성)
      dispatch({ type: 'CONVERT_TO_SMART_OBJECT', filter: createSmartFilter(smartType) })
      toast(`고급 개체로 변환하고 ${SMART_FILTER_META[smartType].label} 필터를 적용했습니다.`, 'success')
    } else {
      toast('이 레이어에는 필터를 적용할 수 없습니다.', 'error')
    }
  }

  // 메뉴 항목 실행. 파일(새로 만들기/열기/저장/저장/닫기) + 편집(자유 변형) + 필터
  function handleSelect(menu: MenuId, label: string) {
    dispatch({ type: 'SET_MENU', menu: null })
    if (menu === 'edit') {
      handleEditSelect(label)
      return
    }
    if (menu === 'filter') {
      handleFilterSelect(label)
      return
    }
    if (menu !== 'file') return
    if (label.startsWith('새로 만들기')) {
      openNew()
    } else if (label.startsWith('열기')) {
      triggerPicker()
    } else if (label.startsWith('다른 이름으로 저장')) {
      saveAs()
    } else if (label.startsWith('저장')) {
      void save()
    } else if (label.startsWith('닫기') && activeDocumentId) {
      requestCloseDocument(activeDocumentId)
    }
  }

  function handleOpenRecent(id: string) {
    dispatch({ type: 'SET_MENU', menu: null })
    void openRecent(id)
  }

  function handleClearRecent() {
    dispatch({ type: 'SET_MENU', menu: null })
    void clearRecent()
  }

  // 메뉴가 열린 상태에서 바깥 클릭 시 닫기
  useEffect(() => {
    if (!activeMenu) return
    function onDown(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        dispatch({ type: 'SET_MENU', menu: null })
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch({ type: 'SET_MENU', menu: null })
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [activeMenu, dispatch])

  return (
    <div className="topbar" ref={barRef}>
      <div className="topbar__brand" title="Pixel Studio">
        <Aperture size={16} />
      </div>

      <nav className="topbar__menus">
        {MENU_LABELS.map((m) => (
          <div key={m.id} className="topbar__menu-wrap">
            <button
              type="button"
              className={`topbar__menu${
                activeMenu === m.id ? ' topbar__menu--active' : ''
              }`}
              onClick={() => dispatch({ type: 'TOGGLE_MENU', menu: m.id })}
              onMouseEnter={() => {
                // 이미 다른 메뉴가 열려 있으면 hover로 전환 (데스크톱 앱 동작)
                if (activeMenu && activeMenu !== m.id) {
                  dispatch({ type: 'SET_MENU', menu: m.id })
                }
              }}
            >
              {m.label}
            </button>
            {activeMenu === m.id && (
              <MenuDropdown
                items={m.id === 'edit' ? editItems() : MENU_ITEMS[m.id]}
                onSelect={(label) => handleSelect(m.id, label)}
                recentFiles={m.id === 'file' ? recentFiles : undefined}
                onOpenRecent={m.id === 'file' ? handleOpenRecent : undefined}
                onClearRecent={m.id === 'file' ? handleClearRecent : undefined}
              />
            )}
          </div>
        ))}
      </nav>

      <div className="topbar__spacer" />

      <div className="topbar__actions">
        <button type="button" className="topbar__icon" title="공유">
          <Share2 size={15} />
        </button>
        <button type="button" className="topbar__icon" title="알림">
          <Bell size={15} />
        </button>
        <button type="button" className="topbar__icon" title="검색">
          <Search size={15} />
        </button>
        <button type="button" className="topbar__icon" title="클라우드 문서">
          <Cloud size={15} />
        </button>
      </div>

      <div className="topbar__window">
        <button type="button" className="topbar__win-btn" title="최소화">
          <Minus size={13} />
        </button>
        <button type="button" className="topbar__win-btn" title="최대화">
          <Maximize2 size={11} />
        </button>
        <button type="button" className="topbar__win-btn topbar__win-btn--close" title="닫기">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
