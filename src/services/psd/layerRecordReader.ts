// Layer Record Reader — Layer & Mask Info Section 의 레이어 레코드 하나를 파싱한다.
// Bounds / Channel Table / Blend / Opacity / Clipping / Flags / Name / Additional Info.
// Mask Data 와 Blending Ranges 는 offset 만 보존하고 건너뛴다 (Mask 복원은 Task 027.3).
import { ByteReader } from './byteReader'
import {
  PSDParseError,
  type PSDChannelInfo,
  type PSDLayerKind,
  type PSDLayerRecord,
  type PSDLockFlags,
  type PSDSectionType,
  type PSDSmartTransform,
} from './types'

/** 레이어 flags — bit1 set = hidden (Photoshop 사양) */
const FLAG_HIDDEN = 0x02

/** Additional Info 키 → 원본 레이어 종류 판별 테이블 */
const KIND_KEYS: Array<[PSDLayerKind, string[]]> = [
  ['text', ['TySh', 'txt2', 'tySh']],
  ['smartObject', ['SoLd', 'SoLE', 'PlLd', 'plLd']],
  ['shape', ['vmsk', 'vsms', 'vscg', 'vstk', 'vogk']],
  [
    'adjustment',
    [
      'brit', 'levl', 'curv', 'expA', 'vibA', 'hue ', 'hue2', 'blnc', 'blwh',
      'phfl', 'mixr', 'clrL', 'nvrt', 'post', 'thrs', 'grdm', 'selc',
    ],
  ],
  ['fill', ['SoCo', 'GdFl', 'PtFl']],
]

function detectKind(infoKeys: string[]): PSDLayerKind {
  for (const [kind, keys] of KIND_KEYS) {
    if (infoKeys.some((k) => keys.includes(k))) return kind
  }
  return 'raster'
}

export function readLayerRecord(r: ByteReader, index: number): PSDLayerRecord {
  const top = r.i32()
  const left = r.i32()
  const bottom = r.i32()
  const right = r.i32()
  // 음수 좌표/문서 밖 배치 허용 — clamp 하지 않는다. 크기 역전만 손상으로 판정.
  const width = right - left
  const height = bottom - top
  if (width < 0 || height < 0 || width > 300000 || height > 300000) {
    throw new PSDParseError(
      'corrupted',
      `레이어 ${index}: 잘못된 Bounds (${left},${top})-(${right},${bottom})`,
    )
  }

  const channelCount = r.u16()
  if (channelCount > 56) {
    throw new PSDParseError('corrupted', `레이어 ${index}: 잘못된 채널 수 ${channelCount}`)
  }
  const channels: PSDChannelInfo[] = []
  for (let i = 0; i < channelCount; i++) {
    const id = r.i16()
    const length = r.u32() // PSB 는 u64 — PSB 는 진입 전 차단됨
    channels.push({ id, length })
  }

  const blendSignature = r.ascii(4)
  if (blendSignature !== '8BIM') {
    throw new PSDParseError(
      'corrupted',
      `레이어 ${index}: 잘못된 Blend Signature "${blendSignature}"`,
    )
  }
  const blendKey = r.ascii(4)
  const opacity = r.u8()
  const clipping = r.u8() !== 0
  const flags = r.u8()
  r.skip(1) // filler

  // ── Extra Data: Mask / Blending Ranges / Name / Additional Info ──
  const extraLength = r.u32()
  r.ensure(extraLength)
  const extraEnd = r.offset + extraLength

  // Layer Mask Data — offset 보존만 (Task 027.3 에서 복원)
  const maskLen = r.u32()
  r.skip(maskLen)
  // Blending Ranges
  const rangesLen = r.u32()
  r.skip(rangesLen)
  // Pascal Name (4-byte 정렬)
  const pascalName = r.pascalString(4)

  // Additional Layer Information Blocks
  let unicodeName: string | null = null
  let sectionType: PSDSectionType = 0
  let sectionBlendKey: string | null = null
  let lock: PSDLockFlags = { transparency: false, composite: false, position: false, all: false }
  let smartTransform: PSDSmartTransform | null = null
  const infoKeys: string[] = []

  while (r.offset + 12 <= extraEnd) {
    const sig = r.ascii(4)
    if (sig !== '8BIM' && sig !== '8B64') {
      // 손상되었거나 알 수 없는 블록 — 레코드 전체를 버리지 않고 나머지를 건너뛴다
      break
    }
    const key = r.ascii(4)
    const len = r.u32()
    const dataEnd = r.offset + len
    if (dataEnd > extraEnd) break
    infoKeys.push(key)

    try {
      if (key === 'luni' && len >= 4) {
        unicodeName = readUnicodeString(r)
      } else if ((key === 'lsct' || key === 'lsdk') && len >= 4) {
        const t = r.u32()
        if (t <= 3) sectionType = t as PSDSectionType
        if (len >= 12) {
          const s = r.ascii(4)
          if (s === '8BIM') sectionBlendKey = r.ascii(4)
        }
      } else if (key === 'lspf' && len >= 4) {
        const v = r.u32()
        lock = {
          transparency: (v & 0x1) !== 0,
          composite: (v & 0x2) !== 0,
          position: (v & 0x4) !== 0,
          all: (v & 0x80000000) !== 0 || (v & 0x7) === 0x7,
        }
      } else if (
        (key === 'plLd' || key === 'PlLd' || key === 'SoLd' || key === 'SoLE') &&
        len >= 8
      ) {
        // Placed Layer / Smart Object — Transform quad + Warp 감지
        const start = r.offset
        const block = r.bytesView(len)
        r.seek(start)
        const parsed = readSmartTransform(key, block)
        if (parsed && !smartTransform) smartTransform = parsed
      }
    } catch {
      // 개별 블록 파싱 실패는 무시 — 키 목록은 보존됨
    }

    // 블록 데이터 소비 + 홀수 길이 padding
    r.seek(Math.min(extraEnd, dataEnd + (len % 2)))
  }

  r.seek(extraEnd)

  const name = unicodeName || pascalName || `레이어 ${index + 1}`

  return {
    index,
    top,
    left,
    bottom,
    right,
    width,
    height,
    channels,
    blendKey,
    opacity,
    clipping,
    flags,
    visible: (flags & FLAG_HIDDEN) === 0,
    name,
    sectionType,
    sectionBlendKey,
    lock,
    infoKeys,
    kind: detectKind(infoKeys),
    smartTransform,
  }
}

/* ============================================================
   Smart Object / Placed Layer 변형 블록
   ============================================================ */

/**
 * plLd(구 Placed Layer) / SoLd·SoLE(Smart Object Descriptor) 블록에서
 * Transform quad(8 doubles)와 Warp 여부를 추출한다.
 * - plLd: 고정 오프셋 구조 (Type/Version/ID/Page/AA/LayerType 뒤 8 doubles)
 * - SoLd/SoLE: Descriptor 안의 'Trnf' → 'VlLs'(8×'doub') 리스트를 바이트 스캔
 * Descriptor 전체 파서는 후속 Task(SO 편집 지원) 범위 — 여기서는 시각적으로
 * 필요한 최소 정보만 안전하게 읽고, 실패 시 null (Import 는 계속된다).
 */
function readSmartTransform(key: string, block: Uint8Array): PSDSmartTransform | null {
  try {
    let quad: number[] | null = null

    if (key === 'plLd' || key === 'PlLd') {
      quad = readPlacedLayerQuad(block)
    }
    if (!quad) {
      quad = scanDescriptorQuad(block)
    }

    const warped = scanWarped(block)
    if (!quad && !warped) return null
    return { sourceKey: key, quad, warped }
  } catch {
    return null
  }
}

/** plLd 고정 구조: type(4) + version(4) + pascal ID + page(4)+total(4)+aa(4)+layerType(4) + 8 doubles */
function readPlacedLayerQuad(block: Uint8Array): number[] | null {
  if (block.length < 4 + 4 + 1) return null
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const type = String.fromCharCode(block[0], block[1], block[2], block[3])
  if (type !== 'plcL') return null
  let o = 8 // type + version
  const idLen = block[o]
  o += 1 + idLen
  o += 16 // page, total, antialias, layerType
  if (o + 64 > block.length) return null
  const quad: number[] = []
  for (let i = 0; i < 8; i++) {
    quad.push(view.getFloat64(o + i * 8))
  }
  return isFiniteQuad(quad) ? quad : null
}

/** Descriptor 바이트 스캔 — 'Trnf' 키 뒤의 'VlLs' + 8×('doub' + f64 BE) */
function scanDescriptorQuad(block: Uint8Array): number[] | null {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength)
  const idx = findAscii(block, 'Trnf')
  if (idx < 0) return null
  let o = idx + 4
  if (o + 8 > block.length) return null
  const listType = String.fromCharCode(block[o], block[o + 1], block[o + 2], block[o + 3])
  if (listType !== 'VlLs') return null
  const count = view.getUint32(o + 4)
  o += 8
  if (count < 8) return null
  const quad: number[] = []
  for (let i = 0; i < 8; i++) {
    if (o + 12 > block.length) return null
    const itemType = String.fromCharCode(block[o], block[o + 1], block[o + 2], block[o + 3])
    if (itemType !== 'doub') return null
    quad.push(view.getFloat64(o + 4))
    o += 12
  }
  return isFiniteQuad(quad) ? quad : null
}

/** Warp 감지 — quiltWarp 존재 또는 warpStyle 값이 warpNone 이 아닌 경우 */
function scanWarped(block: Uint8Array): boolean {
  if (findAscii(block, 'quiltWarp') >= 0) return true
  const styleIdx = findAscii(block, 'warpStyle')
  if (styleIdx < 0) return false
  // warpStyle 값(enum)은 스타일 키 근처에 ascii 로 존재 — warpNone 이면 변형 없음
  return findAscii(block, 'warpNone', styleIdx) < 0
}

function findAscii(block: Uint8Array, text: string, from = 0): number {
  const first = text.charCodeAt(0)
  outer: for (let i = from; i <= block.length - text.length; i++) {
    if (block[i] !== first) continue
    for (let j = 1; j < text.length; j++) {
      if (block[i + j] !== text.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

function isFiniteQuad(quad: number[]): boolean {
  return quad.length === 8 && quad.every((v) => Number.isFinite(v) && Math.abs(v) < 1e7)
}

/** Unicode String (luni) — u32 문자 수 + UTF-16BE. 한글/일본어/이모지(서로게이트 쌍) 지원 */
function readUnicodeString(r: ByteReader): string {
  const count = r.u32()
  if (count > 2048) throw new PSDParseError('corrupted', '레이어 이름이 너무 깁니다')
  let s = ''
  for (let i = 0; i < count; i++) s += String.fromCharCode(r.u16())
  // Photoshop 이 붙이는 trailing NUL 제거
  return s.replace(/\0+$/, '')
}
