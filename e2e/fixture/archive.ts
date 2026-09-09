/**
 * 테스트가 들여올 책을 그 자리에서 만든다.
 *
 * 바이너리 픽스처를 저장소에 넣지 않으려고 PNG와 ZIP을 직접 쓴다. 페이지마다 색이
 * 다르므로 화면에 어느 페이지가 걸렸는지 픽셀로 확인할 수 있고, 크기를 지정할 수
 * 있으므로 맞춤 모드처럼 비율에 기대는 동작도 시험할 수 있다.
 */

import { deflateSync } from 'node:zlib'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const be32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0)
  return buffer
}

const chunk = (type: string, data: Buffer): Buffer => {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data])
  return Buffer.concat([be32(data.length), typed, be32(crc32(typed))])
}

/** 한 가지 색으로 채운 PNG. 색은 `[r, g, b]`, 0-255. */
export const png = (
  width: number,
  height: number,
  colour: readonly [number, number, number],
): Buffer => {
  const stride = width * 3
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = colour[0]
      raw[row + 2 + x * 3] = colour[1]
      raw[row + 3 + x * 3] = colour[2]
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 아카이브 안에 들어갈 파일 하나. */
export type Entry = Readonly<{
  /** 아카이브 안에서의 이름. 리더는 이 이름으로 페이지 순서를 정한다. */
  name: string
  /** 파일 내용. */
  bytes: Buffer
}>

/**
 * 압축하지 않은(stored) ZIP. `src/zip.ts`가 읽는 것과 같은 모양이며, 압축을 걸지
 * 않는 이유는 픽스처가 무엇을 만들었는지 그대로 읽히기 때문이다.
 */
export const zip = (entries: ReadonlyArray<Entry>): Buffer => {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.bytes)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.bytes.length, 18)
    local.writeUInt32LE(entry.bytes.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, entry.bytes)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(entry.bytes.length, 20)
    central.writeUInt32LE(entry.bytes.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + entry.bytes.length
  }

  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, directory, end])
}

/** 페이지마다 색이 다른 책 한 권. 색은 페이지 번호로 되짚을 수 있다. */
export const pageColour = (page: number): readonly [number, number, number] => [
  (40 + page * 37) % 256,
  (90 + page * 61) % 256,
  (160 + page * 23) % 256,
]

/** 한 권 분량의 페이지. 이름은 `page-01.png`처럼 붙어 자연 정렬과도 맞는다. */
export const pages = (
  count: number,
  size: Readonly<{ width: number; height: number }> = { width: 120, height: 180 },
): ReadonlyArray<Entry> =>
  Array.from({ length: count }, (_, page) => ({
    name: `page-${String(page + 1).padStart(2, '0')}.png`,
    bytes: png(size.width, size.height, pageColour(page)),
  }))

/** 바로 들여올 수 있는 `.cbz` 한 권. */
export const cbz = (count: number, size?: Readonly<{ width: number; height: number }>): Buffer =>
  zip(pages(count, size))
