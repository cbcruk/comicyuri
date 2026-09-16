/**
 * 앱이 있을 수 있는 자리. Foldkit의 `route.ts`가 정하던 것과 같은 세 자리다.
 *
 * 경로는 앱이 놓인 곳 아래에 선다. GitHub Pages에서는 저장소 이름 아래이므로
 * (`/comicyuri/`), 라우터의 `basepath`가 그것을 맡는다(`N-407`).
 */

import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/react-router'

import { ReaderScreen } from './reader.tsx'
import { ShelfScreen } from './shelf.tsx'

const rootRoute = createRootRoute({ component: Outlet })

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
