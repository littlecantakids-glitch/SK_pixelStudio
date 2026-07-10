// PSD Blend Mode Key(4-byte) → 내부 BlendMode 변환.
// Adobe Photoshop File Format 사양의 실제 키 기준 (공백 포함 4글자 주의).
// Canvas 합성으로 표현 불가능한 모드는 normal 로 fallback 하고 경고를 기록한다.
import type { BlendMode } from '../../types'

/** Canvas 로 정확/근사 표현 가능한 모드 */
const PSD_BLEND_MAP: Record<string, BlendMode> = {
  norm: 'normal',
  dark: 'darken',
  'mul ': 'multiply',
  idiv: 'colorBurn', // Color Burn
  lite: 'lighten',
  scrn: 'screen',
  'div ': 'colorDodge', // Color Dodge
  lddg: 'linearDodge', // Linear Dodge(Add) → canvas 'lighter'
  over: 'overlay',
  sLit: 'softLight',
  hLit: 'hardLight',
  diff: 'difference',
  smud: 'exclusion', // Exclusion (주의: softLight 아님)
  'hue ': 'hue',
  'sat ': 'saturation',
  colr: 'color',
  'lum ': 'luminosity',
}

/** Canvas 미지원 — normal fallback + 경고 대상 (한국어 라벨) */
const UNSUPPORTED_LABELS: Record<string, string> = {
  pass: '통과(Pass Through)',
  diss: '디졸브',
  lbrn: '선형 번',
  dkCl: '어두운 색상',
  lgCl: '밝은 색상',
  vLit: '선명한 라이트',
  lLit: '선형 라이트',
  pLit: '핀 라이트',
  hMix: '하드 혼합',
  fsub: '빼기',
  fdiv: '나누기',
}

export type BlendConversion = {
  mode: BlendMode
  /** fallback 발생 시 경고 문구 (없으면 정확 변환) */
  warning: string | null
}

export function convertBlendKey(key: string, layerName: string): BlendConversion {
  const mapped = PSD_BLEND_MAP[key]
  if (mapped) return { mode: mapped, warning: null }

  const label = UNSUPPORTED_LABELS[key]
  return {
    mode: 'normal',
    warning: label
      ? `"${layerName}": 지원하지 않는 혼합 모드 '${label}' → 표준으로 대체`
      : `"${layerName}": 알 수 없는 혼합 모드 '${key.trim()}' → 표준으로 대체`,
  }
}

/** Pass Through 그룹인지 (구조 준비 — 현재 그룹은 렌더에서 통과 취급) */
export function isPassThrough(key: string | null): boolean {
  return key === 'pass'
}
