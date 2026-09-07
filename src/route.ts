import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, literal, slash, string } from 'foldkit/route'

export const AppRoute = defineRouteUnion({
  Shelf: {},
  Reader: { id: Schema.String },
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

export const shelfRouter = pipe(Route.root, Route.mapTo(AppRoute.Shelf))

export const readerRouter = pipe(literal('book'), slash(string('id')), Route.mapTo(AppRoute.Reader))

const routeParser = Route.oneOf(readerRouter, shelfRouter)

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)
