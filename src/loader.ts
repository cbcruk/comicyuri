import { Effect } from 'effect'
import type { LoadedBook, Page } from './types.ts'
import type { StoredBook } from './db.ts'
import { EmptyBookError, NoComicFilesError } from './errors.ts'
import type { ArchiveError } from './errors.ts'
import { ZipArchive } from './zip.ts'
import type { ZipEntry } from './zip.ts'

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i
const ZIP_RE = /\.(cbz|zip)$/i

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** 파일 이름이 페이지가 될 수 있는 이미지 형식인지. */
export function isImageName(name: string): boolean {
  return IMAGE_RE.test(name)
}
/** 파일 이름이 만화 아카이브(`.cbz` 또는 `.zip`)인지. */
export function isArchiveName(name: string): boolean {
  return ZIP_RE.test(name)
}

/** 눈에 보이는 파일 이름 기준의 자연 정렬("1, 10, 2"가 아니라 "1, 2, 10"). */
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

/** 같은 파일을 다시 열어도 읽던 위치가 살아남도록 하는 고정 id. */
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
  load(): Effect.Effect<string> {
    return Effect.sync(() => (this.url ??= URL.createObjectURL(this.blob)))
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
  load(): Effect.Effect<string, ArchiveError> {
    // 만들 때가 아니라 실행할 때 캐시를 보도록 suspend 한다.
    return Effect.suspend(() =>
      this.url !== null
        ? Effect.succeed(this.url)
        : this.archive
            .extract(this.entry)
            .pipe(Effect.map((bytes) => (this.url = URL.createObjectURL(new Blob([bytes]))))),
    )
  }
  unload(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url)
      this.url = null
    }
  }
}

/**
 * 고른 파일 목록을 책장 레코드로 바꾼다. 아카이브는 각각 한 권이 되고, 낱장
 * 이미지들은 한 권으로 묶인다.
 */
export function storedBooksFromFiles(
  files: ReadonlyArray<File>,
  groupTitle = 'Imported images',
): Effect.Effect<StoredBook[], NoComicFilesError> {
  return Effect.gen(function* () {
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

    if (!books.length) return yield* new NoComicFilesError()
    return books
  })
}

/** 책장 레코드에서 책을 되살린다. 페이지는 필요할 때 읽는다. */
export function bookFromStored(
  stored: StoredBook,
): Effect.Effect<LoadedBook, ArchiveError | EmptyBookError> {
  return Effect.gen(function* () {
    if (stored.source !== 'zip') {
      const pages: Page[] = stored.blobs.map(
        (blob, i) => new BlobPage(baseName(stored.names[i] ?? `page ${i + 1}`), blob),
      )
      return { id: stored.id, title: stored.title, source: stored.source, pages }
    }

    const file = stored.blobs[0]
    if (!file) return yield* new EmptyBookError({ title: stored.title })

    const archive = yield* ZipArchive.open(file)
    const pages: Page[] = archive.entries
      .filter((e) => isImageName(e.name) && !e.name.includes('__MACOSX'))
      .sort(byName((e) => e.name))
      .map((e) => new ZipPage(baseName(e.name), archive, e))
    if (!pages.length) return yield* new EmptyBookError({ title: stored.title })

    return { id: stored.id, title: stored.title, source: 'zip', pages }
  })
}
