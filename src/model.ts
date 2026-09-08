import { Schema } from 'effect'
import { AsyncData } from 'foldkit'
import { defineTaggedUnion } from 'foldkit/schema'

import { FileDrop } from '@foldkit/ui'

import { BookSummary } from './domain/book.ts'
import { Reader } from './page/index.ts'
import { AppRoute } from './route.ts'
import { Settings } from './types.ts'

/**
 * The shelf is remote data, so it carries its own loading and failure states.
 * `Refreshing` is the point: a reload after an import or a delete keeps the
 * books that are already on screen instead of blanking the grid.
 */
export const Shelf = AsyncData.Schema(Schema.Array(BookSummary), Schema.String)

/** The decoded value of the {@linkcode Shelf} schema. */
export type Shelf = typeof Shelf.schema.Type

/**
 * What the status line is saying about an operation the reader started —
 * an import running, or one that failed. Distinct from the shelf's own load
 * state, which lives in `shelf`.
 */
export const Notice = defineTaggedUnion({
  Idle: {},
  Busy: { text: Schema.String },
  /**
   * `token` names the wait started for this message. A wait started by an
   * earlier failure carries an older token and is ignored when it lands, so it
   * cannot cut a newer message short.
   */
  Failed: { text: Schema.String, token: Schema.Number },
})

/** The decoded value of the {@linkcode Notice} union. */
export type Notice = typeof Notice.Type

/** Everything the application knows, and the only thing the view reads. */
export const Model = Schema.Struct({
  route: AppRoute,
  settings: Settings,
  shelf: Shelf.schema,
  notice: Notice,
  fileDrop: FileDrop.Model,
  /** Present exactly while the reader route is open. */
  maybeReader: Schema.Option(Reader.Model),
})

/** The decoded value of the {@linkcode Model} schema. */
export type Model = typeof Model.Type
