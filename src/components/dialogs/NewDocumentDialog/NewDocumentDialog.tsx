import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { useDocumentStore } from '../../../store/documentStore'
import {
  fromPixels,
  toPixels,
  type DocumentPreset,
  type LengthUnit,
  type Orientation,
} from '../../../types/document'
import { RecentPanel } from './RecentPanel'
import { PresetDetail, type NewDocForm } from './PresetDetail'

const TABS = [
  { id: 'recent', label: '최근 항목', enabled: true },
  { id: 'saved', label: '저장됨', enabled: false },
  { id: 'photo', label: '사진', enabled: false },
  { id: 'print', label: '인쇄', enabled: false },
  { id: 'art', label: '아트 및 일러스트레이션', enabled: false },
  { id: 'web', label: '웹', enabled: false },
  { id: 'mobile', label: '모바일', enabled: false },
  { id: 'film', label: '영화 및 비디오', enabled: false },
]

const DEFAULT_FORM: NewDocForm = {
  name: '제목 없음-1',
  width: 1920,
  height: 1080,
  unit: 'px',
  resolution: 72,
  resolutionUnit: 'ppi',
  orientation: 'landscape',
  artboard: false,
  colorMode: 'RGB',
  bitDepth: 8,
  background: 'white',
  customColor: '#ffffff',
  colorProfile: 'sRGB IEC61966-2.1',
  pixelAspectRatio: '정사각형 픽셀',
}

const WH_MIN = 1
const WH_MAX = 300000
const RES_MIN = 1
const RES_MAX = 1200

export function NewDocumentDialog() {
  const { isNewOpen, closeNew, recent, createDocument } = useDocumentStore()
  const [tab, setTab] = useState('recent')
  const [form, setForm] = useState<NewDocForm>(DEFAULT_FORM)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const nameRef = useRef<HTMLDivElement>(null)

  // 열릴 때마다 기본값으로 초기화
  useEffect(() => {
    if (isNewOpen) {
      setForm(DEFAULT_FORM)
      setSelectedId(null)
      setTab('recent')
    }
  }, [isNewOpen])

  const update = useCallback((patch: Partial<NewDocForm>) => {
    setForm((f) => ({ ...f, ...patch }))
  }, [])

  // 단위 변경 시 폭/높이 값을 자동 변환
  const onUnitChange = useCallback(
    (newUnit: LengthUnit) => {
      setForm((f) => {
        const wPx = toPixels(f.width, f.unit, f.resolution)
        const hPx = toPixels(f.height, f.unit, f.resolution)
        return {
          ...f,
          unit: newUnit,
          width: fromPixels(wPx, newUnit, f.resolution),
          height: fromPixels(hPx, newUnit, f.resolution),
        }
      })
    },
    [],
  )

  // 방향 변경 시 폭/높이 스왑 (Photoshop 동작)
  const onOrientationChange = useCallback((o: Orientation) => {
    setForm((f) => {
      if (f.orientation === o) return f
      const needsSwap =
        (o === 'landscape' && f.width < f.height) ||
        (o === 'portrait' && f.width > f.height)
      return {
        ...f,
        orientation: o,
        width: needsSwap ? f.height : f.width,
        height: needsSwap ? f.width : f.height,
      }
    })
  }, [])

  const onSelectPreset = useCallback((preset: DocumentPreset) => {
    setSelectedId(preset.id)
    setForm({
      name: preset.name === '클립보드' || preset.name === '사용자 정의' ? '제목 없음-1' : preset.name,
      width: preset.width,
      height: preset.height,
      unit: 'px',
      resolution: preset.resolution,
      resolutionUnit: 'ppi',
      orientation: preset.width >= preset.height ? 'landscape' : 'portrait',
      artboard: preset.artboard,
      colorMode: preset.colorMode,
      bitDepth: preset.bitDepth,
      background: preset.background,
      customColor: preset.backgroundColor ?? '#ffffff',
      colorProfile: preset.colorProfile,
      pixelAspectRatio: preset.pixelAspectRatio,
    })
  }, [])

  // 실시간 유효성 검사 (px 기준)
  const { validity, isValid } = useMemo(() => {
    const wPx = toPixels(form.width, form.unit, form.resolution)
    const hPx = toPixels(form.height, form.unit, form.resolution)
    const v = {
      width: form.width > 0 && wPx >= WH_MIN && wPx <= WH_MAX,
      height: form.height > 0 && hPx >= WH_MIN && hPx <= WH_MAX,
      resolution: form.resolution >= RES_MIN && form.resolution <= RES_MAX,
    }
    return { validity: v, isValid: v.width && v.height && v.resolution }
  }, [form])

  const handleCreate = useCallback(() => {
    if (!isValid) return
    const wPx = Math.round(toPixels(form.width, form.unit, form.resolution))
    const hPx = Math.round(toPixels(form.height, form.unit, form.resolution))
    const preset: DocumentPreset = {
      id: selectedId ?? 'new',
      name: form.name.trim() || '제목 없음-1',
      width: wPx,
      height: hPx,
      unit: 'px',
      resolution: form.resolution,
      resolutionUnit: 'ppi',
      orientation: form.orientation,
      artboard: form.artboard,
      colorMode: form.colorMode,
      bitDepth: form.bitDepth,
      background: form.background,
      backgroundColor: form.background === 'custom' ? form.customColor : undefined,
      colorProfile: form.colorProfile,
      pixelAspectRatio: form.pixelAspectRatio,
    }
    createDocument(preset)
  }, [isValid, form, selectedId, createDocument])

  // 키보드: Enter=만들기, ESC=닫기
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeNew()
      } else if (e.key === 'Enter') {
        const target = e.target as HTMLElement
        if (target.tagName !== 'BUTTON' && target.tagName !== 'SELECT') {
          e.preventDefault()
          handleCreate()
        }
      }
    },
    [closeNew, handleCreate],
  )

  if (!isNewOpen) return null

  return (
    <div className="ndd-backdrop" onMouseDown={closeNew}>
      <div
        className="ndd"
        role="dialog"
        aria-label="새로운 문서 만들기"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        ref={nameRef}
      >
        <div className="ndd__titlebar">
          <span className="ndd__title">새로운 문서 만들기</span>
          <button type="button" className="ndd__close" onClick={closeNew} title="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="ndd__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!t.enabled}
              className={`ndd__tab${tab === t.id ? ' ndd__tab--active' : ''}${
                !t.enabled ? ' ndd__tab--disabled' : ''
              }`}
              onClick={() => t.enabled && setTab(t.id)}
            >
              {t.id === 'recent' && <Clock size={13} className="ndd__tab-icon" />}
              {t.label}
            </button>
          ))}
        </div>

        <div className="ndd__body">
          <div className="ndd__main">
            <RecentPanel documents={recent} selectedId={selectedId} onSelect={onSelectPreset} />
            <div className="ndd__stock">
              <span className="ndd__stock-search">🔍 더 많은 템플릿 찾기</span>
              <button type="button" className="ndd__stock-go">이동</button>
            </div>
          </div>

          <div className="ndd__side">
            <PresetDetail
              form={form}
              update={update}
              onUnitChange={onUnitChange}
              onOrientationChange={onOrientationChange}
              validity={validity}
            />
            <div className="ndd__actions">
              <button
                type="button"
                className="ndd__btn ndd__btn--primary"
                disabled={!isValid}
                onClick={handleCreate}
              >
                만들기
              </button>
              <button type="button" className="ndd__btn" onClick={closeNew}>
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
