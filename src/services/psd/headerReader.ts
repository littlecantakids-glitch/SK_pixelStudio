// Header Reader — PSD File Header Section (26 bytes) 파싱 및 검증.
// Signature/Version/Reserved/Channels/Height/Width/Depth/ColorMode 순서 (Big-Endian).
import { ByteReader } from './byteReader'
import {
  PSD_COLOR_MODE_NAMES,
  PSDParseError,
  type PSDBitDepth,
  type PSDHeader,
} from './types'

/** Photoshop PSD 규격 한계 (PSB 는 300,000) */
const PSD_MAX_DIMENSION = 30000
/** 메모리 보호 한계 — fileReader.MAX_DIMENSION 과 동일 기준 */
const SAFE_MAX_DIMENSION = 30000
const VALID_DEPTHS: PSDBitDepth[] = [1, 8, 16, 32]

export function readHeader(r: ByteReader): PSDHeader {
  const signature = r.ascii(4)
  if (signature !== '8BPS') {
    throw new PSDParseError(
      'invalidSignature',
      `잘못된 시그니처: "${signature}" (기대값 "8BPS")`,
    )
  }

  const version = r.u16()
  if (version !== 1 && version !== 2) {
    throw new PSDParseError('invalidVersion', `잘못된 버전: ${version}`)
  }
  const isPSB = version === 2

  // Reserved 6 bytes — 반드시 0 (아니면 손상 파일로 판정)
  const reserved = r.bytesView(6)
  for (let i = 0; i < 6; i++) {
    if (reserved[i] !== 0) {
      throw new PSDParseError('corrupted', 'Reserved 영역이 0이 아닙니다')
    }
  }

  const channels = r.u16()
  if (channels < 1 || channels > 56) {
    throw new PSDParseError('corrupted', `잘못된 채널 수: ${channels}`)
  }

  const height = r.u32()
  const width = r.u32()
  const maxDim = isPSB ? 300000 : PSD_MAX_DIMENSION
  if (width < 1 || height < 1 || width > maxDim || height > maxDim) {
    throw new PSDParseError('corrupted', `잘못된 크기: ${width}×${height}`)
  }
  if (width > SAFE_MAX_DIMENSION || height > SAFE_MAX_DIMENSION) {
    throw new PSDParseError('tooLarge', `${width}×${height}`)
  }

  const depth = r.u16()
  if (!VALID_DEPTHS.includes(depth as PSDBitDepth)) {
    throw new PSDParseError('corrupted', `잘못된 비트 심도: ${depth}`)
  }

  const colorModeId = r.u16()
  const colorMode = PSD_COLOR_MODE_NAMES[colorModeId]
  if (!colorMode) {
    throw new PSDParseError('corrupted', `잘못된 색상 모드 코드: ${colorModeId}`)
  }

  return {
    signature,
    version,
    isPSB,
    channels,
    width,
    height,
    depth: depth as PSDBitDepth,
    colorModeId,
    colorMode,
  }
}

/**
 * 현재 엔진이 실제로 열 수 있는지 검증.
 * PSB / RGB 외 모드 / 8bit 외 심도는 구조만 준비 — 명확한 오류로 안내한다.
 */
export function assertSupported(header: PSDHeader): void {
  if (header.isPSB) {
    throw new PSDParseError('psbUnsupported', 'PSB (version 2)')
  }
  if (header.colorMode !== 'rgb') {
    throw new PSDParseError('unsupportedColorMode', colorModeLabel(header.colorMode))
  }
  if (header.depth !== 8) {
    throw new PSDParseError('unsupportedBitDepth', `${header.depth}비트/채널`)
  }
}

export function colorModeLabel(mode: PSDHeader['colorMode']): string {
  switch (mode) {
    case 'bitmap':
      return '비트맵'
    case 'grayscale':
      return '회색 음영'
    case 'indexed':
      return '인덱스 색상'
    case 'rgb':
      return 'RGB 색상'
    case 'cmyk':
      return 'CMYK 색상'
    case 'multichannel':
      return '다중 채널'
    case 'duotone':
      return '이중톤'
    case 'lab':
      return 'Lab 색상'
  }
}
