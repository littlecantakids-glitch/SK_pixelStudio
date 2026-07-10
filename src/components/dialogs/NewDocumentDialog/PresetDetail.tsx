import { useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import {
  RESOLUTION_UNITS,
  resolutionToDisplay,
  resolutionToPpi,
  type BackgroundKind,
  type BitDepth,
  type ColorMode,
  type LengthUnit,
  type Orientation,
  type ResolutionUnit,
} from '../../../types/document'
import { UnitInput } from './UnitInput'
import { OrientationSelector } from './OrientationSelector'
import { ColorModeSelector } from './ColorModeSelector'
import { BackgroundSelector } from './BackgroundSelector'

export type NewDocForm = {
  name: string
  width: number
  height: number
  unit: LengthUnit
  resolution: number // ppi
  resolutionUnit: ResolutionUnit
  orientation: Orientation
  artboard: boolean
  colorMode: ColorMode
  bitDepth: BitDepth
  background: BackgroundKind
  customColor: string
  colorProfile: string
  pixelAspectRatio: string
}

type Validity = { width: boolean; height: boolean; resolution: boolean }

type Props = {
  form: NewDocForm
  update: (patch: Partial<NewDocForm>) => void
  onUnitChange: (u: LengthUnit) => void
  onOrientationChange: (o: Orientation) => void
  validity: Validity
}

const COLOR_PROFILES = [
  'sRGB IEC61966-2.1',
  'Adobe RGB (1998)',
  'Display P3',
  'ProPhoto RGB',
  '색상 관리 하지 않음',
]

const PIXEL_ASPECTS = [
  '정사각형 픽셀',
  'D1/DV NTSC (0.91)',
  'D1/DV PAL (1.09)',
  '와이드스크린 (1.21)',
  '애너모픽 2:1 (2.0)',
]

export function PresetDetail({
  form,
  update,
  onUnitChange,
  onOrientationChange,
  validity,
}: Props) {
  const [advanced, setAdvanced] = useState(true)

  return (
    <div className="preset-detail">
      <div className="preset-detail__header">
        <span>사전 설정 세부 정보</span>
        <button type="button" className="preset-detail__save" title="사전 설정 저장">
          <Download size={14} />
        </button>
      </div>

      <div className="preset-detail__body">
        {/* Name */}
        <div className="ndf">
          <input
            className="ndf__name"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            aria-label="이름"
          />
        </div>

        {/* Width */}
        <UnitInput
          label="폭"
          value={form.width}
          unit={form.unit}
          onValueChange={(v) => update({ width: v })}
          onUnitChange={onUnitChange}
          invalid={!validity.width}
          min={0}
        />

        {/* Height + Orientation + Artboard */}
        <div className="ndf__hrow">
          <div className="ndf__hrow-height">
            <UnitInput
              label="높이"
              value={form.height}
              showUnit={false}
              onValueChange={(v) => update({ height: v })}
              invalid={!validity.height}
              min={0}
            />
          </div>
          <OrientationSelector
            value={form.orientation}
            artboard={form.artboard}
            onChange={onOrientationChange}
            onArtboardChange={(v) => update({ artboard: v })}
          />
        </div>

        {/* Resolution */}
        <div className="ndf">
          <label className="ndf__label">해상도</label>
          <div className={`ndf__control${validity.resolution ? '' : ' ndf__control--invalid'}`}>
            <input
              type="number"
              className="ndf__input"
              min={0}
              value={resolutionToDisplay(form.resolution, form.resolutionUnit)}
              onChange={(e) =>
                update({
                  resolution: resolutionToPpi(e.target.valueAsNumber, form.resolutionUnit),
                })
              }
            />
            <select
              className="ndf__unit"
              value={form.resolutionUnit}
              onChange={(e) => update({ resolutionUnit: e.target.value as ResolutionUnit })}
            >
              {RESOLUTION_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Color Mode + Bit Depth */}
        <ColorModeSelector
          mode={form.colorMode}
          bitDepth={form.bitDepth}
          onModeChange={(m) => update({ colorMode: m })}
          onBitDepthChange={(b) => update({ bitDepth: b })}
        />

        {/* Background */}
        <BackgroundSelector
          value={form.background}
          customColor={form.customColor}
          onChange={(v) => update({ background: v })}
          onCustomColorChange={(c) => update({ customColor: c })}
        />

        {/* Advanced */}
        <button
          type="button"
          className="preset-detail__advanced-toggle"
          onClick={() => setAdvanced((a) => !a)}
        >
          {advanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          고급 옵션
        </button>

        {advanced && (
          <div className="preset-detail__advanced">
            <div className="ndf">
              <label className="ndf__label">색상 프로필</label>
              <div className="ndf__control">
                <select
                  className="ndf__select ndf__select--grow"
                  value={form.colorProfile}
                  onChange={(e) => update({ colorProfile: e.target.value })}
                >
                  {COLOR_PROFILES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="ndf">
              <label className="ndf__label">픽셀 종횡비</label>
              <div className="ndf__control">
                <select
                  className="ndf__select ndf__select--grow"
                  value={form.pixelAspectRatio}
                  onChange={(e) => update({ pixelAspectRatio: e.target.value })}
                >
                  {PIXEL_ASPECTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
