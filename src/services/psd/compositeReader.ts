// Composite Image Data Section Reader.
// PSD 마지막 섹션 — 병합된(Flattened) 이미지를 planar 채널 순서로 담는다.
// RAW(0) / RLE(1, PackBits) 압축을 지원하며, 채널 데이터를 중간 버퍼 없이
// RGBA 버퍼에 직접 기록해 100MB/10000×10000 급 파일에서도 메모리를 아낀다.
// 디코딩 중 주기적으로 이벤트 루프에 양보(yield)해 UI 를 막지 않는다.
import { ByteReader } from './byteReader'
import {
  PSD_COMPRESSION_NAMES,
  PSDParseError,
  type PSDComposite,
  type PSDHeader,
} from './types'

/** 이 행 수마다 이벤트 루프에 양보 (10000px 폭 기준 ≈ 2.5MB 처리 단위) */
const YIELD_ROWS = 256

type RowProgress = (done: number, total: number) => void

export async function readComposite(
  r: ByteReader,
  header: PSDHeader,
  /**
   * Layer Count 가 음수였는지 (Layer & Mask Info) — Photoshop 사양상
   * 이 플래그가 있을 때만 Composite 의 4번째 채널이 투명도(alpha)다.
   * 아니면 저장된 알파/스팟 채널이므로 화면 투명도에 반영하지 않는다.
   */
  hasTransparency: boolean,
  onRow?: RowProgress,
): Promise<PSDComposite> {
  const compressionCode = r.u16()
  const compression = PSD_COMPRESSION_NAMES[compressionCode]
  if (!compression) {
    throw new PSDParseError('corrupted', `잘못된 압축 코드: ${compressionCode}`)
  }
  if (compression === 'zip' || compression === 'zip-prediction') {
    // ZIP 압축 Composite 는 구조만 준비 (16/32bit 문서에서 주로 사용)
    throw new PSDParseError('unsupportedCompression', 'ZIP')
  }

  const { width, height, channels } = header
  const rgba = new Uint8ClampedArray(width * height * 4)
  fillAlphaOpaque(rgba) // 기본 완전 불투명 — alpha 채널이 있으면 디코딩이 덮어쓴다

  const totalRows = channels * height

  if (compression === 'raw') {
    await decodeRaw(r, header, hasTransparency, rgba, onRow, totalRows)
  } else {
    await decodeRLE(r, header, hasTransparency, rgba, onRow, totalRows)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new PSDParseError('tooLarge', '캔버스를 생성할 수 없습니다')
  }
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0)

  return { compression, canvas }
}

/* ============================================================
   채널 → RGBA 매핑
   ============================================================ */

/**
 * planar 채널 인덱스 → RGBA 컴포넌트 오프셋 목록.
 * RGB: 0→R, 1→G, 2→B, (transparency 시) 3→A.
 * Grayscale(구조 준비): 0→R+G+B, (transparency 시) 1→A.
 * 그 외 채널(저장된 알파/스팟)은 null — 데이터는 소비하되 기록하지 않는다.
 * CMYK/Lab 등은 assertSupported 에서 차단되며, 향후 여기에 변환을 추가한다.
 */
function channelComponents(
  header: PSDHeader,
  hasTransparency: boolean,
  channel: number,
): number[] | null {
  switch (header.colorMode) {
    case 'rgb':
      if (channel <= 2) return [channel]
      if (channel === 3 && hasTransparency) return [3]
      return null
    case 'grayscale':
      if (channel === 0) return [0, 1, 2]
      if (channel === 1 && hasTransparency) return [3]
      return null
    default:
      return null
  }
}

function fillAlphaOpaque(rgba: Uint8ClampedArray): void {
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
}

/* ============================================================
   RAW (compression = 0)
   ============================================================ */

async function decodeRaw(
  r: ByteReader,
  header: PSDHeader,
  hasTransparency: boolean,
  rgba: Uint8ClampedArray,
  onRow: RowProgress | undefined,
  totalRows: number,
): Promise<void> {
  const { width, height, channels } = header
  let doneRows = 0

  for (let c = 0; c < channels; c++) {
    const comps = channelComponents(header, hasTransparency, c)
    const plane = r.bytesView(width * height) // 채널당 8bit × W×H

    if (comps) {
      for (let y = 0; y < height; y++) {
        const rowStart = y * width
        for (let x = 0; x < width; x++) {
          const v = plane[rowStart + x]
          const p = (rowStart + x) * 4
          for (const comp of comps) rgba[p + comp] = v
        }
        doneRows++
        if (y % YIELD_ROWS === YIELD_ROWS - 1) {
          onRow?.(doneRows, totalRows)
          await yieldToUI()
        }
      }
    } else {
      doneRows += height
    }
    onRow?.(doneRows, totalRows)
    await yieldToUI()
  }
}

/* ============================================================
   RLE / PackBits (compression = 1)
   ============================================================ */

async function decodeRLE(
  r: ByteReader,
  header: PSDHeader,
  hasTransparency: boolean,
  rgba: Uint8ClampedArray,
  onRow: RowProgress | undefined,
  totalRows: number,
): Promise<void> {
  const { width, height, channels } = header

  // 행별 압축 크기 테이블 — 채널 × 행 (PSD: u16, PSB: u32)
  const rowSizes = new Array<number>(totalRows)
  for (let i = 0; i < totalRows; i++) rowSizes[i] = r.u16()

  for (let c = 0; c < channels; c++) {
    const comps = channelComponents(header, hasTransparency, c)

    for (let y = 0; y < height; y++) {
      const packed = r.bytesView(rowSizes[c * height + y])
      if (comps) {
        unpackBitsRow(packed, rgba, y * width * 4, width, comps)
      }
      const doneRows = c * height + y + 1
      if (y % YIELD_ROWS === YIELD_ROWS - 1 || y === height - 1) {
        onRow?.(doneRows, totalRows)
        if (y % YIELD_ROWS === YIELD_ROWS - 1) await yieldToUI()
      }
    }
    await yieldToUI()
  }
}

/**
 * PackBits 한 행 디코딩 — RGBA 버퍼에 stride 4 로 직접 기록.
 * n ≥ 0: 다음 n+1 byte 복사 / n = -128: 무시 / n < 0: 다음 byte 를 1-n 회 반복.
 * 출력이 행 폭을 넘거나 입력이 모자라면 손상 파일로 판정한다.
 */
function unpackBitsRow(
  packed: Uint8Array,
  rgba: Uint8ClampedArray,
  rowBase: number,
  width: number,
  comps: number[],
): void {
  let src = 0
  let x = 0

  while (x < width) {
    if (src >= packed.length) {
      throw new PSDParseError('corrupted', 'RLE 행 데이터가 모자랍니다')
    }
    const n = packed[src] > 127 ? packed[src] - 256 : packed[src]
    src++

    if (n === -128) continue

    if (n >= 0) {
      const count = n + 1
      if (src + count > packed.length || x + count > width) {
        throw new PSDParseError('corrupted', 'RLE 리터럴이 범위를 벗어났습니다')
      }
      for (let i = 0; i < count; i++, x++) {
        const p = rowBase + x * 4
        const v = packed[src + i]
        for (const comp of comps) rgba[p + comp] = v
      }
      src += count
    } else {
      const count = 1 - n
      if (src >= packed.length || x + count > width) {
        throw new PSDParseError('corrupted', 'RLE 반복이 범위를 벗어났습니다')
      }
      const v = packed[src]
      src++
      for (let i = 0; i < count; i++, x++) {
        const p = rowBase + x * 4
        for (const comp of comps) rgba[p + comp] = v
      }
    }
  }
}

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
