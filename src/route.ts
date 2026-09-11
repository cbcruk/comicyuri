import { Schema, pipe } from 'effect'
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

/** 루트 경로의 책장. 돌아가는 길이기도 하다 — 호출하면 `/`를 만든다. */
export const shelfRouter = pipe(Route.root, Route.mapTo(AppRoute.Shelf))

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
export const readerRouter = (id: string): string => readerRoute({ id: encodeSegment(id) })

const routeParser = Route.oneOf(readerRoute, shelfRouter)

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
 * URL을 라우트로 읽는다. 읽지 못하면 던지지 않고 그 경로를 담은 `NotFound`로
 * 답한다.
 */
export const urlToAppRoute = (url: Url): AppRoute =>
  AppRoute.match<AppRoute>(parseUrl(url), {
    Reader: ({ id }) => AppRoute.Reader({ id: decodeSegment(id) }),
    Shelf: () => AppRoute.Shelf(),
    NotFound: ({ path }) => AppRoute.NotFound({ path }),
  })
