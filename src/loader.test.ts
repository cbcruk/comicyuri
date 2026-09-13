/**
 * `src/loader.ts`를 직접 겨냥한다. 고른 파일이 책장 레코드가 되는 길과, 그
 * 레코드가 다시 책이 되는 길이다.
 *
 * 아카이브는 테스트 안에서 짓는다. 압축하지 않고 그대로 저장하는 엔트리만 쓰므로
 * 여기서 재는 것은 압축 해제가 아니라 무엇을 페이지로 치고 어떤 순서에 세우는지다.
 */

import { Effect, Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import type { ArchiveError, EmptyBookError, NoComicFilesError } from './errors.ts'
import {
  bookFromStored,
  isArchiveName,
  isImageName,
  measurePages,
  storedBooksFromFiles,
} from './loader.ts'
import type { StoredBook } from './db.ts'

const u16 = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff]
const u32 = (value: number): number[] => [...u16(value & 0xffff), ...u16(value >>> 16)]
const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

/** 8×12 크기의 PNG. 크기를 재는 자리에서 그 숫자가 다시 나온다. */
const PNG: ReadonlyArray<number> = [
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  13,
  ...ascii('IHDR'),
  0,
  0,
  0,
  8,
  0,
  0,
  0,
  12,
  8,
  2,
  0,
  0,
  0,
]

/**
 * 엔트리들로 이루어진 ZIP. 기본은 그대로 저장(`0`)이고, 아무도 모르는 방식을
 * 적어 두면 뽑는 자리에서 실패한다.
 */
const zip = (names: ReadonlyArray<string>, method = 0): Blob => {
  const bytes: number[] = []
  const central: number[] = []

  for (const name of names) {
    const offset = bytes.length
    const head = [
      ...u16(method),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(PNG.length),
      ...u32(PNG.length),
      ...u16(name.length),
    ]

    bytes.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...head,
      ...u16(0),
      ...ascii(name),
      ...PNG,
    )
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...head,
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...ascii(name),
    )
  }

  const directoryAt = bytes.length
  bytes.push(...central)
  bytes.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(names.length),
    ...u16(names.length),
    ...u32(central.length),
    ...u32(directoryAt),
    ...u16(0),
  )

  return new Blob([new Uint8Array(bytes)])
}

/** 고른 파일 하나. 폴더에서 왔다면 그 안에서의 경로도 함께 지고 온다. */
const file = (name: string, relativePath?: string): File => {
  const made = new File([new Uint8Array(PNG)], name)
  if (relativePath !== undefined) {
    Object.defineProperty(made, 'webkitRelativePath', { value: relativePath })
  }
  return made
}

/** 아카이브 하나를 담은, 고른 파일 하나. */
const archiveFile = (name: string, entries: ReadonlyArray<string>): File =>
  new File([zip(entries)], name)

const recordsOf = (files: ReadonlyArray<File>): Promise<StoredBook[]> =>
  Effect.runPromise(storedBooksFromFiles(files))

/** 이 계층이 낼 수 있는 실패. */
type LoaderError = ArchiveError | EmptyBookError | NoComicFilesError

/** 실패한 이유의 태그. 성공했으면 없음이다. */
const failureOf = (effect: Effect.Effect<unknown, LoaderError>): Promise<string | null> =>
  Effect.runPromise(
    effect.pipe(
      Effect.as(Option.none<string>()),
      Effect.catch((error: LoaderError) => Effect.succeed(Option.some(error._tag))),
      Effect.map(Option.getOrNull),
    ),
  )

describe('what counts as a page or a book', () => {
  test('the image formats this viewer can stand a page on', () => {
    for (const name of ['a.jpg', 'a.jpeg', 'a.PNG', 'a.gif', 'a.webp', 'a.avif', 'a.bmp']) {
      expect(isImageName(name)).toBe(true)
    }
  })

  test('what is not a page', () => {
    for (const name of ['a.txt', 'a.pdf', 'a.png.bak', 'png', 'a.zip']) {
      expect(isImageName(name)).toBe(false)
    }
  })

  test('an archive is a .cbz or a .zip, whatever the case', () => {
    expect(isArchiveName('volume-1.cbz')).toBe(true)
    expect(isArchiveName('volume-1.ZIP')).toBe(true)
    expect(isArchiveName('volume-1.cbr')).toBe(false)
  })
})

describe('turning chosen files into shelf records', () => {
  test('each archive is a book of its own, titled without the extension', async () => {
    const books = await recordsOf([
      archiveFile('volume-2.cbz', ['page-01.png']),
      archiveFile('volume-1.cbz', ['page-01.png']),
    ])

    // 이름순으로 선다. 고른 순서가 아니다.
    expect(books.map(({ title }) => title)).toStrictEqual(['volume-1', 'volume-2'])
    expect(books.every(({ source }) => source === 'zip')).toBe(true)
  })

  test('loose images are one book, in name order', async () => {
    const books = await recordsOf([file('page-10.png'), file('page-2.png'), file('page-1.png')])

    expect(books).toHaveLength(1)
    expect(books[0]?.title).toBe('Imported images')
    expect(books[0]?.source).toBe('images')
    // 자연 정렬이라 10이 2 뒤에 온다.
    expect(books[0]?.names).toStrictEqual(['page-1.png', 'page-2.png', 'page-10.png'])
  })

  test('images from a folder take the folder name', async () => {
    const books = await recordsOf([
      file('page-02.png', 'collected/page-02.png'),
      file('page-01.png', 'collected/page-01.png'),
    ])

    expect(books[0]?.title).toBe('collected')
    expect(books[0]?.source).toBe('folder')
    expect(books[0]?.names).toStrictEqual(['collected/page-01.png', 'collected/page-02.png'])
  })

  test('archives and loose images chosen together make both kinds', async () => {
    const books = await recordsOf([archiveFile('volume-1.cbz', ['page-01.png']), file('loose.png')])

    expect(books.map(({ source }) => source)).toStrictEqual(['zip', 'images'])
  })

  test('anything that is neither is left out', async () => {
    const books = await recordsOf([file('notes.txt'), archiveFile('volume-1.cbz', ['page-01.png'])])

    expect(books).toHaveLength(1)
    expect(books[0]?.title).toBe('volume-1')
  })

  test('choosing nothing importable is a failure, not an empty shelf', async () => {
    expect(await failureOf(storedBooksFromFiles([file('notes.txt')]))).toBe('NoComicFilesError')
  })

  // 같은 파일을 다시 들여와도 같은 id여야 읽던 자리가 제 책을 찾는다.
  test('the id of an archive is its name and its size', async () => {
    const archive = archiveFile('volume-1.cbz', ['page-01.png'])
    const once = await recordsOf([archive])
    const again = await recordsOf([archive])

    expect(once[0]?.id).toBe(`volume-1.cbz::${archive.size}`)
    expect(again[0]?.id).toBe(once[0]?.id)
  })
})

describe('opening a record as a book', () => {
  const storedZip = (title: string, entries: ReadonlyArray<string>): StoredBook => ({
    id: `${title}::1`,
    title,
    source: 'zip',
    names: [`${title}.cbz`],
    blobs: [zip(entries)],
    createdAt: 0,
  })

  test('the images inside stand as pages, in name order, by their own names', async () => {
    const book = await Effect.runPromise(
      bookFromStored(storedZip('volume-1', ['pages/02.png', 'pages/01.png', 'info.txt'])),
    )

    expect(book.pages.map(({ name }) => name)).toStrictEqual(['01.png', '02.png'])
  })

  test('what macOS leaves in an archive is not a page', async () => {
    const book = await Effect.runPromise(
      bookFromStored(storedZip('volume-1', ['__MACOSX/._01.png', '01.png'])),
    )

    expect(book.pages.map(({ name }) => name)).toStrictEqual(['01.png'])
  })

  /** R-203 · 열어 보니 쓸 이미지가 없는 아카이브. */
  test('an archive with no images says so rather than opening empty', async () => {
    expect(await failureOf(bookFromStored(storedZip('volume-1', ['readme.txt'])))).toBe(
      'EmptyBookError',
    )
  })

  test('a record that lost its bytes says the same', async () => {
    expect(
      await failureOf(bookFromStored({ ...storedZip('volume-1', ['01.png']), blobs: [] })),
    ).toBe('EmptyBookError')
  })

  test('bytes that are not an archive fail as an archive would', async () => {
    expect(
      await failureOf(
        bookFromStored({
          ...storedZip('volume-1', ['01.png']),
          blobs: [new Blob([new Uint8Array(PNG)])],
        }),
      ),
    ).toBe('ArchiveError')
  })

  test('loose images keep the order and the names they were stored with', async () => {
    const book = await Effect.runPromise(
      bookFromStored({
        id: 'collected::1',
        title: 'collected',
        source: 'folder',
        names: ['collected/01.png', 'collected/02.png'],
        blobs: [new Blob([new Uint8Array(PNG)]), new Blob([new Uint8Array(PNG)])],
        createdAt: 0,
      }),
    )

    // 폴더는 떼어 낸다. 카운터 아래에 서는 것은 파일 이름이다.
    expect(book.pages.map(({ name }) => name)).toStrictEqual(['01.png', '02.png'])
  })
})

describe('measuring the pages of a book', () => {
  test('a page whose header is read comes back with its size', async () => {
    const book = await Effect.runPromise(
      bookFromStored({
        id: 'collected::1',
        title: 'collected',
        source: 'images',
        names: ['01.png'],
        blobs: [new Blob([new Uint8Array(PNG)])],
        createdAt: 0,
      }),
    )

    expect(await Effect.runPromise(measurePages(book))).toStrictEqual([{ width: 8, height: 12 }])
  })

  // 알아보지 못한 형식은 실패가 아니라 크기를 모르는 페이지다.
  test('a page in a format this viewer does not know leaves a hole', async () => {
    const book = await Effect.runPromise(
      bookFromStored({
        id: 'collected::1',
        title: 'collected',
        source: 'images',
        names: ['01.png', '02.png'],
        blobs: [new Blob([new Uint8Array([1, 2, 3])]), new Blob([new Uint8Array(PNG)])],
        createdAt: 0,
      }),
    )

    expect(await Effect.runPromise(measurePages(book))).toStrictEqual([
      null,
      { width: 8, height: 12 },
    ])
  })

  /**
   * 페이지를 뽑다가 실패해도 임포트를 멈추지 않는다. 한 장이 무너뜨리는 것은 그
   * 한 자리여야 한다 — 555장짜리 책이 한 장 때문에 통째로 들어오지 못하면 곤란하다.
   */
  test('a page that cannot even be read leaves a hole, not a failure', async () => {
    const book = await Effect.runPromise(
      bookFromStored({
        id: 'volume-1::1',
        title: 'volume-1',
        source: 'zip',
        names: ['volume-1.cbz'],
        // 아무도 모르는 압축 방식이라 뽑는 자리에서 실패한다.
        blobs: [zip(['01.png'], 99)],
        createdAt: 0,
      }),
    )

    expect(await Effect.runPromise(measurePages(book))).toStrictEqual([null])
  })
})
