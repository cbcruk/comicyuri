/**
 * 앱이 있을 수 있는 자리. Foldkit의 `route.ts`가 정하던 것과 같은 세 자리다.
 *
 * 경로는 앱이 놓인 곳 아래에 선다. GitHub Pages에서는 저장소 이름 아래이므로
 * (`/comicyuri/`), 라우터의 `basepath`가 그것을 맡는다(`N-407`).
 */

import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/react-router'

import { ReaderScreen } from './reader.tsx'
import { useDocumentTitle } from './title.ts'
import { ShelfScreen } from './shelf.tsx'

/**
 * 아무 라우트도 맞지 않는 주소. 무엇을 찾으려 했는지 보여 주고 책장으로 돌아갈 길을 준다.
 *
 * 돌아가는 링크는 라우터가 짓는다. 그래야 저장소 이름 아래에 놓였을 때도 그 아래를
 * 가리킨다(`N-407`).
 */
const NotFound = () => {
  useDocumentTitle('comicyuri — not found')

  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <h1 className="text-lg font-medium">Nothing here</h1>
      <p className="text-sm text-muted">{window.location.pathname}</p>
      <Link
        to="/"
        className="text-sm text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Back to the shelf
      </Link>
    </main>
  )
}

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound })

const shelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ShelfScreen,
})

/**
 * 책 하나를 읽는 자리. 책 id는 콜론을 그대로 쓰므로(`volume-1::42`) 경로 조각에서도
 * 그대로 읽힌다.
 */
const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/book/$id',
  component: () => {
    const { id } = useParams({ from: '/book/$id' })
    return <ReaderScreen bookId={decodeURIComponent(id)} />
  },
})

const routeTree = rootRoute.addChildren([shelfRoute, readerRoute])

/** 앱이 놓인 경로. 끝의 슬래시는 뗀다 — 루트면 `/`, 저장소 아래면 `/comicyuri`다. */
const basepath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export const router = createRouter({ routeTree, basepath })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
