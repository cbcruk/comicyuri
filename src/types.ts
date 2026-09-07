import { Effect, Schema } from 'effect'
import type { ArchiveError } from './errors.ts'

/**
 * The persisted shapes are declared as schemas rather than plain types: they
 * come back from `localStorage` as untrusted JSON, so they are decoded (not
 * cast) on the way in and encoded on the way out. Everything else stays a
 * plain interface.
 */

export const ReadingDirection = Schema.Literals(['rtl', 'ltr'])
export type ReadingDirection = typeof ReadingDirection.Type

export const ViewMode = Schema.Literals(['single', 'spread'])
export type ViewMode = typeof ViewMode.Type

export const FitMode = Schema.Literals(['contain', 'width', 'height', 'original'])
export type FitMode = typeof FitMode.Type

export const Theme = Schema.Literals(['dark', 'light'])
export type Theme = typeof Theme.Type

export const BookSource = Schema.Literals(['zip', 'images', 'folder'])
export type BookSource = typeof BookSource.Type

const DEFAULTS = {
  direction: 'rtl',
  view: 'single',
  fit: 'contain',
  theme: 'dark',
  coverAlone: true,
} as const

/**
 * Every field carries its default, so a blob written by an older build decodes
 * into complete settings instead of failing or leaving holes.
 */
export const Settings = Schema.Struct({
  direction: ReadingDirection.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.direction)),
  ),
  view: ViewMode.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.view))),
  fit: FitMode.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.fit))),
  theme: Theme.pipe(Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.theme))),
  /** Show the very first page on its own (cover) in spread mode. */
  coverAlone: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(DEFAULTS.coverAlone)),
  ),
})
export type Settings = typeof Settings.Type

export const defaultSettings: Settings = DEFAULTS

/** Persisted per-book reading state. */
export const BookProgress = Schema.Struct({
  page: Schema.Number,
  bookmarks: Schema.Array(Schema.Number),
  updatedAt: Schema.Number,
})
export type BookProgress = typeof BookProgress.Type

/** A single page. The image bytes are resolved lazily via `load()`. */
export interface Page {
  readonly name: string
  /** Resolve (and cache) an object URL for the image. */
  load(): Effect.Effect<string, ArchiveError>
  /** Release the cached object URL to free memory. */
  unload(): void
}

export interface Book {
  readonly id: string
  readonly title: string
  readonly source: BookSource
  readonly pages: Page[]
}
