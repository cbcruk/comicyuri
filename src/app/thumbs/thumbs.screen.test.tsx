/**
 * 썸네일 격자 화면 테스트. 실제 Chromium에서 격자를 세우고 눌러 본다.
 *
 * Foldkit의 scene 테스트가 하던 일을 이것이 이어받는다. 페이지를 가짜로 바꾸지
 * 않는 이유는 격자가 보는 것이 스테이지와 같은 페이지 atom이기 때문이다 — 진짜
 * 책을 저장소에 두면 칸이 서는 것이 곧 그 페이지를 뽑는 것인지까지 함께 볼 수 있다.
 *
 * 창(window) 처리는 레이아웃이 정하므로 브라우저에서만 드러난다. 그래서 몇 칸이
 * 서고 몇 칸이 서지 않는지를 여기서 본다(`R-272`, `R-276`).
 */

import { Effect } from 'effect'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test, vi } from 'vite-plus/test'

import { deleteBook, getAllBooks, putBook } from '../../io/db.ts'
import type { StoredBook } from '../../io/db.ts'
import { cellWidthFor, perRowFor, rowHeightFor } from '../../reader/thumbs.ts'
// 격자는 자리를 재어 창을 잡으므로 스타일이 서야 한다. 스타일 없이는 모든 칸이
// 한꺼번에 서고, 그러면 볼 것이 없다.
import '../../styles.css'
import { Providers } from '../providers.tsx'
import { ThumbsPanel } from './thumbs.tsx'
import type { ThumbsProps } from './thumbs.tsx'

/** 한 점짜리 투명 PNG. `<img>`가 실제로 그릴 수 있는 바이트여야 한다. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const pngBlob = (): Blob =>
  new Blob([Uint8Array.from(atob(PNG), (char) => char.charCodeAt(0))], { type: 'image/png' })

/** 낱장 이미지로 들여온 책 한 권. 페이지마다 같은 한 점짜리 PNG를 둔다. */
const record = (id: string, pageCount: number): StoredBook => ({
  id,
  title: id,
  source: 'images',
  names: Array.from({ length: pageCount }, (_, page) => `page-${page + 1}.png`),
  blobs: Array.from({ length: pageCount }, pngBlob),
  createdAt: 1000,
  pageCount,
})

const clearShelf = Effect.gen(function* () {
  const books = yield* getAllBooks
  yield* Effect.forEach(books, ({ id }) => deleteBook(id), { discard: true })
})

const seed = (book: StoredBook) => Effect.runPromise(putBook(book).pipe(Effect.as(book.id)))

/** 격자가 설 자리. 리더의 스테이지처럼 크기를 지닌 `relative` 상자다. */
const STAGE = { position: 'relative', width: '600px', height: '600px' } as const

const renderThumbs = async (
  bookId: string,
  props: Partial<ThumbsProps> = {},
): Promise<{
  screen: Awaited<ReturnType<typeof render>>
  actions: Pick<ThumbsProps, 'onSelect' | 'onToggleBookmarksOnly' | 'onRemoveBookmark' | 'onClose'>
}> => {
  const actions = {
    onSelect: vi.fn(),
    onToggleBookmarksOnly: vi.fn(),
    onRemoveBookmark: vi.fn(),
    onClose: vi.fn(),
  }

  const screen = await render(
    <Providers>
      <div style={STAGE}>
        <ThumbsPanel
          bookId={bookId}
          pageCount={6}
          bookmarks={[]}
          showsBookmarksOnly={false}
          {...actions}
          {...props}
        />
      </div>
    </Providers>,
  )

  return { screen, actions }
}

/** 지금 DOM에 서 있는 칸들. 창 밖의 페이지는 여기 없다. */
const cells = (container: HTMLElement): ReadonlyArray<HTMLElement> => [
  ...container.querySelectorAll<HTMLElement>('[aria-label^="Go to page "]'),
]

/** 격자가 스스로 잰 너비. 세로 막대가 서면 창 너비보다 좁다. */
const measuredWidth = (container: HTMLElement): number =>
  container.querySelector('#reader-thumbs')?.clientWidth ?? 0

const rows = (container: HTMLElement): ReadonlyArray<HTMLElement> => [
  ...container.querySelectorAll<HTMLElement>('[data-thumb-row]'),
]

beforeEach(() => Effect.runPromise(clearShelf))

test('the grid stands a cell for every page and fills each with its thumbnail', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen } = await renderThumbs(bookId)

  await expect.element(screen.getByRole('dialog', { name: 'Every page' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Go to page 1' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Go to page 6' })).toBeVisible()

  // 칸이 서는 것이 곧 그 페이지를 뽑는 것이다. 뽑히면 자리를 지키던 상자가
  // 이미지로 바뀐다.
  await expect.poll(() => screen.container.querySelectorAll('img').length).toBe(6)
  for (const image of screen.container.querySelectorAll('img')) {
    expect(image.src).toMatch(/^blob:/)
  }
})

test('a long book stands only the rows around the window, not all of it', async () => {
  const bookId = await seed(record('volume-long', 500))

  const { screen } = await renderThumbs(bookId, { pageCount: 500 })

  // 500쪽 책에서는 "Go to page 1"이 "Go to page 10"에도 걸린다.
  await expect
    .element(screen.getByRole('button', { name: 'Go to page 1', exact: true }))
    .toBeVisible()

  const standing = cells(screen.container)
  const perRow = perRowFor(measuredWidth(screen.container))
  const onScreen = Math.ceil(600 / rowHeightFor(measuredWidth(screen.container)))

  expect(standing.length).toBeGreaterThan(perRow)
  // 보이는 행에 앞뒤 두 행씩을 더한 것이 창이다. 500장이 한꺼번에 서지 않는다.
  expect(standing.length).toBeLessThanOrEqual((onScreen + 1 + 2 * 2) * perRow)
  await expect
    .element(screen.getByRole('button', { name: 'Go to page 500' }))
    .not.toBeInTheDocument()
})

test('the row stands as many columns as the measured width allows', async () => {
  const bookId = await seed(record('volume-1', 24))

  const { screen } = await renderThumbs(bookId, { pageCount: 24 })

  await expect
    .element(screen.getByRole('button', { name: 'Go to page 1', exact: true }))
    .toBeVisible()

  const width = measuredWidth(screen.container)
  const [first, second] = rows(screen.container)

  expect(first?.children.length).toBe(perRowFor(width))
  expect(Math.round(first?.children[0]?.getBoundingClientRect().width ?? 0)).toBe(
    cellWidthFor(width),
  )

  // 행의 높이도 같은 너비에서 나온다. 리스트가 잡은 자리와 그려진 높이가 어긋나면
  // 행이 겹치거나 벌어진다(`R-276`).
  const top = first?.getBoundingClientRect().top ?? 0
  const next = second?.getBoundingClientRect().top ?? 0
  expect(Math.round(next - top)).toBe(rowHeightFor(width))
})

test('picking a page from the grid reports it', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen, actions } = await renderThumbs(bookId)
  await screen.getByRole('button', { name: 'Go to page 3' }).click()

  expect(actions.onSelect).toHaveBeenCalledWith(2)
})

test('the grid can be narrowed to what is bookmarked', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen } = await renderThumbs(bookId, {
    bookmarks: [0, 2],
    showsBookmarksOnly: true,
  })

  await expect.element(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Go to page 1' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Go to page 3' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Go to page 2' }).elements()).toHaveLength(0)
})

test('a book with nothing bookmarked says so instead of showing an empty grid', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen } = await renderThumbs(bookId, { showsBookmarksOnly: true })

  await expect.element(screen.getByText('Nothing is bookmarked in this book yet')).toBeVisible()
  expect(cells(screen.container)).toHaveLength(0)
})

test('each entry in the bookmark list drops its own bookmark, and the grid has none to drop', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen, actions } = await renderThumbs(bookId, {
    bookmarks: [0, 2],
    showsBookmarksOnly: true,
  })
  await screen.getByRole('button', { name: 'Remove the bookmark on page 3' }).click()

  expect(actions.onRemoveBookmark).toHaveBeenCalledWith(2)
  // 고른 것이 아니라 지운 것이다. 어디로도 가지 않는다.
  expect(actions.onSelect).not.toHaveBeenCalled()

  await screen.getByRole('button', { name: 'Show all pages' }).click()
  expect(actions.onToggleBookmarksOnly).toHaveBeenCalled()
})

test('the whole grid offers no way to drop a bookmark, only the list does', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen } = await renderThumbs(bookId, { bookmarks: [0] })

  await expect.element(screen.getByRole('button', { name: 'Go to page 1' })).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Remove the bookmark on page 1' }).elements(),
  ).toHaveLength(0)
  await expect.element(screen.getByRole('button', { name: 'Show bookmarks only' })).toBeVisible()
})

/** 테두리가 없는 칸의 색. 크로미움은 `transparent`를 이렇게 적는다. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

test('a bookmarked page is marked out from the rest in the grid', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen } = await renderThumbs(bookId, { bookmarks: [2] })

  await expect.element(screen.getByRole('button', { name: 'Go to page 3' })).toBeVisible()

  const marked = getComputedStyle(screen.getByRole('button', { name: 'Go to page 3' }).element())
  const plain = getComputedStyle(screen.getByRole('button', { name: 'Go to page 4' }).element())

  // 강조색은 같은 칸의 글자에도 걸려 있으므로, 색 값을 적어 두지 않고 그것과 견준다.
  expect(marked.borderTopColor).toBe(marked.color)
  expect(marked.borderTopColor).not.toBe(TRANSPARENT)
  // 나머지 칸은 테두리가 없다. 자리는 잡되 보이지 않아야 격자가 흔들리지 않는다.
  expect(plain.borderTopColor).toBe(TRANSPARENT)
})

test('closing the grid is asked of the parent', async () => {
  const bookId = await seed(record('volume-1', 6))

  const { screen, actions } = await renderThumbs(bookId)
  await screen.getByRole('button', { name: 'Close' }).click()

  expect(actions.onClose).toHaveBeenCalled()
})
