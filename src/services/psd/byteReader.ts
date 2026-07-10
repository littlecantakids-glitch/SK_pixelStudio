// Big-Endian 바이너리 커서 — 모든 PSD Reader 가 공유하는 저수준 판독기.
// 범위를 벗어나는 모든 읽기는 PSDParseError('unexpectedEOF')로 변환되므로
// 상위 Reader 는 손상/절단된 파일을 별도 검사 없이 안전하게 처리할 수 있다.
import { PSDParseError } from './types'

export class ByteReader {
  private view: DataView
  private bytes: Uint8Array
  offset = 0

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.bytes = new Uint8Array(buffer)
  }

  get length(): number {
    return this.bytes.length
  }

  get remaining(): number {
    return this.bytes.length - this.offset
  }

  /** n byte 를 더 읽을 수 있는지 보장. 부족하면 unexpectedEOF */
  ensure(n: number): void {
    if (n < 0 || this.offset + n > this.bytes.length) {
      throw new PSDParseError(
        'unexpectedEOF',
        `파일 끝을 지나 읽으려 했습니다 (offset ${this.offset}, 요청 ${n} bytes)`,
      )
    }
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.bytes.length) {
      throw new PSDParseError('unexpectedEOF', `잘못된 오프셋: ${offset}`)
    }
    this.offset = offset
  }

  skip(n: number): void {
    this.ensure(n)
    this.offset += n
  }

  u8(): number {
    this.ensure(1)
    return this.view.getUint8(this.offset++)
  }

  i8(): number {
    this.ensure(1)
    return this.view.getInt8(this.offset++)
  }

  u16(): number {
    this.ensure(2)
    const v = this.view.getUint16(this.offset)
    this.offset += 2
    return v
  }

  i16(): number {
    this.ensure(2)
    const v = this.view.getInt16(this.offset)
    this.offset += 2
    return v
  }

  u32(): number {
    this.ensure(4)
    const v = this.view.getUint32(this.offset)
    this.offset += 4
    return v
  }

  i32(): number {
    this.ensure(4)
    const v = this.view.getInt32(this.offset)
    this.offset += 4
    return v
  }

  /** 16.16 고정소수점 (ResolutionInfo 등) */
  fixed32(): number {
    return this.u32() / 0x10000
  }

  /** 원본 버퍼의 서브뷰 (복사 없음) */
  bytesView(n: number): Uint8Array {
    this.ensure(n)
    const v = this.bytes.subarray(this.offset, this.offset + n)
    this.offset += n
    return v
  }

  /** ASCII 문자열 */
  ascii(n: number): string {
    const v = this.bytesView(n)
    let s = ''
    for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i])
    return s
  }

  /**
   * Pascal String — 1 byte 길이 + 문자열. pad 배수로 정렬(길이 byte 포함).
   * Image Resource Block 이름 등에서 사용 (pad = 2)
   */
  pascalString(pad: number): string {
    const len = this.u8()
    const s = this.ascii(len)
    const total = 1 + len
    const rem = total % pad
    if (rem !== 0) this.skip(pad - rem)
    return s
  }
}
