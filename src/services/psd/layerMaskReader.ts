// Layer & Mask Info Section Reader.
//
//   Layer and Mask Information Section
//   ├── Layer Info (Layer Count / Layer Records / Channel Image Data)
//   ├── Global Layer Mask Info      → skip (offset 보존)
//   └── Additional Layer Information → skip (Lr16/Lr32 등은 16/32bit 전용)
//
// 개별 레이어의 채널 디코딩 실패는 해당 레이어만 error 로 격리하고
// 전체 Import 를 계속 진행한다. Channel Record 의 length 기반으로 offset 을
// 전진시키므로 실패한 레이어가 있어도 이후 레이어 정렬이 깨지지 않는다.
import { ByteReader } from './byteReader'
import { readLayerRecord } from './layerRecordReader'
import { composeRGBA, readLayerChannels } from './channelDataReader'
import {
  PSDParseError,
  type PSDLayerImage,
  type PSDLayerMaskInfo,
  type PSDLayerRecord,
} from './types'

const MAX_LAYERS = 10000
/** 이 채널 수마다 이벤트 루프에 양보 */
const YIELD_CHANNELS = 8

export type LayerProgress = {
  /** 'records' | 'channels' | 'bitmaps' */
  phase: 'records' | 'channels' | 'bitmaps'
  done: number
  total: number
}

export async function readLayerMaskInfo(
  r: ByteReader,
  onProgress?: (p: LayerProgress) => void,
  signal?: AbortSignal,
): Promise<PSDLayerMaskInfo> {
  // 섹션 전체 길이 (PSD: 4 bytes)
  const sectionLength = r.u32()
  if (sectionLength > r.remaining) {
    throw new PSDParseError('unexpectedEOF', 'Layer & Mask Info 섹션이 잘렸습니다')
  }
  const sectionEnd = r.offset + sectionLength

  const empty: PSDLayerMaskInfo = {
    sectionLength,
    layerCount: 0,
    hasTransparency: false,
    layers: [],
    failedCount: 0,
    warnings: [],
  }

  if (sectionLength < 6) {
    r.seek(sectionEnd)
    return empty
  }

  // ── Layer Info ──
  const layerInfoLength = r.u32()
  const layerInfoEnd = r.offset + layerInfoLength
  if (layerInfoLength < 2 || layerInfoEnd > sectionEnd) {
    r.seek(sectionEnd)
    return empty
  }

  const rawCount = r.i16()
  const hasTransparency = rawCount < 0
  const layerCount = Math.abs(rawCount)
  if (layerCount > MAX_LAYERS) {
    throw new PSDParseError('corrupted', `잘못된 레이어 수: ${layerCount}`)
  }
  if (layerCount === 0) {
    r.seek(sectionEnd)
    return { ...empty, hasTransparency }
  }

  // ── 1) Layer Records (bottom → top) ──
  // 레코드 하나가 손상되면 이후 offset 을 복구할 수 없다. 다만 섹션 끝(sectionEnd)은
  // 알고 있으므로 레이어 전체를 포기하고 Composite Fallback 으로 전환할 수 있게
  // 빈 결과 + 경고로 반환한다 (전체 Import 실패 금지).
  const records: PSDLayerRecord[] = []
  try {
    for (let i = 0; i < layerCount; i++) {
      throwIfAborted(signal)
      records.push(readLayerRecord(r, i))
      onProgress?.({ phase: 'records', done: i + 1, total: layerCount })
    }
  } catch (e) {
    if (e instanceof PSDParseError && e.kind === 'aborted') throw e
    r.seek(sectionEnd)
    return {
      ...empty,
      layerCount,
      hasTransparency,
      failedCount: layerCount,
      warnings: [
        e instanceof PSDParseError ? e.message : '레이어 레코드가 손상되었습니다',
      ],
    }
  }

  // ── 2) Channel Image Data (레코드와 같은 순서) ──
  const warnings: string[] = []
  const layers: PSDLayerImage[] = []
  let failedCount = 0
  const totalChannels = records.reduce((n, rec) => n + rec.channels.length, 0)
  let doneChannels = 0

  for (const record of records) {
    throwIfAborted(signal)
    let canvas: HTMLCanvasElement | null = null
    let error: string | null = null

    if (record.sectionType !== 0) {
      // 그룹 헤더/경계 레코드 — 픽셀 없음, 채널 데이터만 소비
      try {
        readLayerChannels(r, record)
      } catch {
        /* 그룹 레코드의 더미 채널 오류는 무시 */
      }
    } else {
      try {
        const { planes } = readLayerChannels(r, record)
        // ── 3) Bitmap 생성 ──
        canvas = composeRGBA(record, planes)
        onProgress?.({
          phase: 'bitmaps',
          done: layers.filter((l) => l.canvas).length + (canvas ? 1 : 0),
          total: layerCount,
        })
      } catch (e) {
        failedCount++
        error =
          e instanceof PSDParseError
            ? e.message
            : `레이어 "${record.name}" 채널 디코딩 실패`
        warnings.push(error)
      }
    }

    doneChannels += record.channels.length
    onProgress?.({ phase: 'channels', done: doneChannels, total: totalChannels })
    if (doneChannels % YIELD_CHANNELS === 0) await yieldToUI()

    layers.push({ record, canvas, error })
  }

  // Layer Info padding + Global Layer Mask Info + Additional Layer Information
  // → 이번 작업 범위 밖. 섹션 끝으로 이동 (offset 보존)
  r.seek(sectionEnd)

  return { sectionLength, layerCount, hasTransparency, layers, failedCount, warnings }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PSDParseError('aborted', '사용자가 가져오기를 취소했습니다')
  }
}

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
