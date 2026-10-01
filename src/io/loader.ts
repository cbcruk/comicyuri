import { Effect, Option, Semaphore } from 'effect'
import type { LoadedBook, Page } from '../types.ts'
import type { StoredBook } from './db.ts'
import { ArchiveError, EmptyBookError, NoComicFilesError } from '../errors.ts'
import { imageSize } from './imageSize.ts'
import type { ImageSize } from './imageSize.ts'
import { fileFromHandle } from './handles.ts'
import { ZipArchive } from './zip.ts'
import type { ZipEntry } from './zip.ts'

/**
 * 헤더를 찾기에 넉넉한 앞머리. JPEG는 EXIF와 ICC 프로파일을 다 지나서야 프레임
 * 헤더가 나오는데, 그 세그먼트들은 하나에 64KB까지 커질 수 있다.
 */
const HEADER_BYTES = 128 * 1024

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

/**
 * 경로 문자열 기준의 자연 정렬("1, 10, 2"가 아니라 "1, 2, 10"). 하위 폴더가 있으면
 * 폴더 이름이 먼저 순서를 가른다.
 */
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
  read(): Effect.Effect<Blob> {
    return Effect.succeed(this.blob)
  }
  measure(): Effect.Effect<Option.Option<ImageSize>, ArchiveError> {
    return Effect.tryPromise({
      try: async () => new Uint8Array(await this.blob.slice(0, HEADER_BYTES).arrayBuffer()),
      catch: (cause) =>
        new ArchiveError({ reason: { kind: 'unreadable', name: this.name }, cause }),
    }).pipe(Effect.map(imageSize))
  }
}

class ZipPage implements Page {
  readonly name: string
  private readonly archive: ZipArchive
  private readonly entry: ZipEntry
  private url: string | null = null
  /**
   * `load`를 한 번에 하나씩 돌린다.
   *
   * URL이 있는지 보는 것과 만드는 것 사이에 압축 풀기가 끼어 있다. 그 사이에 같은 페이지를
   * 또 부르면 둘 다 URL이 없다고 보고 각자 만들고, 캐시는 나중 것만 기억한다. 먼저 만든
   * URL은 화면에 걸린 채 끝내 해제되지 않는다(`R-204`). 미리 읽지 않은 페이지로 갈 때마다
   * 화면에 걸 스프레드와 미리 읽을 이웃이 같은 페이지를 한꺼번에 부르므로 매번 일어났다.
   *
   * 기다린 호출은 앞선 호출이 캐시한 URL을 받으므로 압축도 한 번만 풀린다.
   */
  private readonly loading = Semaphore.makeUnsafe(1)
  constructor(name: string, archive: ZipArchive, entry: ZipEntry) {
    this.name = name
    this.archive = archive
    this.entry = entry
  }
  load(): Effect.Effect<string, ArchiveError> {
    // 만들 때가 아니라 자물쇠를 쥔 뒤에 캐시를 보도록 suspend 한다.
    return this.loading.withPermits(1)(
      Effect.suspend(() =>
        this.url !== null
          ? Effect.succeed(this.url)
          : this.archive
              .extract(this.entry)
              .pipe(Effect.map((bytes) => (this.url = URL.createObjectURL(new Blob([bytes]))))),
      ),
    )
  }
  unload(): void {
    if (this.url) {
      URL.revokeObjectURL(this.url)
      this.url = null
    }
  }
  read(): Effect.Effect<Blob, ArchiveError> {
    return Effect.map(this.archive.extract(this.entry), (bytes) => new Blob([bytes]))
  }
  /**
   * 엔트리를 풀어 페이지 크기를 잰다.
   *
   * deflate는 앞부분만 풀 수 없으므로 엔트리를 통째로 편다. 재는 일은 임포트할
   * 때 한 번뿐이라 그 값을 치를 만하다.
   */
  measure(): Effect.Effect<Option.Option<ImageSize>, ArchiveError> {
    return this.archive.extract(this.entry).pipe(Effect.map(imageSize))
  }
}

/**
 * 고른 파일 하나. 손잡이가 함께 오면 바이트를 복사하지 않고 책장에 둘 수 있다(`S-122`).
 *
 * `path`는 책 제목과 페이지 차례를 정하는 자리다(`S-114`). 폴더에서 왔으면 그 폴더부터의
 * 경로이고, 그렇지 않으면 파일 이름이다.
 */
export type PickedFile = Readonly<{
  file: File
  path: string
  handle?: FileSystemFileHandle
}>

/** 드롭이나 `input`으로 받은 파일들을 {@linkcode PickedFile}로. 손잡이는 없다. */
export function pickedFromFiles(files: ReadonlyArray<File>): ReadonlyArray<PickedFile> {
  return files.map((file) => ({ file, path: file.webkitRelativePath || file.name }))
}

/**
 * 고른 파일 목록을 책장 레코드로 바꾼다. 아카이브는 각각 한 권이 되고, 낱장
 * 이미지들은 한 권으로 묶인다.
 *
 * 손잡이가 함께 온 파일은 레코드에 손잡이를 남긴다. 한 권 안에서 손잡이가 하나라도 빠지면
 * 그 권은 통째로 바이트를 복사한다 — 반만 손잡이인 책은 열 때 두 길을 다 타야 한다.
 */
export function storedBooksFromFiles(
  picked: ReadonlyArray<PickedFile>,
  groupTitle = 'Imported images',
): Effect.Effect<StoredBook[], NoComicFilesError> {
  return Effect.gen(function* () {
    const now = Date.now()
    const archives = picked
      .filter(({ file }) => isArchiveName(file.name))
      .sort(byName(({ file }) => file.name))
    const images = picked
      .filter(({ file }) => isImageName(file.name))
      .sort(byName(({ path }) => path))
    const books: StoredBook[] = []

    for (const { file, handle } of archives) {
      books.push({
        id: bookId(file.name, file.size),
        title: stripExt(file.name),
        source: 'zip',
        names: [file.name],
        ...bytesOf([file], handle === undefined ? undefined : [handle]),
        createdAt: now,
      })
    }

    if (images.length) {
      const folder = images[0]?.path.includes('/') ? images[0].path.split('/')[0] : undefined
      const size = images.reduce((sum, { file }) => sum + file.size, 0)
      const handles = images.map(({ handle }) => handle)
      books.push({
        id: bookId(folder || groupTitle, size),
        title: folder || groupTitle,
        source: folder ? 'folder' : 'images',
        names: images.map(({ path }) => path),
        ...bytesOf(
          images.map(({ file }) => file),
          handles.every((handle) => handle !== undefined) ? handles : undefined,
        ),
        createdAt: now,
      })
    }

    if (!books.length) return yield* new NoComicFilesError()
    return books
  })
}

/**
 * 레코드가 바이트를 지는 방식. 손잡이가 모두 있으면 그것만 남기고 blob은 비운다 — 둘을 다
 * 남기면 복사하지 않으려고 손잡이를 쓴 뜻이 사라진다.
 */
function bytesOf(
  files: ReadonlyArray<File>,
  handles: ReadonlyArray<FileSystemFileHandle> | undefined,
): Pick<StoredBook, 'blobs' | 'handles'> {
  return handles === undefined ? { blobs: [...files] } : { blobs: [], handles: [...handles] }
}

/**
 * 레코드에 남아 있는 크기를 페이지 수에 맞춰 편다. 재기 전에 들여온 책은 배열
 * 자체가 없고, 그러면 모든 페이지가 크기를 모르는 채로 열린다.
 */
function sizesFor(stored: StoredBook, count: number): ReadonlyArray<Option.Option<ImageSize>> {
  return Array.from({ length: count }, (_, i) => Option.fromNullishOr(stored.pageSizes?.[i]))
}

/**
 * 책의 모든 페이지를 재어 레코드에 넣을 모양으로 돌려준다.
 *
 * 한 장이 실패해도 임포트를 멈추지 않는다. 크기를 모르는 페이지는 묶기 규칙에서
 * 빠질 뿐이라, 못 잰 자리는 `null`로 두고 나머지를 살린다.
 */
export function measurePages(book: LoadedBook): Effect.Effect<Array<ImageSize | null>> {
  return Effect.forEach(book.pages, (page) =>
    page.measure().pipe(
      Effect.orElseSucceed(() => Option.none<ImageSize>()),
      Effect.map(Option.getOrNull),
    ),
  )
}

/**
 * 레코드가 가리키는 바이트. 손잡이로 들여온 책이면 디스크에서 다시 열고, 아니면 복사해 둔
 * blob 그대로다(`S-122`).
 *
 * 손잡이를 여는 쪽은 허락을 물을 수 있으므로, 이것을 부르는 길은 사용자의 누름에서
 * 이어져야 한다.
 */
export function blobsFromStored(stored: StoredBook): Effect.Effect<Blob[], ArchiveError> {
  const { handles } = stored
  if (handles === undefined || handles.length === 0) return Effect.succeed(stored.blobs)

  return Effect.forEach(handles, (handle) => fileFromHandle(handle))
}

/** 책장 레코드에서 책을 되살린다. 페이지는 필요할 때 읽는다. */
export function bookFromStored(
  stored: StoredBook,
): Effect.Effect<LoadedBook, ArchiveError | EmptyBookError> {
  return Effect.gen(function* () {
    const blobs = yield* blobsFromStored(stored)

    if (stored.source !== 'zip') {
      const pages: Page[] = blobs.map(
        (blob, i) => new BlobPage(baseName(stored.names[i] ?? `page ${i + 1}`), blob),
      )
      return {
        id: stored.id,
        title: stored.title,
        source: stored.source,
        pages,
        pageSizes: sizesFor(stored, pages.length),
      }
    }

    const file = blobs[0]
    if (!file) return yield* new EmptyBookError({ title: stored.title })

    const archive = yield* ZipArchive.open(file)
    const pages: Page[] = archive.entries
      .filter((e) => isImageName(e.name) && !e.name.includes('__MACOSX'))
      .sort(byName((e) => e.name))
      .map((e) => new ZipPage(baseName(e.name), archive, e))
    if (!pages.length) return yield* new EmptyBookError({ title: stored.title })

    return {
      id: stored.id,
      title: stored.title,
      source: 'zip',
      pages,
      pageSizes: sizesFor(stored, pages.length),
    }
  })
}
