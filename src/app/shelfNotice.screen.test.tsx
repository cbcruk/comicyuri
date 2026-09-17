/**
 * 책장의 상태 줄과 실패를 재는 화면 테스트. 실제 Chromium에서 책장을 세운다.
 *
 * 이웃한 `shelf.screen.test.tsx`는 진짜 IndexedDB를 두지만 여기서는 가짜를 세운다.
 * 재는 것이 저장소가 거절했을 때의 화면이라서다 — 책장을 읽지 못한 자리(`F-504`),
 * 다시 읽기가 실패한 자리(`F-505`), 지우지 못한 자리(`S-133`)는 진짜 저장소로는
 * 만들 수 없다. 가짜는 `put`을 늦출 수도 있어서, 임포트가 도는 동안의 상태 줄
 * (`S-116`, `F-503`)도 이 자리에서 볼 수 있다.
 *
 * 앱에는 아무 손잡이도 새로 내지 않았다. 갈아 끼우는 것은 브라우저의 `indexedDB`
 * 하나이고, `src/io/db.ts`가 보는 것이 그것뿐이기 때문이다.
 */

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
import { afterEach, expect, test } from 'vite-plus/test'

import { RegistryProvider } from '@effect/atom-react'

import type { StoredBook } from '../io/db.ts'
import { ShelfScreen } from './shelf.tsx'

/** 실패가 상태 줄에 머무는 시간(밀리초). `shelfAtoms.ts`의 `NOTICE_LINGER`와 같다. */
const LINGER_MS = 4000

/** 한 점짜리 투명 PNG. 임포트가 열어 보고 재고 표지까지 뜨는 진짜 바이트다. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const pngBytes = (): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(PNG), (char) => char.charCodeAt(0))

/** 들여올 이미지 파일 하나. 이것 하나로 "Imported images" 한 권이 선다. */
const pngFile = (name: string): File => new File([pngBytes()], name, { type: 'image/png' })

/** 저장소에 이미 놓여 있는 책 한 권. */
const record = (title: string, createdAt: number): StoredBook => ({
  id: `${title}::1`,
  title,
  source: 'images',
  names: [`${title}.png`],
  blobs: [new Blob([pngBytes()], { type: 'image/png' })],
  createdAt,
  pageCount: 1,
})

/** 시험이 조종하는 가짜 저장소. */
type Store = Readonly<{
  /** 이 이름의 호출은 실패한다. 도중에 바꿔 걸 수 있다 — `F-505`가 그렇게 쓴다. */
  fail: (op: string | null) => void
  /** `put`이 답하기까지 끄는 시간(밀리초). 임포트를 붙잡아 두는 데 쓴다. */
  slowPut: (ms: number) => void
}>

/**
 * 브라우저의 `indexedDB`를 가짜로 바꾸고, 그것을 조종할 손잡이를 돌려준다.
 *
 * `db.ts`가 보는 것은 `open`과 요청 객체의 `onsuccess`·`onerror`뿐이므로, 그
 * 모양만 갖춘다. 진짜 스토어의 나머지 규약은 여기서 잴 것이 없다.
 *
 * @param rows 저장소가 이미 쥐고 있는 책들.
 */
const fakeStore = (rows: ReadonlyArray<StoredBook> = []): Store => {
  let kept: StoredBook[] = [...rows]
  let failing: string | null = null
  let putDelayMs = 0

  const requestFor = (op: string, run: () => unknown): Record<string, unknown> => {
    const request: Record<string, unknown> = { result: undefined, error: new Error(op) }

    setTimeout(
      () => {
        if (failing === op) {
          const onerror = request['onerror']
          if (typeof onerror === 'function') onerror()
          return
        }
        request['result'] = run()
        const onsuccess = request['onsuccess']
        if (typeof onsuccess === 'function') onsuccess()
      },
      op === 'put' ? putDelayMs : 0,
    )

    return request
  }

  const store = {
    getAll: () => requestFor('getAll', () => [...kept]),
    put: (value: StoredBook) =>
      requestFor('put', () => {
        kept = [...kept.filter((row) => row.id !== value.id), value]
        return undefined
      }),
    delete: (id: string) =>
      requestFor('delete', () => {
        kept = kept.filter((row) => row.id !== id)
        return undefined
      }),
  }

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    transaction: () => ({ objectStore: () => store }),
    close: () => undefined,
  }

  const factory = {
    open: () => requestFor('open', () => db),
  }

  Object.defineProperty(globalThis, 'indexedDB', { value: factory, configurable: true })

  return {
    fail: (op) => {
      failing = op
    },
    slowPut: (ms) => {
      putDelayMs = ms
    },
  }
}

/**
 * 책장만 세운 라우터. 카드의 링크가 가리키는 자리가 라우터에 있어야 `href`가 선다.
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

/**
 * 상태 줄이 지금 하는 말. 할 말이 없으면 빈 문자열이다.
 *
 * 역할로 찾지 않는 것은 Astryx의 버튼마다 제 live region을 달고 있어서다. 책장의
 * 상태 줄은 그 가운데 문단인 하나다.
 */
const noticeText = (screen: RenderResult): string =>
  screen.container.querySelector('p[role="status"]')?.textContent ?? ''

/** 책장 위에 파일을 떨어뜨린다. 파일이 없는 드롭은 실패로 보고된다(`S-119`). */
const drop = (screen: RenderResult, files: ReadonlyArray<File>): void => {
  const dataTransfer = new DataTransfer()
  for (const file of files) dataTransfer.items.add(file)

  screen
    .getByRole('main', { name: 'Shelf' })
    .element()
    .dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }))
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

afterEach(() => {
  // 가짜를 치우면 프로토타입의 진짜 `indexedDB`가 다시 드러난다.
  Reflect.deleteProperty(globalThis, 'indexedDB')
  localStorage.clear()
  delete document.documentElement.dataset['theme']
})

test('the line says it is importing, and says nothing once the book is in', async () => {
  const store = fakeStore()
  store.slowPut(600)

  const screen = await renderShelf()
  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()

  drop(screen, [pngFile('page-1.png')])

  await expect.poll(() => noticeText(screen)).toBe('Importing…')

  // 책이 서는 것은 임포트가 책장을 다시 읽으라고 말한 때이고, 상태 줄이 말을
  // 거두는 것은 그 뒤다.
  await expect.element(screen.getByRole('link', { name: 'Imported images' })).toBeVisible()
  await expect.poll(() => noticeText(screen)).toBe('')
}, 15_000)

test('cancelling the picker imports nothing and says nothing', async () => {
  fakeStore()

  const screen = await renderShelf()
  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()

  // 자동화된 브라우저는 파일 선택창을 띄우자마자 물린다. 그것이 곧 취소이고,
  // 선택기는 `cancel`을 받아 빈 목록으로 답한다 — 여기서 재려는 그 길이다.
  await screen.getByRole('button', { name: 'Open files' }).click()

  // 아무 일도 없다는 것은 기다려 보아야 보인다. 들여오기가 시작됐다면 이 사이에
  // 상태 줄이 무슨 말이든 했을 것이다.
  await wait(300)
  expect(noticeText(screen)).toBe('')
  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()

  // 답을 받은 선택기는 자기가 세운 `input`을 치운다. 떠도는 입력은 남지 않는다(`S-111`).
  expect(document.querySelectorAll('input[type="file"]').length).toBe(0)
})

test('a failed delete is reported and the book stays', async () => {
  const store = fakeStore([record('volume-1', 1000)])
  store.fail('delete')

  const screen = await renderShelf()
  await screen.getByRole('button', { name: 'Remove volume-1 from shelf…' }).click()
  await screen
    .getByRole('alertdialog', { name: 'Remove volume-1?' })
    .getByRole('button', { name: 'Remove', exact: true })
    .click()

  await expect
    .element(screen.getByText("Couldn't do that — Shelf storage is unavailable (delete)"))
    .toBeVisible()
  // 지우지 못한 책은 책장에 그대로 있다.
  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
})

test('a failure does not inherit the time left on the one before it', async () => {
  fakeStore()

  const screen = await renderShelf()
  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()

  drop(screen, [])
  await expect.poll(() => noticeText(screen)).not.toBe('')

  // 앞선 실패가 제 4초를 절반쯤 쓴 자리에서 새 실패가 들어온다.
  await wait(LINGER_MS / 2)
  drop(screen, [])

  // 앞선 실패의 4초가 지난 뒤에도 뒤의 실패는 남아 있어야 한다. 물려받았다면
  // 여기서 이미 지워져 있다.
  await wait(LINGER_MS / 2 + 300)
  expect(noticeText(screen)).toBe("Couldn't do that — Only files can be dropped here")

  // 그리고 자기 4초를 다 쓰면 스스로 사라진다(`F-501`).
  await expect.poll(() => noticeText(screen), { timeout: LINGER_MS }).toBe('')
}, 20_000)

test('an import that took the line over is not cleared by the wait of the failure before it', async () => {
  const store = fakeStore()
  // 앞선 실패의 4초가 지나도록 임포트가 계속 돌고 있어야 한다.
  store.slowPut(LINGER_MS + 1500)

  const screen = await renderShelf()
  await expect.element(screen.getByText('Your shelf is empty')).toBeVisible()

  drop(screen, [])
  await expect.poll(() => noticeText(screen)).not.toBe('')

  drop(screen, [pngFile('page-1.png')])
  await expect.poll(() => noticeText(screen)).toBe('Importing…')

  // 앞선 실패가 걸어 둔 대기가 여기서 내려앉는다. 그것이 상태 줄을 지운다면
  // 도는 중이라는 말이 사라진다.
  await wait(LINGER_MS + 300)
  expect(noticeText(screen)).toBe('Importing…')

  await expect.element(screen.getByRole('link', { name: 'Imported images' })).toBeVisible()
}, 20_000)

test('a shelf that failed to open says so instead of showing an empty grid', async () => {
  const store = fakeStore()
  store.fail('getAll')

  const screen = await renderShelf()

  await expect
    .element(screen.getByText("Couldn't open your shelf — Shelf storage is unavailable (getAll)"))
    .toBeVisible()
  expect(screen.getByText('Your shelf is empty').query()).toBeNull()
})

test('a reload that fails keeps the books it already had', async () => {
  const store = fakeStore([record('volume-1', 1000), record('volume-2', 2000)])

  const screen = await renderShelf()
  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()

  // 지우기는 성공하고, 그것이 부른 다시 읽기만 실패한다.
  store.fail('getAll')
  await screen.getByRole('button', { name: 'Remove volume-2 from shelf…' }).click()
  await screen
    .getByRole('alertdialog', { name: 'Remove volume-2?' })
    .getByRole('button', { name: 'Remove', exact: true })
    .click()

  // 다시 읽지 못했다고 해서 화면이 비지 않는다. 읽어 둔 책장이 그대로 선다.
  await wait(300)
  await expect.element(screen.getByRole('link', { name: 'volume-1' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'volume-2' })).toBeVisible()
  expect(
    screen.getByText("Couldn't open your shelf — Shelf storage is unavailable (getAll)").query(),
  ).toBeNull()
})
