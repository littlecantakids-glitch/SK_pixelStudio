// Blend Mode 공유 정의 — RenderEngine / SmartEngine / SmartFilter / Clone / Export /
// LayersPanel 이 모두 이 테이블을 사용한다. BlendMode 추가 시 여기만 수정하면 된다.
import type { BlendMode } from '../types'

/** BlendMode → Canvas GlobalCompositeOperation */
export const BLEND_OP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  darken: 'darken',
  multiply: 'multiply',
  colorBurn: 'color-burn',
  lighten: 'lighten',
  screen: 'screen',
  colorDodge: 'color-dodge',
  // Linear Dodge(Add) — Canvas 'lighter'(가산 합성)와 동일 계산
  linearDodge: 'lighter',
  overlay: 'overlay',
  softLight: 'soft-light',
  hardLight: 'hard-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
}

/** Photoshop 한국어 UI 라벨 (Layer Panel 드롭다운 순서) */
export const BLEND_LABELS: Record<BlendMode, string> = {
  normal: '표준',
  darken: '어둡게 하기',
  multiply: '곱하기',
  colorBurn: '색상 번',
  lighten: '밝게 하기',
  screen: '스크린',
  colorDodge: '색상 닷지',
  linearDodge: '선형 닷지(추가)',
  overlay: '오버레이',
  softLight: '소프트 라이트',
  hardLight: '하드 라이트',
  difference: '차이',
  exclusion: '제외',
  hue: '색조',
  saturation: '채도',
  color: '색상',
  luminosity: '광도',
}
