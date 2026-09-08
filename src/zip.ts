/**
 * Minimal ZIP reader for CBZ archives.
 *
 * Parses the central directory and extracts entries on demand. Deflated
 * entries are inflated with the platform's `DecompressionStream`, so there is
 * no third-party ZIP dependency. Stored (uncompressed) entries are sliced
 * directly. Every step that can meet a truncated or unsupported file fails
 * with an `ArchiveError` rather than throwing.
 */

import { Effect } from 'effect'
import { ArchiveError } from './errors.ts'

/** One file listed in the archive's central directory, located but not yet read. */
export interface ZipEntry {
  /** The path inside the archive, directory separators and all. */
  name: string
  /**
   * The compression method: `0` stored, `8` deflate. Anything else is refused
   * by {@linkcode ZipArchive.extract}.
   */
  method: number
  /** Bytes occupied in the archive. */
  compressedSize: number
  /** Bytes the entry expands to. */
  uncompressedSize: number
  /** Where the local file header starts, counted from the front of the archive. */
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
  // The EOCD lives at the end, after an optional comment of up to 65535 bytes.
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
 * An archive held in memory, with its directory parsed and its entries left
 * where they are until asked for.
 *
 * Open one with {@linkcode ZipArchive.open}; the constructor is private so an
 * archive cannot exist without a directory that parsed.
 */
export class ZipArchive {
  /** Every entry the central directory listed, in the order it listed them. */
  readonly entries: ZipEntry[]
  private readonly buffer: ArrayBuffer

  private constructor(buffer: ArrayBuffer, entries: ZipEntry[]) {
    this.buffer = buffer
    this.entries = entries
  }

  /**
   * Reads an archive and parses its central directory.
   *
   * Fails when the blob is not a ZIP at all, or when its directory is truncated
   * or corrupt.
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
   * Reads one entry, inflating it when it was deflated.
   *
   * The entry must be one of this archive's own {@linkcode ZipArchive.entries};
   * nothing checks that, and an offset from elsewhere reads the wrong bytes.
   */
  extract(entry: ZipEntry): Effect.Effect<Uint8Array<ArrayBuffer>, ArchiveError> {
    return Effect.try({
      try: () => {
        const view = new DataView(this.buffer)
        // The central directory omits the local header's field lengths, so read
        // them from the local file header to locate the actual data start.
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
