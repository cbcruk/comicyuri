import { Schema, pipe } from 'effect'
import { Route } from 'foldkit'
import { defineRouteUnion, literal, slash, string } from 'foldkit/route'

/** Every place the application can be, decoded from the URL. */
export const AppRoute = defineRouteUnion({
  Shelf: {},
  Reader: { id: Schema.String },
  NotFound: { path: Schema.String },
})

/** The decoded value of the {@linkcode AppRoute} union. */
export type AppRoute = typeof AppRoute.Type

/** The shelf at the root path. Also the way back: calling it builds `/`. */
export const shelfRouter = pipe(Route.root, Route.mapTo(AppRoute.Shelf))

/** A book at `/book/:id`. */
export const readerRouter = pipe(literal('book'), slash(string('id')), Route.mapTo(AppRoute.Reader))

const routeParser = Route.oneOf(readerRouter, shelfRouter)

/**
 * Reads a URL into a route, answering `NotFound` with the path that failed
 * rather than throwing.
 */
export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)
