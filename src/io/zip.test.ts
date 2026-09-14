import { Effect, Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { ArchiveError } from '../errors.ts'
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
    )
    // 큰 페이지를 펼쳐 넘기면 인자 수 한도에 걸린다.
    for (const byte of stored) bytes.push(byte)

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

/**
 * 읽힌 바이트 수를 세는 blob. 리더가 아카이브를 통째로 읽는지, 필요한 구간만 읽는지
 * 여기서 드러난다.
 */
class CountingBlob extends Blob {
  bytesRead = 0

  override slice(start = 0, end = this.size, contentType?: string): Blob {
    const from = start < 0 ? Math.max(this.size + start, 0) : Math.min(start, this.size)
    const to = end < 0 ? Math.max(this.size + end, 0) : Math.min(end, this.size)
    this.bytesRead += Math.max(to - from, 0)
    // 잘라 낸 조각이 이 클래스로 만들어지면 그 조각을 읽을 때 한 번 더 센다.
    return new Blob([super.slice(start, end, contentType)])
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    this.bytesRead += this.size
    return super.arrayBuffer()
  }
}

/** 큰 페이지 하나와 작은 페이지 하나. 큰 쪽을 읽었는지가 바이트 수로 보인다. */
const bigAndSmall = async (): Promise<CountingBlob> => {
  const big = new Uint8Array(new ArrayBuffer(300_000))
  const archive = await zip([
    { name: 'big.png', body: big, method: 0 },
    stored('small.png', 'small page'),
  ])
  return new CountingBlob([await archive.arrayBuffer()])
}

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

  test('opening reads the directory, not the pages', async () => {
    const blob = await bigAndSmall()
    const archive = await open(blob)

    expect(archive.entries).toHaveLength(2)
    // 끝부분(주석이 붙을 수 있는 만큼)과 디렉터리만 읽는다. 큰 페이지는 건드리지 않는다.
    expect(blob.bytesRead).toBeLessThan(100_000)
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

  test('pulling one entry out reads that entry and nothing else', async () => {
    const blob = await bigAndSmall()
    const archive = await open(blob)
    const before = blob.bytesRead

    const small = archive.entries.find((entry) => entry.name === 'small.png')!
    const bytes = await Effect.runPromise(archive.extract(small))

    expect(textOf(bytes)).toBe('small page')
    // 로컬 헤더와 그 엔트리의 바이트뿐이다.
    expect(blob.bytesRead - before).toBeLessThan(200)
  })

  test('an entry that runs past the end of the archive fails rather than coming back short', async () => {
    const archive = await open(await zip([stored('page.png', 'whole page')]))
    const entry = { ...archive.entries[0]!, compressedSize: 1_000_000 }

    expect(await reasonOf(archive.extract(entry))).toBe('Could not read "page.png"')
  })

  test('a method this reader does not know is refused by name', async () => {
    const archive = await open(
      await zip([{ name: 'page.png', body: bytesOf('lzma, say'), method: 99 }]),
    )
    const reason = await reasonOf(archive.extract(archive.entries[0]!))

    expect(reason).toBe('Unsupported compression method 99')
  })
})
