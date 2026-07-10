// PackBits(RLE) Decoder — PSD Layer Channel / Composite 가 공유하는 독립 함수.
// 규칙: n(0~127) → 다음 n+1 byte literal / n(-127~-1) → 다음 1 byte 를 1-n 회 반복 / -128 → no-op
import { PSDParseError } from './types'

/**
 * PackBits 로 압축된 한 행(또는 블록)을 디코딩한다.
 * 결과 길이가 expectedLength 와 다르면 Corrupted Layer Channel 오류.
 */
export function decodePackBits(source: Uint8Array, expectedLength: number): Uint8Array {
  const out = new Uint8Array(expectedLength)
  let src = 0
  let dst = 0

  while (dst < expectedLength) {
    if (src >= source.length) {
      throw new PSDParseError(
        'corrupted',
        `RLE 데이터가 모자랍니다 (기대 ${expectedLength}, 실제 ${dst})`,
      )
    }
    const n = source[src] > 127 ? source[src] - 256 : source[src]
    src++

    if (n === -128) continue

    if (n >= 0) {
      const count = n + 1
      if (src + count > source.length || dst + count > expectedLength) {
        throw new PSDParseError('corrupted', 'RLE 리터럴이 범위를 벗어났습니다')
      }
      out.set(source.subarray(src, src + count), dst)
      src += count
      dst += count
    } else {
      const count = 1 - n
      if (src >= source.length || dst + count > expectedLength) {
        throw new PSDParseError('corrupted', 'RLE 반복이 범위를 벗어났습니다')
      }
      out.fill(source[src], dst, dst + count)
      src++
      dst += count
    }
  }
  return out
}
