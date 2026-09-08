import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, literal, slash, string } from 'foldkit/route'

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

/** `/book/:id`의 책 한 권. */
export const readerRouter = pipe(literal('book'), slash(string('id')), Route.mapTo(AppRoute.Reader))

const routeParser = Route.oneOf(readerRouter, shelfRouter)

/**
 * URL을 라우트로 읽는다. 읽지 못하면 던지지 않고 그 경로를 담은 `NotFound`로
 * 답한다.
 */
export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)
