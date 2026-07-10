// Color Mode Data Section Reader.
// RGB/Grayscale/CMYK/Lab/Multichannel → 길이 0.
// Indexed → 768 byte 팔레트, Duotone → 사양 정의 데이터.
// 이번 작업(RGB)은 내용을 사용하지 않지만, 팔레트/원본을 보존해
// 향후 Indexed/Duotone 지원이 이 Reader 를 그대로 확장할 수 있게 한다.
import { ByteReader } from './byteReader'
import { PSDParseError, type PSDColorModeData, type PSDHeader } from './types'

export function readColorModeData(r: ByteReader, header: PSDHeader): PSDColorModeData {
  const length = r.u32()
  if (length > r.remaining) {
    throw new PSDParseError('unexpectedEOF', 'Color Mode Data 섹션이 잘렸습니다')
  }

  if (length === 0) {
    return { length, indexedPalette: null, raw: null }
  }

  const raw = r.bytesView(length)

  if (header.colorMode === 'indexed') {
    if (length !== 768) {
      throw new PSDParseError(
        'corrupted',
        `Indexed 팔레트 길이가 768이 아닙니다: ${length}`,
      )
    }
    // 복사해 보존 (원본 버퍼 생명주기와 분리)
    return { length, indexedPalette: raw.slice(), raw: raw.slice() }
  }

  return { length, indexedPalette: null, raw: raw.slice() }
}
