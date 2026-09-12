import { Effect, Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { ArchiveError } from './errors.ts'
import { ZipArchive } from './zip.ts'

const u16 = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff]
const u32 = (value: number): number[] => [...u16(value & 0xffff), ...u16(value >>> 16)]

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

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

const deflateRaw = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * 아카이브에 넣을 파일 하나.
 *
 * `localExtra`와 `centralExtra`가 따로 있다. 진짜 ZIP에서 이 둘은 흔히 다르고,
 * 데이터가 시작하는 자리를 중앙 디렉터리의 길이로 셈하면 거기서 어긋난다.
 */
type Entry = Readonly<{
  name: string
  body: Uint8Array<ArrayBuffer>
  method: 0 | 8 | 99
  localExtra?: number
  centralExtra?: number
}>

/** 그 엔트리들을 담은 ZIP 바이트. 뒤에 주석을 붙일 수 있다. */
const zip = async (entries: ReadonlyArray<Entry>, comment = ''): Promise<Blob> => {
  const bytes: number[] = []
  const central: number[] = []

  for (const entry of entries) {
    const stored = entry.method === 8 ? await deflateRaw(entry.body) : entry.body
    const localExtra = entry.localExtra ?? 0
    const centralExtra = entry.centralExtra ?? 0
    const offset = bytes.length
    const head = [
      ...u16(entry.method),
      ...u16(0),
      ...u16(0),
      ...u32(crc32(entry.body)),
      ...u32(stored.length),
      ...u32(entry.body.length),
      ...u16(entry.name.length),
    ]

    bytes.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...head,
      ...u16(localExtra),
      ...ascii(entry.name),
      ...Array.from({ length: localExtra }, () => 0),
      ...stored,
    )

    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...head,
      ...u16(centralExtra),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...ascii(entry.name),
      ...Array.from({ length: centralExtra }, () => 0),
    )
  }

  const directoryAt = bytes.length
  bytes.push(...central)
  bytes.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(directoryAt),
    ...u16(comment.length),
    ...ascii(comment),
  )

  return new Blob([new Uint8Array(bytes)])
}

/** `BlobPart`로 설 수 있도록 제 버퍼를 가진 바이트로 만든다. */
const bytesOf = (text: string): Uint8Array<ArrayBuffer> => {
  const encoded = new TextEncoder().encode(text)
  const bytes = new Uint8Array(new ArrayBuffer(encoded.length))
  bytes.set(encoded)
  return bytes
}

const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

const open = (blob: Blob): Promise<ZipArchive> => Effect.runPromise(ZipArchive.open(blob))

/** 실패한 이유. 성공했으면 없음이다. */
const reasonOf = async (effect: Effect.Effect<unknown, ArchiveError>): Promise<string | null> =>
  Effect.runPromise(
    effect.pipe(
      Effect.as(Option.none<string>()),
      Effect.catchTag('ArchiveError', (error) => Effect.succeed(Option.some(error.reason))),
      Effect.map(Option.getOrNull),
    ),
  )

const stored = (name: string, text: string): Entry => ({
  name,
  body: bytesOf(text),
  method: 0,
})

const deflated = (name: string, text: string): Entry => ({
  name,
  body: bytesOf(text),
  method: 8,
})

describe('reading the directory', () => {
  test('every entry is listed in the order the directory wrote them', async () => {
    const archive = await open(
      await zip([stored('b.png', 'bee'), stored('a.png', 'ay'), stored('c.png', 'sea')]),
    )

    expect(archive.entries.map((entry) => entry.name)).toStrictEqual(['b.png', 'a.png', 'c.png'])
  })

  test('an entry carries the sizes and the method the directory recorded', async () => {
    const archive = await open(await zip([deflated('page.png', 'x'.repeat(200))]))
    const entry = archive.entries[0]!

    expect(entry.method).toBe(8)
    expect(entry.uncompressedSize).toBe(200)
    // 200바이트짜리 같은 글자는 반드시 줄어든다.
    expect(entry.compressedSize).toBeLessThan(200)
  })

  test('a trailing comment does not hide the directory', async () => {
    // 주석은 최대 65535바이트까지 EOCD 뒤에 붙을 수 있다.
    const archive = await open(await zip([stored('page.png', 'hello')], 'z'.repeat(300)))

    expect(archive.entries).toHaveLength(1)
  })

  test('an empty archive opens with nothing in it', async () => {
    const archive = await open(await zip([]))

    expect(archive.entries).toStrictEqual([])
  })

  test('bytes that are not a ZIP fail rather than opening empty', async () => {
    const reason = await reasonOf(ZipArchive.open(new Blob([bytesOf('not an archive at all')])))

    expect(reason).toBe('Not a valid ZIP/CBZ archive')
  })
})

describe('pulling an entry out', () => {
  test('a stored entry comes back byte for byte', async () => {
    const archive = await open(await zip([stored('page.png', 'stored bytes')]))
    const bytes = await Effect.runPromise(archive.extract(archive.entries[0]!))

    expect(textOf(bytes)).toBe('stored bytes')
  })

  test('a deflated entry comes back unpacked', async () => {
    const text = 'deflate me '.repeat(40)
    const archive = await open(await zip([deflated('page.png', text)]))
    const bytes = await Effect.runPromise(archive.extract(archive.entries[0]!))

    expect(textOf(bytes)).toBe(text)
  })

  test('each entry reads its own bytes, not its neighbour’s', async () => {
    const archive = await open(
      await zip([stored('1.png', 'first'), deflated('2.png', 'second'), stored('3.png', 'third')]),
    )
    const read = await Promise.all(
      archive.entries.map((entry) => Effect.runPromise(archive.extract(entry))),
    )

    expect(read.map(textOf)).toStrictEqual(['first', 'second', 'third'])
  })

  test('the local header decides where the data starts, not the directory', async () => {
    // 두 헤더의 extra 길이가 다른 것은 흔한 일이다. 중앙 디렉터리의 길이로
    // 데이터 자리를 셈하면 여기서 엉뚱한 바이트를 읽는다.
    const archive = await open(
      await zip([
        {
          name: 'page.png',
          body: bytesOf('the real bytes'),
          method: 0,
          localExtra: 9,
          centralExtra: 0,
        },
      ]),
    )
    const bytes = await Effect.runPromise(archive.extract(archive.entries[0]!))

    expect(textOf(bytes)).toBe('the real bytes')
  })

  test('a method this reader does not know is refused by name', async () => {
    const archive = await open(
      await zip([{ name: 'page.png', body: bytesOf('lzma, say'), method: 99 }]),
    )
    const reason = await reasonOf(archive.extract(archive.entries[0]!))

    expect(reason).toBe('Unsupported compression method 99')
  })
})
