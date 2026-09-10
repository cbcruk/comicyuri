import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { imageSize } from './imageSize.ts'

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

const u16be = (value: number): number[] => [(value >> 8) & 0xff, value & 0xff]
const u16le = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff]
const u32be = (value: number): number[] => [...u16be(value >>> 16), ...u16be(value & 0xffff)]
const u32le = (value: number): number[] => [...u16le(value & 0xffff), ...u16le(value >>> 16)]
const u24le = (value: number): number[] => [...u16le(value & 0xffff), (value >> 16) & 0xff]

/** 읽지 않고 건너뛰는 자리. 실제 파일에서는 플래그나 예약 필드다. */
const zeros = (count: number): number[] => Array.from({ length: count }, () => 0)

/** JPEG 세그먼트의 머리. */
const marker = (code: number): number[] => [0xff, code]

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const VP8_START_CODE = [0x9d, 0x01, 0x2a]

/** 헤더만 있는 파일은 없으므로, 뒤에 아무 바이트나 붙여 실제 모양에 가깝게 둔다. */
const padded = (head: number[], length = 64): Uint8Array => {
  const bytes = new Uint8Array(length)
  bytes.set(head.slice(0, length))
  return bytes
}

const measured = (head: number[]): { width: number; height: number } | null =>
  Option.getOrNull(imageSize(padded(head)))

const png = (width: number, height: number): number[] => [
  ...PNG_SIGNATURE,
  ...u32be(13),
  ...ascii('IHDR'),
  ...u32be(width),
  ...u32be(height),
]

/** `SOF0` 하나만 든 최소한의 JPEG. 앞에 붙일 세그먼트는 인자로 받는다. */
const jpeg = (width: number, height: number, before: number[] = []): number[] => [
  ...marker(0xd8),
  ...before,
  ...marker(0xc0),
  ...u16be(17),
  8,
  ...u16be(height),
  ...u16be(width),
]

/** 회전 값 하나만 든 EXIF APP1 세그먼트. 리틀 엔디언 TIFF다. */
const exifApp1 = (orientation: number): number[] => {
  const payload = [
    ...ascii('Exif\0\0'),
    ...ascii('II'),
    ...u16le(42),
    ...u32le(8),
    ...u16le(1),
    ...u16le(0x0112),
    ...u16le(3),
    ...u32le(1),
    ...u16le(orientation),
    ...zeros(2),
    ...u32le(0),
  ]
  return [...marker(0xe1), ...u16be(payload.length + 2), ...payload]
}

const riff = (chunk: number[]): number[] => [
  ...ascii('RIFF'),
  ...u32le(chunk.length + 4),
  ...ascii('WEBP'),
  ...chunk,
]

describe('formats that put the size in a fixed place', () => {
  test('a PNG is measured from its IHDR', () => {
    expect(measured(png(1400, 2000))).toStrictEqual({ width: 1400, height: 2000 })
  })

  test('a GIF is measured from its screen descriptor', () => {
    expect(measured([...ascii('GIF89a'), ...u16le(800), ...u16le(1200)])).toStrictEqual({
      width: 800,
      height: 1200,
    })
  })

  test('a bottom-up BMP does not report a negative height', () => {
    const header = [...ascii('BM'), ...zeros(16), ...u32le(640), ...u32le(-480 >>> 0)]
    expect(measured(header)).toStrictEqual({ width: 640, height: 480 })
  })
})

describe('webp, which is three formats in one container', () => {
  test('a lossy webp is measured from its frame header', () => {
    const chunk = [
      ...ascii('VP8 '),
      ...u32le(10),
      ...zeros(3),
      ...VP8_START_CODE,
      ...u16le(1024),
      ...u16le(1536),
    ]
    expect(measured(riff(chunk))).toStrictEqual({ width: 1024, height: 1536 })
  })

  test('a lossless webp is measured from its packed bits', () => {
    const bits = (1024 - 1) | ((1536 - 1) << 14)
    const chunk = [...ascii('VP8L'), ...u32le(5), 0x2f, ...u32le(bits >>> 0)]
    expect(measured(riff(chunk))).toStrictEqual({ width: 1024, height: 1536 })
  })

  test('an extended webp is measured from its canvas size', () => {
    const chunk = [...ascii('VP8X'), ...u32le(10), ...zeros(4), ...u24le(1023), ...u24le(1535)]
    expect(measured(riff(chunk))).toStrictEqual({ width: 1024, height: 1536 })
  })
})

describe('jpeg, which hides the size behind other segments', () => {
  test('a plain jpeg is measured from its frame header', () => {
    expect(measured(jpeg(1400, 2000))).toStrictEqual({ width: 1400, height: 2000 })
  })

  test('a huffman table in the way is stepped over, not read as a frame', () => {
    const huffman = [...marker(0xc4), ...u16be(6), ...zeros(4)]
    expect(measured(jpeg(1400, 2000, huffman))).toStrictEqual({ width: 1400, height: 2000 })
  })

  test('a turned photo is measured the way the browser will draw it', () => {
    // 6은 오른쪽으로 세워 그리라는 뜻이라 폭과 높이가 바뀐다.
    expect(measured(jpeg(2000, 1400, exifApp1(6)))).toStrictEqual({ width: 1400, height: 2000 })
  })

  test('an upright photo keeps the numbers written in its frame header', () => {
    expect(measured(jpeg(2000, 1400, exifApp1(1)))).toStrictEqual({ width: 2000, height: 1400 })
  })
})

describe('avif and its relatives', () => {
  test('an avif is measured from the first ispe box', () => {
    const head = [
      ...u32be(20),
      ...ascii('ftypavif'),
      ...zeros(8),
      ...u32be(20),
      ...ascii('ispe'),
      ...u32be(0),
      ...u32be(1600),
      ...u32be(2400),
    ]
    expect(measured(head)).toStrictEqual({ width: 1600, height: 2400 })
  })
})

describe('bytes that say nothing', () => {
  test('an unknown format is not a failure, only an unknown size', () => {
    expect(imageSize(padded(ascii('this is not an image')))._tag).toBe('None')
  })

  test('a file too short to hold a header is unknown', () => {
    expect(imageSize(new Uint8Array(4))._tag).toBe('None')
  })

  test('a truncated png is unknown rather than a guess', () => {
    expect(imageSize(new Uint8Array(png(1400, 2000).slice(0, 20)))._tag).toBe('None')
  })

  test('a zero-sized image is treated as unmeasured', () => {
    expect(measured(png(0, 0))).toBeNull()
  })
})
