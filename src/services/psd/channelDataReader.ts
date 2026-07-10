// Channel Data Reader — Layer Record 순서대로 이어지는 Channel Image Data 를 디코딩한다.
// 각 채널은 자체 compression(2byte) + 데이터로 구성되며, Channel Record 의 length 로
// 정확히 offset 을 전진시킨다 → 한 채널이 실패해도 다음 레이어 정렬이 깨지지 않는다.
// R/G/B/Alpha(-1) 만 복원하고 Mask(-2/-3) 는 소비만 한다 (Task 027.3).
import { ByteReader } from './byteReader'
import { decodePackBits } from './packBits'
import { PSDParseError, type PSDLayerRecord } from './types'

/** 이번 작업에서 픽셀로 복원하는 채널 */
const USED_CHANNEL_IDS = [0, 1, 2, -1]

export type DecodedChannels = {
  /** channel id → Bounds 크기 평면 데이터 (8bit) */
  planes: Map<number, Uint8Array>
}

/**
 * 레이어 하나의 모든 채널 데이터를 소비하고, 사용 채널만 디코딩해 반환한다.
 * 개별 채널 오류는 PSDParseError 로 던진다 — 호출 측이 레이어 단위로 격리한다.
 */
export function readLayerChannels(
  r: ByteReader,
  record: PSDLayerRecord,
): DecodedChannels {
  const { width, height } = record
  const planes = new Map<number, Uint8Array>()
  let firstError: PSDParseError | null = null

  for (const ch of record.channels) {
    const chEnd = r.offset + ch.length
    if (chEnd > r.length) {
      throw new PSDParseError(
        'unexpectedEOF',
        `레이어 "${record.name}": 채널 ${ch.id} 데이터가 잘렸습니다`,
      )
    }

    const wanted =
      USED_CHANNEL_IDS.includes(ch.id) && width > 0 && height > 0 && ch.length >= 2

    if (!wanted) {
      // Mask(-2/-3)/스팟 채널 또는 빈 레이어 — offset 만 정확히 소비
      r.seek(chEnd)
      continue
    }

    try {
      const compression = r.u16()
      if (compression === 0) {
        planes.set(ch.id, readRawChannel(r, width, height, chEnd))
      } else if (compression === 1) {
        planes.set(ch.id, readRleChannel(r, width, height, chEnd, record.name, ch.id))
      } else if (compression === 2 || compression === 3) {
        // ZIP — 구조만 준비. 레이어 단위 오류로 격리한다 (앱 중단 금지)
        throw new PSDParseError(
          'unsupportedCompression',
          `레이어 "${record.name}": ZIP 압축 채널`,
        )
      } else {
        throw new PSDParseError(
          'corrupted',
          `레이어 "${record.name}": 잘못된 압축 코드 ${compression}`,
        )
      }
    } catch (e) {
      // 채널 하나의 실패로 전체 파싱 정렬이 깨지지 않도록 offset 을 복구하고
      // 첫 오류만 기록해 레이어 단위로 보고한다.
      if (!firstError) {
        firstError =
          e instanceof PSDParseError
            ? e
            : new PSDParseError('corrupted', `레이어 "${record.name}": 채널 ${ch.id} 디코딩 실패`)
      }
    }
    r.seek(chEnd)
  }

  if (firstError) throw firstError
  return { planes }
}

function readRawChannel(
  r: ByteReader,
  width: number,
  height: number,
  chEnd: number,
): Uint8Array {
  const size = width * height
  if (r.offset + size > chEnd) {
    throw new PSDParseError('corrupted', 'Raw 채널 길이가 Bounds 와 일치하지 않습니다')
  }
  // 복사본 생성 — 원본 ArrayBuffer 참조를 오래 붙들지 않는다
  return r.bytesView(size).slice()
}

function readRleChannel(
  r: ByteReader,
  width: number,
  height: number,
  chEnd: number,
  layerName: string,
  channelId: number,
): Uint8Array {
  // 행별 압축 길이 테이블 (PSD: u16 × height)
  if (r.offset + height * 2 > chEnd) {
    throw new PSDParseError('corrupted', `레이어 "${layerName}": RLE 테이블이 잘렸습니다`)
  }
  const rowSizes = new Array<number>(height)
  for (let y = 0; y < height; y++) rowSizes[y] = r.u16()

  const plane = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    if (r.offset + rowSizes[y] > chEnd) {
      throw new PSDParseError(
        'corrupted',
        `레이어 "${layerName}": 채널 ${channelId} 행 ${y} 데이터가 잘렸습니다`,
      )
    }
    const packed = r.bytesView(rowSizes[y])
    const row = decodePackBits(packed, width)
    plane.set(row, y * width)
  }
  return plane
}

/**
 * 디코딩된 채널 평면 → Bounds 크기 RGBA 캔버스.
 * 기본값 R=G=B=0, A=255. Transparency(-1) 채널이 있으면 Alpha 에 적용한다.
 */
export function composeRGBA(
  record: PSDLayerRecord,
  planes: Map<number, Uint8Array>,
): HTMLCanvasElement | null {
  const { width, height } = record
  if (width <= 0 || height <= 0) return null
  if (planes.size === 0) return null

  const rgba = new Uint8ClampedArray(width * height * 4)
  const rPlane = planes.get(0)
  const gPlane = planes.get(1)
  const bPlane = planes.get(2)
  const aPlane = planes.get(-1)

  const size = width * height
  for (let i = 0; i < size; i++) {
    const p = i * 4
    rgba[p] = rPlane ? rPlane[i] : 0
    rgba[p + 1] = gPlane ? gPlane[i] : 0
    rgba[p + 2] = bPlane ? bPlane[i] : 0
    rgba[p + 3] = aPlane ? aPlane[i] : 255
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PSDParseError('tooLarge', '레이어 캔버스를 생성할 수 없습니다')
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
  return canvas
}
