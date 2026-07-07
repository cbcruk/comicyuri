/**
 * Minimal ZIP reader for CBZ archives.
 *
 * Parses the central directory and extracts entries on demand. Deflated
 * entries are inflated with the platform's `DecompressionStream`, so there is
 * no third-party dependency. Stored (uncompressed) entries are sliced directly.
 */

export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  uncompressedSize: number
  offset: number
}

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function findEocd(view: DataView): number {
  // The EOCD lives at the end, after an optional comment of up to 65535 bytes.
  const max = Math.min(view.byteLength, 0xffff + 22)
  for (let i = 22; i <= max; i++) {
    const pos = view.byteLength - i
    if (view.getUint32(pos, true) === SIG_EOCD) return pos
  }
  return -1
}

export class ZipArchive {
  readonly entries: ZipEntry[]
  private readonly buffer: ArrayBuffer

  private constructor(buffer: ArrayBuffer, entries: ZipEntry[]) {
    this.buffer = buffer
    this.entries = entries
  }

  static async open(blob: Blob): Promise<ZipArchive> {
    const buffer = await blob.arrayBuffer()
    const view = new DataView(buffer)

    const eocd = findEocd(view)
    if (eocd < 0) throw new Error('Not a valid ZIP/CBZ archive')

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

    return new ZipArchive(buffer, entries)
  }

  async extract(entry: ZipEntry): Promise<Uint8Array> {
    const view = new DataView(this.buffer)
    // The central directory omits the local header's field lengths, so read
    // them from the local file header to locate the actual data start.
    const nameLen = view.getUint16(entry.offset + 26, true)
    const extraLen = view.getUint16(entry.offset + 28, true)
    const start = entry.offset + 30 + nameLen + extraLen
    const data = new Uint8Array(this.buffer, start, entry.compressedSize)

    if (entry.method === 0) return data
    if (entry.method === 8) return inflateRaw(data)
    throw new Error(`Unsupported compression method ${entry.method}`)
  }
}
