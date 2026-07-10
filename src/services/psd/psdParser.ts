// PSDParser — 각 Reader 를 순서대로 실행하는 오케스트레이터.
//
//   PSDParser
//   ├── HeaderReader        (26 byte 헤더 파싱 + 검증)
//   ├── ColorModeReader     (팔레트/듀오톤 데이터)
//   ├── ImageResourceReader (8BIM 블록 + ResolutionInfo → DPI)
//   ├── LayerMaskReader     (Layer Records + Channel Data → 레이어 비트맵)
//   │   ├── LayerRecordReader
//   │   └── ChannelDataReader (Raw / RLE·PackBits)
//   └── CompositeReader     (병합 이미지 → RGBA Canvas)
//
// Parser 는 Editor 와 완전히 분리되어 있으며 PSDFile(순수 데이터)만 반환한다.
// Document/Layer 생성은 호출 측(layerConverter + openStore)이 담당한다.
// 순수 함수 구성이므로 향후 Worker 로 그대로 이전할 수 있다. AbortSignal 로 취소 가능.
import { ByteReader } from './byteReader'
import { assertSupported, readHeader } from './headerReader'
import { readColorModeData } from './colorModeReader'
import { readImageResources } from './imageResourceReader'
import { readLayerMaskInfo } from './layerMaskReader'
import { readComposite } from './compositeReader'
import {
  PSD_STAGE_LABELS,
  PSDParseError,
  type PSDFile,
  type PSDImportStage,
  type PSDProgressCallback,
} from './types'

/** 진행률 구간 배분 */
const P = {
  header: [0, 5],
  records: [12, 18],
  channels: [18, 60],
  composite: [62, 90],
} as const

export type ParsePSDOptions = {
  onProgress?: PSDProgressCallback
  /** Import 취소 (구조 준비 — UI 연결은 후속) */
  signal?: AbortSignal
}

export async function parsePSD(
  buffer: ArrayBuffer,
  options: ParsePSDOptions | PSDProgressCallback = {},
): Promise<PSDFile> {
  // 하위 호환 — 027.1 의 (buffer, onProgress) 시그니처 허용
  const opts: ParsePSDOptions =
    typeof options === 'function' ? { onProgress: options } : options
  const { onProgress, signal } = opts

  const report = (stage: PSDImportStage, percent: number, label?: string) =>
    onProgress?.({
      stage,
      label: label ?? PSD_STAGE_LABELS[stage],
      percent: Math.round(percent),
    })

  const r = new ByteReader(buffer)

  try {
    // 1) Header — 서명/버전/크기 검증. 실패 시 즉시 Import 중단
    report('header', P.header[0])
    const header = readHeader(r)
    assertSupported(header)
    report('header', P.header[1])

    // 2) Color Mode Data
    report('colorMode', 6)
    const colorModeData = readColorModeData(r, header)

    // 3) Image Resources — DPI(ResolutionInfo) 추출
    report('resources', 8)
    const resources = readImageResources(r)
    report('resources', 12)

    // 4) Layer & Mask Info — Layer Records + Channel Data + 레이어 비트맵
    report('layerRecords', P.records[0])
    const layerMaskInfo = await readLayerMaskInfo(
      r,
      (p) => {
        if (p.phase === 'records') {
          const pct = P.records[0] + ((P.records[1] - P.records[0]) * p.done) / p.total
          report('layerRecords', pct, `${PSD_STAGE_LABELS.layerRecords} ${p.done} / ${p.total}`)
        } else if (p.phase === 'channels') {
          const pct = P.channels[0] + ((P.channels[1] - P.channels[0]) * p.done) / Math.max(1, p.total)
          report('channels', pct, `${PSD_STAGE_LABELS.channels} ${p.done} / ${p.total}`)
        } else {
          report('bitmaps', P.channels[1], `${PSD_STAGE_LABELS.bitmaps} ${p.done} / ${p.total}`)
        }
      },
      signal,
    )

    // 5) Composite Image — 행 단위 진행률
    report('composite', P.composite[0])
    const composite = await readComposite(
      r,
      header,
      layerMaskInfo.hasTransparency,
      (done, total) => {
        if (signal?.aborted) {
          throw new PSDParseError('aborted', '사용자가 가져오기를 취소했습니다')
        }
        const pct =
          P.composite[0] + ((P.composite[1] - P.composite[0]) * done) / Math.max(1, total)
        report('composite', Math.min(P.composite[1], pct))
      },
    )

    // 6) Group 구조 복원/Document 빌드는 호출 측 담당 — 단계 신호만 보낸다
    report('groups', 92)

    return {
      header,
      colorModeData,
      resources,
      layerMaskInfo,
      composite,
      dpi: resources.resolution?.hDpi ?? 72,
    }
  } catch (e) {
    if (e instanceof PSDParseError) throw e
    // RangeError 등 예기치 못한 저수준 오류 → 손상 파일로 정규화
    throw new PSDParseError(
      'corrupted',
      e instanceof Error ? e.message : '알 수 없는 파싱 오류',
    )
  }
}
