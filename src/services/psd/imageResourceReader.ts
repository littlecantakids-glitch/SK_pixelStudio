// Image Resource Section Reader (기본).
// '8BIM' Resource Block 을 순회하며 목록을 수집하고, Resource 1005(ResolutionInfo)를
// 해석해 DPI 를 얻는다. 나머지 블록은 위치/길이만 기록해 향후 Reader
// (Thumbnail 1036, ICC 1039, Slices, Guides 등)가 재파싱할 수 있게 한다.
import { ByteReader } from './byteReader'
import {
  PSDParseError,
  type PSDImageResources,
  type PSDResolutionInfo,
  type PSDResourceBlock,
} from './types'

const RESOURCE_SIGNATURES = ['8BIM', 'MeSa', 'PHUT', 'AgHg', 'DCSR']
const RESOURCE_ID_RESOLUTION_INFO = 1005

export function readImageResources(r: ByteReader): PSDImageResources {
  const sectionLength = r.u32()
  if (sectionLength > r.remaining) {
    throw new PSDParseError('unexpectedEOF', 'Image Resources 섹션이 잘렸습니다')
  }

  const sectionEnd = r.offset + sectionLength
  const blocks: PSDResourceBlock[] = []
  let resolution: PSDResolutionInfo | null = null

  // 최소 블록 크기: signature(4) + id(2) + name(2) + size(4) = 12
  while (r.offset + 12 <= sectionEnd) {
    const signature = r.ascii(4)
    if (!RESOURCE_SIGNATURES.includes(signature)) {
      throw new PSDParseError(
        'corrupted',
        `잘못된 Resource Block 시그니처: "${signature}"`,
      )
    }
    const id = r.u16()
    const name = r.pascalString(2)
    const dataLength = r.u32()
    const dataStart = r.offset
    if (dataStart + dataLength > sectionEnd) {
      throw new PSDParseError('unexpectedEOF', `Resource ${id} 데이터가 잘렸습니다`)
    }

    blocks.push({ id, name, dataStart, dataLength })

    if (id === RESOURCE_ID_RESOLUTION_INFO && dataLength >= 16) {
      resolution = readResolutionInfo(r)
      r.seek(dataStart) // 판독 후 블록 시작으로 복귀 (아래에서 일괄 skip)
    }

    // 데이터 + 홀수 길이 padding
    r.skip(dataLength + (dataLength % 2))
  }

  r.seek(sectionEnd)
  return { blocks, resolution }
}

/**
 * Resource 1005 — ResolutionInfo 구조체.
 * hRes(Fixed 16.16) + hResUnit(2) + widthUnit(2) + vRes(Fixed) + vResUnit(2) + heightUnit(2)
 * 단위: 1 = pixels/inch, 2 = pixels/cm → DPI 로 환산한다.
 */
function readResolutionInfo(r: ByteReader): PSDResolutionInfo {
  const hRes = r.fixed32()
  const hResUnit = r.u16()
  r.skip(2) // widthUnit (표시 단위 — DPI 계산에는 불필요)
  const vRes = r.fixed32()
  const vResUnit = r.u16()
  r.skip(2) // heightUnit

  const toDpi = (res: number, unit: number) =>
    unit === 2 ? res * 2.54 : res // pixels/cm → pixels/inch

  const hDpi = clampDpi(toDpi(hRes, hResUnit))
  const vDpi = clampDpi(toDpi(vRes, vResUnit))
  return { hDpi, vDpi }
}

function clampDpi(dpi: number): number {
  if (!Number.isFinite(dpi) || dpi <= 0) return 72
  return Math.min(30000, Math.round(dpi * 100) / 100)
}
