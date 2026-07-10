import { Package, Pencil, Replace, Layers as LayersIcon, Sparkles } from 'lucide-react'
import { useEditor } from '../state'
import { useLayers } from '../hooks/useLayers'
import { useOpenStore } from '../store/openStore'
import { SMART_FILTER_META } from '../engine/smartFilterEngine'
import type { Layer, SmartFilterType } from '../types'

/** 속성 패널의 빠른 추가용 대표 필터 (전체 목록은 Filter 메뉴에서) */
const QUICK_FILTERS: SmartFilterType[] = ['gaussianBlur', 'motionBlur', 'smartSharpen', 'addNoise']

/**
 * Smart Object 속성 패널 — Photoshop 처럼 Smart Object 선택 시 Properties 가 이 뷰로 바뀐다.
 * Name / Type(Embedded·Linked) / Width·Height / Edit·Replace·Rasterize / Source Path.
 */
export function SmartObjectProperties({ layer }: { layer: Layer }) {
  const { documents } = useEditor()
  const { editSmartObject, replaceSmartContents, rasterize, addSmartFilter } = useLayers()
  const { toast } = useOpenStore()
  const sd = documents.find((d) => d.id === layer.smartDocId)
  const filterCount = layer.smartFilters?.length ?? 0

  return (
    <div className="props">
      <div className="props__header">
        <Package size={13} />
        <span>고급 개체 ({layer.name})</span>
      </div>

      <div className="props__section">
        <div className="props__section-title">▾ 정보</div>
        <div className="so-props__row">
          <span className="so-props__key">종류</span>
          <span className="so-props__val">{layer.linked ? '연결됨 (Linked)' : '포함됨 (Embedded)'}</span>
        </div>
        <div className="so-props__row">
          <span className="so-props__key">폭</span>
          <span className="so-props__val">{sd?.width ?? layer.width}px</span>
        </div>
        <div className="so-props__row">
          <span className="so-props__key">높이</span>
          <span className="so-props__val">{sd?.height ?? layer.height}px</span>
        </div>
        {layer.linked && (
          <div className="so-props__row">
            <span className="so-props__key">소스</span>
            <span className="so-props__val so-props__val--path">{layer.sourcePath ?? '—'}</span>
          </div>
        )}
      </div>

      <div className="props__section">
        <div className="props__section-title">▾ 작업</div>
        <button type="button" className="so-props__btn" onClick={() => editSmartObject(layer.id)}>
          <Pencil size={13} /> 내용 편집
        </button>
        <button type="button" className="so-props__btn" onClick={() => replaceSmartContents(layer.id)}>
          <Replace size={13} /> 내용 교체...
        </button>
        <button type="button" className="so-props__btn" onClick={() => rasterize(layer.id)}>
          <LayersIcon size={13} /> 래스터화
        </button>
      </div>

      <div className="props__section">
        <div className="props__section-title">▾ 스마트 필터 {filterCount > 0 ? `(${filterCount})` : ''}</div>
        {QUICK_FILTERS.map((t) => (
          <button
            key={t}
            type="button"
            className="so-props__btn"
            onClick={() => {
              addSmartFilter(layer.id, t)
              toast(`${SMART_FILTER_META[t].label} 적용...`, 'info')
            }}
          >
            <Sparkles size={13} /> {SMART_FILTER_META[t].label}
          </button>
        ))}
        <div className="so-props__hint">필터를 더블클릭하면 값을 다시 편집할 수 있습니다.</div>
      </div>
    </div>
  )
}
