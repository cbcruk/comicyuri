/**
 * 책장 화면 테스트. 실제 Chromium에서 진짜 IndexedDB를 두고 세워 본다.
 *
 * Foldkit scene 테스트가 하던 일을 이것이 이어받는다. 저장소를 가짜로 바꾸지 않는
 * 이유는 책장이 저장소에서 정해지는 것들 — 최근 것이 앞이라는 순서(`S-102`)와, 지운
 * 책이 돌아오지 않는다는 것(`S-131`) — 을 함께 보기 위해서다.
 */

import { Effect } from 'effect'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render } from 'vitest-browser-react'
import type { RenderResult } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test } from 'vite-plus/test'

import { RegistryProvider } from '@effect/atom-react'

import { deleteBook, getAllBooks, putBook } from '../io/db.ts'
import type { StoredBook } from '../io/db.ts'
import { ShelfScreen } from './shelf.tsx'

/** 한 쪽짜리 책 레코드. 바이트는 이 테스트가 열어 보지 않으므로 빈 blob이면 된다. */
const record = (title: string, createdAt: number): StoredBook => ({
  id: `${title}::1`,
  title,
  source: 'images',
  names: [`${title}.png`],
  blobs: [new Blob([], { type: 'image/png' })],
  createdAt,
  pageCount: 1,
})

const clearShelf = Effect.gen(function* () {
  const books = yield* getAllBooks
  yield* Effect.forEach(books, ({ id }) => deleteBook(id), { discard: true })
})

const seed = (...books: ReadonlyArray<StoredBook>) =>
  Effect.runPromise(Effect.forEach(books, putBook, { discard: true }))

/**
 * 책장만 세운 라우터. 카드의 링크가 가리키는 자리가 라우터에 있어야 `href`가 선다.
 *
 * 앱의 라우터(`router.tsx`)를 쓰지 않는 것은 그쪽이 리더까지 함께 세우기 때문이다.
 * 여기서 보는 것은 책장뿐이다.
 */
const shelfRouter = () => {
  const rootRoute = createRootRoute({ component: Outlet })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: ShelfScreen }),
    createRoute({ getParentRoute: () => rootRoute, path: '/book/$id', component: () => null }),
  ])

  return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
}

const renderShelf = () =>
  render(
    <RegistryProvider>
      <RouterProvider router={shelfRouter()} />
    </RegistryProvider>,
  )

beforeEach(() => Effect.runPromise(clearShelf))

// 테마는 문서와 `localStorage`에 남는다. 다음 테스트가 어두운 채로 시작하도록 되돌린다.
afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset['theme']
})

test('an empty shelf says so', async () => {
  const screen = await renderShelf()

  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()
})

test('books are listed newest first, each a link named after it', async () => {
  await seed(record('volume-1', 1000), record('volume-2', 2000))

  const screen = await renderShelf()

  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'volume-2' })).toBeVisible()

  const titles = screen
    .getByRole('link')
    .elements()
    .map((link) => link.getAttribute('aria-label'))

  expect(titles).toEqual(['volume-2', 'volume-1'])
})

test('a single-page book is not announced as "1 pages"', async () => {
  await seed(record('volume-1', 1000))

  const screen = await renderShelf()

  await expect.element(screen.getByText('1 page')).toBeVisible()
})

test('the bin asks rather than deletes, and keeping the book leaves the shelf as it was', async () => {
  await seed(record('volume-1', 1000))

  const screen = await renderShelf()
  await screen.getByRole('button', { name: 'Remove volume-1 from shelf…' }).click()

  await expect.element(screen.getByRole('group', { name: 'Remove volume-1?' })).toBeVisible()
  // 아직 아무것도 지워지지 않았다. 묻는 동안 링크는 `inert`라 역할로는 찾을 수 없다.
  await expect.element(screen.getByTitle('volume-1')).toBeVisible()

  await screen.getByRole('button', { name: 'Keep volume-1' }).click()

  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'Remove volume-1?' }).elements()).toHaveLength(0)
})

test('removing a book from the shelf takes it out of the grid', async () => {
  await seed(record('volume-1', 1000), record('volume-2', 2000))

  const screen = await renderShelf()
  await screen.getByRole('button', { name: 'Remove volume-2 from shelf…' }).click()
  await screen.getByRole('button', { name: 'Remove volume-2 from shelf', exact: true }).click()

  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'volume-2' })).not.toBeInTheDocument()
})

test('the question stands on one card only', async () => {
  await seed(record('volume-1', 1000), record('volume-2', 2000))

  const screen = await renderShelf()
  await screen.getByRole('button', { name: 'Remove volume-1 from shelf…' }).click()
  await expect.element(screen.getByRole('group', { name: 'Remove volume-1?' })).toBeVisible()

  await screen.getByRole('button', { name: 'Remove volume-2 from shelf…' }).click()

  await expect.element(screen.getByRole('group', { name: 'Remove volume-2?' })).toBeVisible()
  expect(screen.getByRole('group', { name: 'Remove volume-1?' }).elements()).toHaveLength(0)
})

test('the theme toggle says where it will take you and applies it', async () => {
  const screen = await renderShelf()

  await screen.getByRole('button', { name: 'Switch to light theme' }).click()

  await expect.element(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()
  expect(document.documentElement.dataset['theme']).toBe('light')
})

test('a drop carrying no files is reported rather than imported', async () => {
  const screen = await renderShelf()

  screen
    .getByRole('main', { name: 'Shelf' })
    .element()
    .dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: new DataTransfer() }))

  await expect
    .element(screen.getByText("Couldn't do that — Only files can be dropped here"))
    .toBeVisible()
  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()
})

/** 표지를 지닌 레코드. 바이트는 `createObjectURL`이 읽지 않으므로 무엇이든 된다. */
const withCover = (book: StoredBook): StoredBook => ({
  ...book,
  cover: new Blob(['cover'], { type: 'image/webp' }),
})

const coverOf = (screen: RenderResult, title: string): string | null =>
  screen.getByRole('link', { name: title }).element().querySelector('img')?.src ?? null

/** 그 object URL이 아직 살아 있는지. 놓아 준 URL은 `fetch`가 거절한다. */
const isAlive = (url: string): Promise<boolean> =>
  fetch(url).then(
    () => true,
    () => false,
  )

test('a cover that both shelves hold is not dropped, and only the one that left is', async () => {
  await seed(withCover(record('volume-1', 1000)), withCover(record('volume-2', 2000)))

  const screen = await renderShelf()
  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()

  const kept = coverOf(screen, 'volume-1')
  const gone = coverOf(screen, 'volume-2')
  expect(kept).toMatch(/^blob:/)
  expect(gone).toMatch(/^blob:/)

  await screen.getByRole('button', { name: 'Remove volume-2 from shelf…' }).click()
  await screen.getByRole('button', { name: 'Remove volume-2 from shelf', exact: true }).click()
  await expect.element(screen.getByRole('link', { name: 'volume-2' })).not.toBeInTheDocument()

  // 남은 책은 같은 URL을 이어 쓴다. 다시 만들면 `img`가 표지를 다시 받아 그린다.
  expect(coverOf(screen, 'volume-1')).toBe(kept)
  expect(await isAlive(kept!)).toBe(true)

  // 밀려난 표지는 놓인다. 그러지 않으면 지운 책의 표지가 샌다.
  await expect.poll(() => isAlive(gone!)).toBe(false)
})
