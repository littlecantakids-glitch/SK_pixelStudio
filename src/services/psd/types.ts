// PSD Parser 공용 타입 — Adobe Photoshop File Format Specification 기준.
// Parser 는 Editor 와 완전히 분리된 독립 모듈이다. Editor 타입(Layer/OpenDocument)을
// 절대 import 하지 않으며, 순수한 PSD 구조 데이터만 반환한다.

/** PSD Color Mode 코드 (Header 24~25 byte) — Photoshop 사양 */
export const PSD_COLOR_MODE_NAMES: Record<number, PSDColorMode> = {
  0: 'bitmap',
  1: 'grayscale',
  2: 'indexed',
  3: 'rgb',
  4: 'cmyk',
  7: 'multichannel',
  8: 'duotone',
  9: 'lab',
}

export type PSDColorMode =
  | 'bitmap'
  | 'grayscale'
  | 'indexed'
  | 'rgb'
  | 'cmyk'
  | 'multichannel'
  | 'duotone'
  | 'lab'

/** PSD Bit Depth — 이번 작업은 8bit 만 지원, 16/32bit 는 구조만 준비 */
export type PSDBitDepth = 1 | 8 | 16 | 32

/** PSD File Header (26 bytes) — 모든 필드는 Big-Endian */
export type PSDHeader = {
  /** '8BPS' */
  signature: string
  /** 1 = PSD, 2 = PSB */
  version: number
  /** version === 2 (PSB) — 현재 미지원, 구조만 준비 */
  isPSB: boolean
  /** 채널 수 (1~56, alpha 포함) */
  channels: number
  width: number
  height: number
  /** 채널당 비트 수 (1/8/16/32) */
  depth: PSDBitDepth
  /** Color Mode 원본 코드 (0~9) */
  colorModeId: number
  colorMode: PSDColorMode
}

/**
 * Color Mode Data Section.
 * Indexed → 768 byte RGB 팔레트, Duotone → 사양 데이터. RGB 등은 길이 0.
 * 팔레트/원본을 보존해 향후 Indexed/Duotone 렌더 확장에 사용한다.
 */
export type PSDColorModeData = {
  length: number
  /** Indexed 모드 팔레트 (256 * RGB planar) */
  indexedPalette: Uint8Array | null
  /** Duotone 등 원본 데이터 (향후 확장용 보존) */
  raw: Uint8Array | null
}

/** Image Resource Block (8BIM) — 위치만 기록해 향후 Reader 확장이 재파싱 가능하게 한다 */
export type PSDResourceBlock = {
  id: number
  name: string
  /** 전체 버퍼 기준 데이터 시작 오프셋 */
  dataStart: number
  dataLength: number
}

/** Resource 1005 — ResolutionInfo */
export type PSDResolutionInfo = {
  /** 가로 해상도 (pixels per inch 로 환산된 값) */
  hDpi: number
  vDpi: number
}

export type PSDImageResources = {
  blocks: PSDResourceBlock[]
  /** Resource 1005 에서 읽은 해상도. 없으면 null (기본 72dpi 처리) */
  resolution: PSDResolutionInfo | null
}

/** Layer Channel Record — id 는 0=R, 1=G, 2=B, -1=Alpha, -2=Mask, -3=Real Mask */
export type PSDChannelInfo = {
  id: number
  /** compression(2byte) 를 포함한 채널 데이터 길이 */
  length: number
}

/** Section Divider (lsct/lsdk) 타입 — 0=일반, 1=열린 그룹, 2=닫힌 그룹, 3=그룹 경계 */
export type PSDSectionType = 0 | 1 | 2 | 3

/** Additional Layer Info 로 판별한 원본 레이어 종류 */
export type PSDLayerKind =
  | 'raster'
  | 'text'
  | 'shape'
  | 'smartObject'
  | 'adjustment'
  | 'fill'

/** PSD Layer 잠금 플래그 (lspf) — Full Lock 외에는 구조만 준비 */
export type PSDLockFlags = {
  transparency: boolean
  composite: boolean
  position: boolean
  /** 세 플래그 모두 또는 0x80000000 → 전체 잠금 */
  all: boolean
}

/**
 * Smart Object / Placed Layer 변형 정보 (plLd / SoLd / SoLE / PlLd).
 * quad 는 문서 좌표의 4모서리 [x0,y0, x1,y1, x2,y2, x3,y3] (좌상→우상→우하→좌하).
 * quad 가 Layer Bounds 사각형과 다르면 Scale/Rotate/Perspective 변형이 있다는 뜻 —
 * 이때 채널 픽셀은 원본(미변형) 비트맵일 수 있으므로 Composite Pixel 을 사용해야 한다.
 */
export type PSDSmartTransform = {
  /** 발견된 블록 키 (plLd / SoLd / SoLE / PlLd) */
  sourceKey: string
  /** Transform 4모서리 (8 doubles). 블록에 없으면 null */
  quad: number[] | null
  /** Warp 존재 (warpStyle ≠ warpNone 또는 quiltWarp) */
  warped: boolean
}

/** Layer Record — Layer & Mask Info Section 의 레이어 하나 (메타데이터) */
export type PSDLayerRecord = {
  /** 파일 내 레코드 순서 (0 = 최하단 레이어) */
  index: number
  top: number
  left: number
  bottom: number
  right: number
  width: number
  height: number
  channels: PSDChannelInfo[]
  blendKey: string
  /** 0~255 */
  opacity: number
  /** true = 아래 레이어에 클리핑 (렌더링은 후속 작업, 데이터 보존) */
  clipping: boolean
  flags: number
  visible: boolean
  /** 이름 — luni(Unicode) 우선, 없으면 Pascal, 없으면 "Layer N" */
  name: string
  /** Section Divider 타입 (그룹 구조 복원용) */
  sectionType: PSDSectionType
  /** 그룹의 Blend Key (lsct, pass = Pass Through — 구조 준비) */
  sectionBlendKey: string | null
  /** lspf 잠금 플래그 */
  lock: PSDLockFlags
  /** Additional Layer Info 키 목록 (향후 Text/Shape/SO/Mask 복원용 보존) */
  infoKeys: string[]
  /** infoKeys 기반 원본 레이어 종류 판별 */
  kind: PSDLayerKind
  /** Smart Object / Placed Layer 변형 정보 (없으면 null) */
  smartTransform: PSDSmartTransform | null
}

/** 채널 디코딩까지 끝난 레이어 하나 */
export type PSDLayerImage = {
  record: PSDLayerRecord
  /** Bounds 크기의 RGBA 캔버스. 픽셀이 없거나(그룹/빈 레이어) 실패 시 null */
  canvas: HTMLCanvasElement | null
  /** 이 레이어의 채널 디코딩 실패 사유 (전체 Import 는 계속 진행) */
  error: string | null
}

/**
 * Layer & Mask Info Section 파싱 결과.
 * layers 는 파일 기록 순서(최하단 → 최상단) 그대로다.
 */
export type PSDLayerMaskInfo = {
  /** 섹션 전체 길이 (bytes) */
  sectionLength: number
  /** 레이어 수 (절대값) */
  layerCount: number
  /**
   * Layer Count 가 음수였는지 — 음수면 첫 alpha 채널이 Composite 의
   * 투명도(transparency)를 담는다는 Photoshop 사양 플래그
   */
  hasTransparency: boolean
  /** 디코딩된 레이어 목록 (bottom → top). 빈 배열이면 Composite 만 사용 */
  layers: PSDLayerImage[]
  /** 채널 디코딩에 실패한 레이어 수 */
  failedCount: number
  /** Import 경고 (알 수 없는 Blend Mode, Fallback 등) */
  warnings: string[]
}

/** Composite Image Data 압축 방식 */
export type PSDCompression = 'raw' | 'rle' | 'zip' | 'zip-prediction'

export const PSD_COMPRESSION_NAMES: Record<number, PSDCompression> = {
  0: 'raw',
  1: 'rle',
  2: 'zip',
  3: 'zip-prediction',
}

/** 디코딩된 Composite Image */
export type PSDComposite = {
  compression: PSDCompression
  /** RGBA 로 변환 완료된 캔버스 (Document 크기) */
  canvas: HTMLCanvasElement
}

/** 파싱 완료된 PSD 파일 전체 */
export type PSDFile = {
  header: PSDHeader
  colorModeData: PSDColorModeData
  resources: PSDImageResources
  layerMaskInfo: PSDLayerMaskInfo
  composite: PSDComposite
  /** ResolutionInfo 기반 DPI (없으면 72) */
  dpi: number
}

/* ============================================================
   Error
   ============================================================ */

export type PSDErrorKind =
  | 'invalidSignature'
  | 'invalidVersion'
  | 'psbUnsupported'
  | 'unsupportedColorMode'
  | 'unsupportedBitDepth'
  | 'unsupportedCompression'
  | 'corrupted'
  | 'unexpectedEOF'
  | 'tooLarge'
  | 'aborted'

export class PSDParseError extends Error {
  constructor(
    public kind: PSDErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'PSDParseError'
  }
}

/** 사용자에게 보여줄 오류 메시지 (Photoshop 스타일 문구) */
export function psdErrorMessage(e: unknown): string {
  if (e instanceof PSDParseError) {
    switch (e.kind) {
      case 'invalidSignature':
        return '유효한 Photoshop 문서가 아니기 때문에 요청을 완료할 수 없습니다.'
      case 'invalidVersion':
        return '지원하지 않는 Photoshop 문서 버전이기 때문에 요청을 완료할 수 없습니다.'
      case 'psbUnsupported':
        return 'PSB(대용량 문서) 형식은 아직 지원되지 않습니다.'
      case 'unsupportedColorMode':
        return `지원하지 않는 색상 모드이기 때문에 요청을 완료할 수 없습니다. (${e.message}) 현재 RGB 모드만 지원합니다.`
      case 'unsupportedBitDepth':
        return `지원하지 않는 비트 심도이기 때문에 요청을 완료할 수 없습니다. (${e.message}) 현재 8비트/채널만 지원합니다.`
      case 'unsupportedCompression':
        return `지원하지 않는 압축 방식이기 때문에 요청을 완료할 수 없습니다. (${e.message})`
      case 'unexpectedEOF':
        return '파일이 예기치 않게 끝났습니다. 문서가 손상된 것 같습니다.'
      case 'tooLarge':
        return '문서 크기가 너무 커서 열 수 없습니다.'
      case 'aborted':
        return '가져오기가 취소되었습니다.'
      case 'corrupted':
      default:
        return '문서가 손상되어 요청을 완료할 수 없습니다.'
    }
  }
  return '파일을 여는 동안 알 수 없는 오류가 발생했습니다.'
}

/* ============================================================
   Import Progress
   ============================================================ */

export type PSDImportStage =
  | 'header'
  | 'colorMode'
  | 'resources'
  | 'layerRecords'
  | 'channels'
  | 'bitmaps'
  | 'groups'
  | 'composite'
  | 'document'
  | 'verify'

export const PSD_STAGE_LABELS: Record<PSDImportStage, string> = {
  header: 'PSD 헤더 읽는 중…',
  colorMode: '색상 모드 데이터 읽는 중…',
  resources: '이미지 리소스 읽는 중…',
  layerRecords: '레이어 레코드 읽는 중…',
  channels: '채널 압축 해제 중…',
  bitmaps: '레이어 비트맵 생성 중…',
  groups: '그룹 구조 복원 중…',
  composite: '합성 이미지 읽는 중…',
  document: '문서 만드는 중…',
  verify: '렌더 결과 확인 중…',
}

export type PSDProgress = {
  stage: PSDImportStage
  label: string
  /** 0~100 */
  percent: number
}

export type PSDProgressCallback = (progress: PSDProgress) => void
