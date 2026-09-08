/**
 * CBZ 아카이브를 읽는 최소한의 ZIP 리더.
 *
 * 중앙 디렉터리를 파싱하고 엔트리는 필요할 때 뽑는다. deflate 된 엔트리는 플랫폼의
 * `DecompressionStream`으로 풀기 때문에 외부 ZIP 의존성이 없다. 압축되지 않은
 * 엔트리는 그대로 잘라 쓴다. 잘렸거나 지원하지 않는 파일을 만날 수 있는 모든
 * 단계는 던지지 않고 `ArchiveError`로 실패한다.
 */

import { Effect } from 'effect'
import { ArchiveError } from './errors.ts'

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
    catch: (cause) => new ArchiveError({ reason: 'Could not decompress an archive entry', cause }),
  })

function findEocd(view: DataView): number {
  // EOCD는 맨 뒤, 최대 65535바이트짜리 주석이 붙을 수 있는 그 뒤에 있다.
  const max = Math.min(view.byteLength, 0xffff + 22)
  for (let i = 22; i <= max; i++) {
    const pos = view.byteLength - i
    if (view.getUint32(pos, true) === SIG_EOCD) return pos
  }
  return -1
}

function readCentralDirectory(buffer: ArrayBuffer, view: DataView, eocd: number): ZipEntry[] {
  const count = view.getUint16(eocd + 10, true)
  let ptr = view.getUint32(eocd + 16, true)

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
    const name = decoder.decode(new Uint8Array(buffer, ptr + 46, nameLen))
    entries.push({ name, method, compressedSize, uncompressedSize, offset })
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/**
 * 메모리에 쥐고 있는 아카이브. 디렉터리는 파싱해 두었고, 엔트리는 요청받기 전까지
 * 있던 자리에 그대로 둔다.
 *
 * {@linkcode ZipArchive.open}으로 연다. 생성자가 private이라서 파싱된 디렉터리
 * 없이는 아카이브가 존재할 수 없다.
 */
export class ZipArchive {
  /** 중앙 디렉터리가 적어 둔 모든 엔트리를, 적힌 순서 그대로. */
  readonly entries: ZipEntry[]
  private readonly buffer: ArrayBuffer

  private constructor(buffer: ArrayBuffer, entries: ZipEntry[]) {
    this.buffer = buffer
    this.entries = entries
  }

  /**
   * 아카이브를 읽고 중앙 디렉터리를 파싱한다.
   *
   * blob이 애초에 ZIP이 아니거나, 디렉터리가 잘렸거나 깨졌으면 실패한다.
   */
  static open(blob: Blob): Effect.Effect<ZipArchive, ArchiveError> {
    return Effect.gen(function* () {
      const buffer = yield* Effect.tryPromise({
        try: () => blob.arrayBuffer(),
        catch: (cause) => new ArchiveError({ reason: 'Could not read the archive', cause }),
      })
      const view = new DataView(buffer)

      const eocd = findEocd(view)
      if (eocd < 0) return yield* new ArchiveError({ reason: 'Not a valid ZIP/CBZ archive' })

      const entries = yield* Effect.try({
        try: () => readCentralDirectory(buffer, view, eocd),
        catch: (cause) => new ArchiveError({ reason: 'The archive directory is corrupt', cause }),
      })

      return new ZipArchive(buffer, entries)
    })
  }

  /**
   * 엔트리 하나를 읽는다. deflate 된 것이면 풀어서 준다.
   *
   * 엔트리는 이 아카이브 자신의 {@linkcode ZipArchive.entries} 중 하나여야 한다.
   * 확인하는 곳은 없고, 다른 데서 온 오프셋은 엉뚱한 바이트를 읽는다.
   */
  extract(entry: ZipEntry): Effect.Effect<Uint8Array<ArrayBuffer>, ArchiveError> {
    return Effect.try({
      try: () => {
        const view = new DataView(this.buffer)
        // 중앙 디렉터리에는 로컬 헤더의 필드 길이가 없으므로, 실제 데이터가
        // 시작하는 자리를 찾으려면 로컬 파일 헤더에서 읽어야 한다.
        const nameLen = view.getUint16(entry.offset + 26, true)
        const extraLen = view.getUint16(entry.offset + 28, true)
        const start = entry.offset + 30 + nameLen + extraLen
        return new Uint8Array(this.buffer, start, entry.compressedSize)
      },
      catch: (cause) => new ArchiveError({ reason: `Could not read "${entry.name}"`, cause }),
    }).pipe(
      Effect.flatMap((data) => {
        if (entry.method === 0) return Effect.succeed(data)
        if (entry.method === 8) return inflateRaw(data)
        return Effect.fail(
          new ArchiveError({ reason: `Unsupported compression method ${entry.method}` }),
        )
      }),
    )
  }
}
