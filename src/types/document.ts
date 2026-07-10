// New Document 관련 타입 및 단위 변환 유틸

export type LengthUnit = 'px' | 'in' | 'cm' | 'mm' | 'pt' | 'pc' | 'columns'
export type ResolutionUnit = 'ppi' | 'ppcm'
export type Orientation = 'landscape' | 'portrait'
export type ColorMode = 'Bitmap' | 'Grayscale' | 'RGB' | 'CMYK' | 'Lab' | 'Multichannel'
export type BitDepth = 8 | 16 | 32
export type BackgroundKind = 'white' | 'black' | 'transparent' | 'custom'

export type DocumentPreset = {
  id: string
  name: string
  width: number // px 기준 저장
  height: number // px 기준 저장
  unit: LengthUnit
  resolution: number // 항상 ppi 로 저장
  resolutionUnit: ResolutionUnit
  orientation: Orientation
  artboard: boolean
  colorMode: ColorMode
  bitDepth: BitDepth
  background: BackgroundKind
  backgroundColor?: string
  colorProfile: string
  pixelAspectRatio: string
}

export const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
  { value: 'px', label: '픽셀' },
  { value: 'in', label: '인치' },
  { value: 'cm', label: '센티미터' },
  { value: 'mm', label: '밀리미터' },
  { value: 'pt', label: '포인트' },
  { value: 'pc', label: '파이카' },
  { value: 'columns', label: '단(Column)' },
]

export const RESOLUTION_UNITS: { value: ResolutionUnit; label: string }[] = [
  { value: 'ppi', label: '픽셀/인치' },
  { value: 'ppcm', label: '픽셀/센티미터' },
]

export const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'Bitmap', label: '비트맵' },
  { value: 'Grayscale', label: '회색 음영' },
  { value: 'RGB', label: 'RGB 색상' },
  { value: 'CMYK', label: 'CMYK 색상' },
  { value: 'Lab', label: 'Lab 색상' },
  { value: 'Multichannel', label: '다중 채널' },
]

export const BIT_DEPTHS: { value: BitDepth; label: string }[] = [
  { value: 8, label: '8 bit' },
  { value: 16, label: '16 bit' },
  { value: 32, label: '32 bit' },
]

export const BACKGROUNDS: { value: BackgroundKind; label: string }[] = [
  { value: 'white', label: '흰색' },
  { value: 'black', label: '검정' },
  { value: 'transparent', label: '투명' },
  { value: 'custom', label: '사용자 정의 색상' },
]

const COLUMN_POINTS = 180 // Photoshop 기본 단 폭(포인트)

/** 해당 단위 1개당 픽셀 수 (해상도 의존) */
export function unitPixels(unit: LengthUnit, resolution: number): number {
  switch (unit) {
    case 'px':
      return 1
    case 'in':
      return resolution
    case 'cm':
      return resolution / 2.54
    case 'mm':
      return resolution / 25.4
    case 'pt':
      return resolution / 72
    case 'pc':
      return resolution / 6
    case 'columns':
      return (COLUMN_POINTS * resolution) / 72
  }
}

export function toPixels(value: number, unit: LengthUnit, resolution: number): number {
  return value * unitPixels(unit, resolution)
}

export function fromPixels(px: number, unit: LengthUnit, resolution: number): number {
  const v = px / unitPixels(unit, resolution)
  return unit === 'px' ? Math.round(v) : Math.round(v * 1000) / 1000
}

/** 해상도 단위 변환 (ppi 저장값 ↔ 표시값) */
export function resolutionToDisplay(ppi: number, unit: ResolutionUnit): number {
  return unit === 'ppi' ? ppi : Math.round((ppi / 2.54) * 100) / 100
}

export function resolutionToPpi(value: number, unit: ResolutionUnit): number {
  return unit === 'ppi' ? value : Math.round(value * 2.54 * 100) / 100
}

export const BACKGROUND_HEX: Record<Exclude<BackgroundKind, 'custom'>, string> = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
}
