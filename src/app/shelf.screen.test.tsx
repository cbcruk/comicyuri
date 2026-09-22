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

test('the header wears the logo, and the screen is still named for screen readers', async () => {
  const screen = await renderShelf()

  const logo = screen.container.querySelector('img[src$="logo.svg"]')
  if (!(logo instanceof HTMLImageElement)) throw new Error('로고가 없다')
  // 이름은 보이지 않는 `h1`이 말한다. 그림이 한 번 더 말하면 같은 이름이 둘 선다.
  expect(logo.alt).toBe('')
  await expect.poll(() => logo.naturalWidth).toBeGreaterThan(0)

  expect(screen.container.querySelector('h1')?.textContent).toBe('comicyuri')
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

/** 지울지 묻는 대화상자. 제목이 곧 물음이다. */
const question = (screen: RenderResult, title: string) =>
  screen.getByRole('alertdialog', { name: `Remove ${title}?` })

test('the bin asks rather than deletes, and keeping the book leaves the shelf as it was', async () => {
  await seed(record('volume-1', 1000))

  const screen = await renderShelf()
  await screen.getByRole('button', { name: 'Remove volume-1 from shelf…' }).click()

  await expect.element(question(screen, 'volume-1')).toBeVisible()
  // 아직 아무것도 지워지지 않았다. 대화상자 뒤는 닿지 않으므로 역할이 아니라 제목으로 찾는다.
  await expect.element(screen.getByTitle('volume-1')).toBeVisible()

  await question(screen, 'volume-1').getByRole('button', { name: 'Keep' }).click()

  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
  expect(question(screen, 'volume-1').elements()).toHaveLength(0)
})

test('removing a book from the shelf takes it out of the grid', async () => {
  await seed(record('volume-1', 1000), record('volume-2', 2000))

  const screen = await renderShelf()
  await screen.getByRole('button', { name: 'Remove volume-2 from shelf…' }).click()
  await question(screen, 'volume-2').getByRole('button', { name: 'Remove', exact: true }).click()

  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'volume-2' })).not.toBeInTheDocument()
  // 지우기가 끝나면 물음도 닫힌다.
  expect(question(screen, 'volume-2').elements()).toHaveLength(0)
})

test('the question is modal, so nothing else on the shelf can be reached until it is answered', async () => {
  await seed(record('volume-1', 1000), record('volume-2', 2000))

  const screen = await renderShelf()
  await screen.getByRole('button', { name: 'Remove volume-1 from shelf…' }).click()
  await expect.element(question(screen, 'volume-1')).toBeVisible()

  // 모달 대화상자 밖은 inert다. 다른 책을 열거나 다른 책의 🗑을 누를 길이 없으므로, 한 번에
  // 한 권만 묻고 답하기 전에는 그 책으로 들어갈 수도 없다.
  const dialog = question(screen, 'volume-1').element().closest('dialog')
  expect(dialog?.matches(':modal')).toBe(true)

  // 처음 손이 가는 곳은 지키는 쪽이다.
  await expect
    .element(question(screen, 'volume-1').getByRole('button', { name: 'Keep' }))
    .toHaveFocus()
})

test('a question and a panel left open are gone when the shelf is visited again', async () => {
  await seed(record('volume-1', 1000))

  // 앱처럼 레지스트리 하나를 두고 화면만 오간다. 책장 상태가 atom에 있어도 수명은 화면과
  // 같아야 한다 — 레지스트리가 살아 있다고 해서 물음이 남아서는 안 된다.
  const router = shelfRouter()
  const screen = await render(
    <RegistryProvider>
      <RouterProvider router={router} />
    </RegistryProvider>,
  )

  /** 다른 화면에 갔다가 책장으로 돌아온다. */
  const leaveAndComeBack = async () => {
    await router.navigate({ to: '/book/$id', params: { id: 'volume-1::1' } })
    await expect.element(screen.getByTitle('volume-1')).not.toBeInTheDocument()
    // 구독이 끊긴 atom을 레지스트리가 치우는 것은 다음 틱이다.
    await new Promise((resolve) => setTimeout(resolve, 50))

    await router.navigate({ to: '/' })
    await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
  }

  // 둘 다 모달이라 함께 열어 둘 수 없다. 하나씩 열어 두고 떠난다.
  await screen.getByRole('button', { name: 'Remove volume-1 from shelf…' }).click()
  await expect.element(question(screen, 'volume-1')).toBeVisible()
  await leaveAndComeBack()
  expect(question(screen, 'volume-1').elements()).toHaveLength(0)

  await screen.getByRole('button', { name: 'Reading settings' }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Reading settings', includeHidden: true }))
    .toHaveAttribute('aria-expanded', 'true')
  await leaveAndComeBack()
  await expect
    .element(screen.getByRole('button', { name: 'Reading settings' }))
    .toHaveAttribute('aria-expanded', 'false')
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
  await question(screen, 'volume-2').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect.element(screen.getByRole('link', { name: 'volume-2' })).not.toBeInTheDocument()

  // 남은 책은 같은 URL을 이어 쓴다. 다시 만들면 `img`가 표지를 다시 받아 그린다.
  expect(coverOf(screen, 'volume-1')).toBe(kept)
  expect(await isAlive(kept!)).toBe(true)

  // 밀려난 표지는 놓인다. 그러지 않으면 지운 책의 표지가 샌다.
  await expect.poll(() => isAlive(gone!)).toBe(false)
})

/** 한 픽셀짜리 진짜 PNG. 들여오기가 표지를 뜨고 크기를 재므로 그릴 수 있어야 한다. */
const PNG_BYTES =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const onePageFile = (): File =>
  new File([Uint8Array.from(atob(PNG_BYTES), (letter) => letter.codePointAt(0) ?? 0)], 'page.png', {
    type: 'image/png',
  })

/** 그 파일들을 책장 위에 떨어뜨린다. 파일이 없으면 `S-119`의 실패가 난다. */
const dropOn = (main: Element, files: ReadonlyArray<File>): void => {
  const carried = new DataTransfer()
  for (const file of files) carried.items.add(file)
  main.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: carried }))
}

test('a failure that arrived during an import survives it finishing', async () => {
  const screen = await renderShelf()
  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()

  const main = screen.getByRole('main', { name: 'Shelf' }).element()

  dropOn(main, [onePageFile()])
  // 들여오기는 이 줄에 오기 전에 이미 `await`에 걸려 있다. 같은 턴에 떨어뜨리므로
  // 실패는 반드시 들여오기가 도는 도중에 선다.
  dropOn(main, [])

  const failure = screen.getByText("Couldn't do that — Only files can be dropped here")
  await expect.element(failure).toBeVisible()

  // 들여오기가 끝난다. 끝난 작업은 자기가 세운 대기만 거두어야지, 그 사이에 들어온
  // 실패까지 지워서는 안 된다(`F-503`).
  await expect.element(screen.getByRole('link', { name: 'Imported images' })).toBeVisible()
  await expect.element(failure).toBeVisible()
})
