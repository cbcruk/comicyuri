import type { Book, Page } from './types.ts'
import type { StoredBook } from './db.ts'
import { ZipArchive } from './zip.ts'
import type { ZipEntry } from './zip.ts'

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i
const ZIP_RE = /\.(cbz|zip)$/i

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function isImageName(name: string): boolean {
  return IMAGE_RE.test(name)
}
export function isArchiveName(name: string): boolean {
  return ZIP_RE.test(name)
}

/** Natural ("1, 2, 10" not "1, 10, 2") ordering on the visible file name. */
function byName<T>(get: (item: T) => string) {
  return (a: T, b: T) => collator.compare(get(a), get(b))
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function baseName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

/** Stable id so reading progress survives re-opening the same file. */
function bookId(title: string, size: number): string {
  return `${title}::${size}`
}

class BlobPage implements Page {
  readonly name: string
  private readonly blob: Blob
  private url: string | null = null
  constructor(name: string, blob: Blob) {
    this.name = name
    this.blob = blob
  }
  async load(): Promise<string> {
    if (!this.url) this.url = URL.createObjectURL(this.blob)
    return this.url
  }
  unload(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url)
      this.url = null
    }
  }
}

class ZipPage implements Page {
  readonly name: string
  private readonly archive: ZipArchive
  private readonly entry: ZipEntry
  private url: string | null = null
  constructor(name: string, archive: ZipArchive, entry: ZipEntry) {
    this.name = name
    this.archive = archive
    this.entry = entry
  }
  async load(): Promise<string> {
    if (!this.url) {
      const bytes = await this.archive.extract(this.entry)
      this.url = URL.createObjectURL(new Blob([bytes as BlobPart]))
    }
    return this.url
  }
  unload(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url)
      this.url = null
    }
  }
}

/**
 * Turn a flat list of picked files into shelf records. Each archive becomes its
 * own book; loose images are grouped into one book.
 */
export function storedBooksFromFiles(files: File[], groupTitle = 'Imported images'): StoredBook[] {
  const now = Date.now()
  const archives = files.filter((f) => isArchiveName(f.name)).sort(byName((f) => f.name))
  const images = files
    .filter((f) => isImageName(f.name))
    .sort(byName((f) => f.webkitRelativePath || f.name))
  const books: StoredBook[] = []

  for (const file of archives) {
    books.push({
      id: bookId(file.name, file.size),
      title: stripExt(file.name),
      source: 'zip',
      names: [file.name],
      blobs: [file],
      createdAt: now,
    })
  }

  if (images.length) {
    const folder = images[0]?.webkitRelativePath?.split('/')[0]
    const size = images.reduce((sum, f) => sum + f.size, 0)
    books.push({
      id: bookId(folder || groupTitle, size),
      title: folder || groupTitle,
      source: folder ? 'folder' : 'images',
      names: images.map((f) => f.webkitRelativePath || f.name),
      blobs: images,
      createdAt: now,
    })
  }

  if (!books.length) throw new Error('No comic files found (images or .cbz/.zip)')
  return books
}

/** Reconstruct a live Book (with lazy pages) from a shelf record. */
export async function bookFromStored(stored: StoredBook): Promise<Book> {
  if (stored.source === 'zip') {
    const archive = await ZipArchive.open(stored.blobs[0]!)
    const pages: Page[] = archive.entries
      .filter((e) => isImageName(e.name) && !e.name.includes('__MACOSX'))
      .sort(byName((e) => e.name))
      .map((e) => new ZipPage(baseName(e.name), archive, e))
    if (!pages.length) throw new Error(`No images found in "${stored.title}"`)
    return { id: stored.id, title: stored.title, source: 'zip', pages }
  }

  const pages = stored.blobs.map(
    (blob, i) => new BlobPage(baseName(stored.names[i] ?? `page ${i + 1}`), blob),
  )
  return { id: stored.id, title: stored.title, source: stored.source, pages }
}
