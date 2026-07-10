// PSD Import Engine — 공개 API.
// Parser(순수 데이터)와 Editor(Document/Layer)는 완전히 분리되며,
// layerConverter 가 둘을 잇는 유일한 어댑터다.
export { parsePSD, type ParsePSDOptions } from './psdParser'
export { colorModeLabel } from './headerReader'
export { normalizePsdLayerOrder, type ConvertResult } from './layerConverter'
export { convertBlendKey } from './blendModeConverter'
export { decodePackBits } from './packBits'
export { validateComposite, type CompositeValidation } from './compositeValidator'
export {
  PSDParseError,
  psdErrorMessage,
  PSD_STAGE_LABELS,
  type PSDFile,
  type PSDHeader,
  type PSDColorMode,
  type PSDBitDepth,
  type PSDImportStage,
  type PSDProgress,
  type PSDProgressCallback,
  type PSDErrorKind,
} from './types'
