import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Settings } from '../../types.ts'

/** How far along opening the archive is. */
export const OpenState = defineTaggedUnion({
  Opening: {},
  Ready: { title: Schema.String, pageCount: Schema.Number },
  Failed: { text: Schema.String },
})

export type OpenState = typeof OpenState.Type

/** One image on screen. */
export const Panel = Schema.Struct({
  page: Schema.Number,
  url: Schema.String,
})

export type Panel = typeof Panel.Type

/** What the stage is showing for the current spread. */
export const SpreadState = defineTaggedUnion({
  Loading: {},
  Shown: { panels: Schema.Array(Panel) },
  Failed: { text: Schema.String },
})

export type SpreadState = typeof SpreadState.Type

/**
 * `page` rather than a spread index is the position of record: it survives a
 * one-page/two-page toggle, and it is what gets persisted. The spread is
 * derived from it, the page count and the settings on every render.
 *
 * Page image URLs are deliberately absent. They live in the `Page` objects the
 * open-book resource holds, which memoize and release them, so the Model only
 * carries the handful currently on screen.
 */
export const Model = Schema.Struct({
  bookId: Schema.String,
  openState: OpenState,
  spread: SpreadState,
  page: Schema.Number,
  bookmarks: Schema.Array(Schema.Number),
  settings: Settings,
})

export type Model = typeof Model.Type

export type InitConfig = Readonly<{
  bookId: string
  page: number
  bookmarks: ReadonlyArray<number>
  settings: Settings
}>

export const init = (config: InitConfig): Model => ({
  bookId: config.bookId,
  openState: OpenState.Opening(),
  spread: SpreadState.Loading(),
  page: config.page,
  bookmarks: config.bookmarks,
  settings: config.settings,
})
