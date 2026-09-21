/**
 * CBZ 아카이브를 읽는 최소한의 ZIP 리더.
 *
 * 중앙 디렉터리를 파싱하고 엔트리는 필요할 때 뽑는다. 아카이브는 필요한 구간만
 * `Blob.slice`로 읽으며, 통째로 메모리에 올리지 않는다. deflate 된 엔트리는 플랫폼의
 * `DecompressionStream`으로 풀기 때문에 외부 ZIP 의존성이 없다. 압축되지 않은
 * 엔트리는 그대로 잘라 쓴다. 범위를 벗어나거나 지원하지 않는 파일을 만날 수 있는
 * 단계는 던지지 않고 `ArchiveError`로 실패한다.
 */

import { Effect } from 'effect'
import { ArchiveError } from '../errors.ts'
import type { ArchiveReason } from '../errors.ts'

/** 중앙 디렉터리에 적힌 파일 하나. 자리는 찾았지만 아직 읽지는 않았다. */
export interface ZipEntry {
  /** 아카이브 안에서의 경로. 디렉터리 구분자까지 그대로다. */
  name: string
  /**
   * 압축 방식. `0`은 그대로 저장, `8`은 deflate. 그 밖의 것은
   * {@linkcode ZipArchive.extract}가 거절한다.
   */
  method: number
  /** 아카이브 안에서 차지하는 바이트. */
  compressedSize: number
  /** 풀었을 때의 바이트. */
  uncompressedSize: number
  /** 로컬 파일 헤더가 시작하는 자리. 아카이브 맨 앞에서부터 센다. */
  offset: number
}

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50

const inflateRaw = (
  bytes: Uint8Array<ArrayBuffer>,
): Effect.Effect<Uint8Array<ArrayBuffer>, ArchiveError> =>
  Effect.tryPromise({
    try: async () => {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
    catch: (cause) => new ArchiveError({ reason: { kind: 'inflate' }, cause }),
  })

/** blob에서 `[start, end)` 구간만 읽는다. 파일 끝을 넘는 부분은 잘려서 온다. */
const readRange = (
  blob: Blob,
  start: number,
  end: number,
  reason: ArchiveReason,
): Effect.Effect<ArrayBuffer, ArchiveError> =>
  Effect.tryPromise({
    try: () => blob.slice(start, end).arrayBuffer(),
    catch: (cause) => new ArchiveError({ reason, cause }),
  })

/** EOCD의 고정 길이. 주석은 이 뒤에 붙는다. */
const EOCD_SIZE = 22

/** EOCD 뒤에 붙을 수 있는 주석의 최대 길이. */
const MAX_COMMENT = 0xffff

function findEocd(view: DataView): number {
  // EOCD는 맨 뒤, 최대 65535바이트짜리 주석이 붙을 수 있는 그 뒤에 있다.
  for (let pos = view.byteLength - EOCD_SIZE; pos >= 0; pos--) {
    if (view.getUint32(pos, true) === SIG_EOCD) return pos
  }
  return -1
}

function readCentralDirectory(directory: ArrayBuffer, count: number): ZipEntry[] {
  const view = new DataView(directory)
  let ptr = 0

  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== SIG_CENTRAL) break
    const method = view.getUint16(ptr + 10, true)
    const compressedSize = view.getUint32(ptr + 20, true)
    const uncompressedSize = view.getUint32(ptr + 24, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const offset = view.getUint32(ptr + 42, true)
    const name = decoder.decode(new Uint8Array(directory, ptr + 46, nameLen))
    entries.push({ name, method, compressedSize, uncompressedSize, offset })
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/**
 * 열어 둔 아카이브. 디렉터리는 파싱해 두었고, 엔트리는 요청받을 때 그 자리만 읽는다.
 *
 * 아카이브 전체를 메모리에 올리지 않는다. 수백 MB짜리 권도 여는 데는 끝부분과 중앙
 * 디렉터리만, 한 장을 뽑는 데는 그 엔트리만 읽는다. IndexedDB가 내주는 blob은
 * 디스크에 있으므로, 읽지 않은 곳은 메모리에 오지 않는다.
 *
 * {@linkcode ZipArchive.open}으로 연다. 생성자가 private이라서 파싱된 디렉터리
 * 없이는 아카이브가 존재할 수 없다.
 */
export class ZipArchive {
  /** 중앙 디렉터리에서 읽어 낸 엔트리를, 적힌 순서 그대로. */
  readonly entries: ZipEntry[]
  private readonly blob: Blob

  private constructor(blob: Blob, entries: ZipEntry[]) {
    this.blob = blob
    this.entries = entries
  }

  /**
   * 아카이브의 끝부분에서 EOCD를 찾고, 그것이 가리키는 중앙 디렉터리를 파싱한다.
   *
   * blob이 애초에 ZIP이 아니거나 디렉터리가 파일 범위를 벗어나면 실패한다. 레코드
   * 시그니처가 어긋나면 거기서 멈추고, 그 앞까지 읽은 엔트리로 연다.
   */
  static open(blob: Blob): Effect.Effect<ZipArchive, ArchiveError> {
    return Effect.gen(function* () {
      const tailStart = Math.max(0, blob.size - (EOCD_SIZE + MAX_COMMENT))
      const tail = yield* readRange(blob, tailStart, blob.size, { kind: 'notAnArchive' })
      const eocd = findEocd(new DataView(tail))
      if (eocd < 0) return yield* new ArchiveError({ reason: { kind: 'notAnArchive' } })

      const view = new DataView(tail)
      const count = view.getUint16(eocd + 10, true)
      const size = view.getUint32(eocd + 12, true)
      const offset = view.getUint32(eocd + 16, true)

      const directory = yield* readRange(blob, offset, offset + size, { kind: 'directoryCorrupt' })

      const entries = yield* Effect.try({
        try: () => readCentralDirectory(directory, count),
        catch: (cause) => new ArchiveError({ reason: { kind: 'directoryCorrupt' }, cause }),
      })

      return new ZipArchive(blob, entries)
    })
  }

  /**
   * 엔트리 하나를 읽는다. deflate 된 것이면 풀어서 준다.
   *
   * 엔트리는 이 아카이브 자신의 {@linkcode ZipArchive.entries} 중 하나여야 한다.
   * 확인하는 곳은 없고, 다른 데서 온 오프셋은 엉뚱한 바이트를 읽는다.
   */
  extract(entry: ZipEntry): Effect.Effect<Uint8Array<ArrayBuffer>, ArchiveError> {
    const reason: ArchiveReason = { kind: 'unreadable', name: entry.name }
    const blob = this.blob

    return Effect.gen(function* () {
      // 중앙 디렉터리에는 로컬 헤더의 필드 길이가 없으므로, 실제 데이터가
      // 시작하는 자리를 찾으려면 로컬 파일 헤더에서 읽어야 한다.
      const header = yield* readRange(blob, entry.offset, entry.offset + 30, reason)
      const start = yield* Effect.try({
        try: () => {
          const view = new DataView(header)
          const nameLen = view.getUint16(26, true)
          const extraLen = view.getUint16(28, true)
          return entry.offset + 30 + nameLen + extraLen
        },
        catch: (cause) => new ArchiveError({ reason, cause }),
      })

      const data = yield* readRange(blob, start, start + entry.compressedSize, reason)
      // 파일 끝을 넘는 구간은 던지지 않고 짧게 온다. 잘린 바이트를 페이지로 내주지 않는다.
      if (data.byteLength !== entry.compressedSize) {
        return yield* new ArchiveError({ reason })
      }

      const bytes = new Uint8Array(data)
      if (entry.method === 0) return bytes
      if (entry.method === 8) return yield* inflateRaw(bytes)
      return yield* new ArchiveError({
        reason: { kind: 'unsupportedMethod', method: entry.method },
      })
    })
  }
}
