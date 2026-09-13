import { Option, Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, literal, slash, string } from 'foldkit/route'
import type { Url } from 'foldkit/url'

/** 애플리케이션이 있을 수 있는 모든 자리. URL에서 디코딩한다. */
export const AppRoute = defineRouteUnion({
  Shelf: {},
  Reader: { id: Schema.String },
  NotFound: { path: Schema.String },
})

/** {@linkcode AppRoute} 유니온의 디코딩된 값. */
export type AppRoute = typeof AppRoute.Type

/**
 * 앱이 놓인 경로. 끝의 슬래시는 뗀다 — 루트에 놓이면 `''`, GitHub Pages처럼
 * 저장소 이름 아래에 놓이면 `/comicyuri`다.
 *
 * 라우트는 이것을 모른다. 경로를 만들 때 앞에 붙이고, 읽기 전에 떼어 낸다.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const underBase = (path: string): string => `${BASE}${path}`

const shelfRoute = pipe(Route.root, Route.mapTo(AppRoute.Shelf))

/** 책장의 경로를 만든다. 앱이 놓인 곳의 루트이고, 리더에서 돌아가는 길이기도 하다. */
export const shelfRouter = (): string => underBase(shelfRoute())

const readerRoute = pipe(literal('book'), slash(string('id')), Route.mapTo(AppRoute.Reader))

/**
 * 책 id 하나를 경로 조각으로 만든다. 콜론은 경로 조각에 그대로 설 수 있으므로
 * 되돌려 둔다 — `volume-1::42`가 `volume-1%3A%3A42`보다 읽기 좋고, 이미 나가
 * 있는 링크와도 같은 모양이다.
 */
const encodeSegment = (value: string): string => encodeURIComponent(value).replaceAll('%3A', ':')

/**
 * `/book/:id`의 책 한 권. 책 id를 받아 그 경로를 만든다.
 *
 * 책 id에는 파일 이름이 그대로 들어 있어서 띄어쓰기도 한글도 슬래시도 섞일 수
 * 있다. 경로에 실을 때 한 조각으로 인코딩하고, {@linkcode urlToAppRoute}가
 * 되돌린다. 인코딩하지 않으면 브라우저가 대신 인코딩해 버리고, 그렇게 들어온
 * `%20`은 저장된 id와 다른 id가 되어 책을 찾지 못한다.
 */
export const readerRouter = (id: string): string =>
  underBase(readerRoute({ id: encodeSegment(id) }))

const routeParser = Route.oneOf(readerRoute, shelfRoute)

const parseUrl = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)

/**
 * 경로 조각 하나를 되돌린다. 손으로 고친 URL에는 `%zz`처럼 인코딩이 깨진 것이
 * 올 수 있으므로, 되돌리지 못하면 적힌 그대로 쓴다.
 */
const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * URL에서 앱이 놓인 경로를 떼어 낸다. 그 아래가 아니면 `None`이다.
 *
 * `/comicyuri`처럼 끝의 슬래시 없이 온 것도 앱의 루트로 친다.
 */
const withoutBase = (url: Url): Option.Option<Url> => {
  if (url.pathname === BASE) {
    return Option.some({ ...url, pathname: '/' })
  }
  return url.pathname.startsWith(`${BASE}/`)
    ? Option.some({ ...url, pathname: url.pathname.slice(BASE.length) })
    : Option.none()
}

/**
 * URL을 라우트로 읽는다. 읽지 못하면 던지지 않고 `NotFound`로 답한다.
 *
 * `NotFound`에 담기는 경로는 주소창에 보이는 그대로다. 앱이 놓인 경로를 떼지
 * 않는다.
 */
export const urlToAppRoute = (url: Url): AppRoute =>
  Option.match(withoutBase(url), {
    onNone: () => AppRoute.NotFound({ path: url.pathname }),
    onSome: (inside) =>
      AppRoute.match<AppRoute>(parseUrl(inside), {
        Reader: ({ id }) => AppRoute.Reader({ id: decodeSegment(id) }),
        Shelf: () => AppRoute.Shelf(),
        NotFound: () => AppRoute.NotFound({ path: url.pathname }),
      }),
  })
