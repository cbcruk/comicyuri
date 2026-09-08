import { Effect, Schema } from 'effect'
import type { ArchiveError } from './errors.ts'

/**
 * The persisted shapes are declared as schemas rather than plain types: they
 * come back from `localStorage` as untrusted JSON, so they are decoded (not
 * cast) on the way in and encoded on the way out. Everything else stays a
 * plain interface.
 */

/**
 * Which side of the book the pages advance toward: `rtl` for manga, `ltr`
 * for western comics.
 */
export const ReadingDirection = Schema.Literals(['rtl', 'ltr'])
/** The decoded value of the {@linkcode ReadingDirection} schema. */
export type ReadingDirection = typeof ReadingDirection.Type

/** How many pages the stage shows at once, one or a two-page spread. */
export const ViewMode = Schema.Literals(['single', 'spread'])
/** The decoded value of the {@linkcode ViewMode} schema. */
export type ViewMode = typeof ViewMode.Type

/**
 * How a page is sized to the stage: fitted whole, filling the width, filling
 * the height, or left at its own pixel size.
 */
export const FitMode = Schema.Literals(['contain', 'width', 'height', 'original'])
/** The decoded value of the {@linkcode FitMode} schema. */
export type FitMode = typeof FitMode.Type

/**
 * The colour scheme, which reaches the page as `data-theme` on the document
 * root.
 */
export const Theme = Schema.Literals(['dark', 'light'])
/** The decoded value of the {@linkcode Theme} schema. */
export type Theme = typeof Theme.Type

/**
 * Where a book's pages came from: an archive, a set of loose images, or a
 * picked folder.
 */
export const BookSource = Schema.Literals(['zip', 'images', 'folder'])
/** The decoded value of the {@linkcode BookSource} schema. */
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
/** The decoded value of the {@linkcode Settings} schema. */
export type Settings = typeof Settings.Type

/**
 * What a reader who has never changed anything gets: manga order, one page at
 * a time, fitted whole, dark, and the cover on its own.
 */
export const defaultSettings: Settings = DEFAULTS

/** Persisted per-book reading state. */
export const BookProgress = Schema.Struct({
  page: Schema.Number,
  bookmarks: Schema.Array(Schema.Number),
  updatedAt: Schema.Number,
})
/** The decoded value of the {@linkcode BookProgress} schema. */
export type BookProgress = typeof BookProgress.Type

/** A single page. The image bytes are resolved lazily via `load()`. */
export interface Page {
  /** The entry name inside the archive, used to order the pages. */
  readonly name: string
  /** Resolve (and cache) an object URL for the image. */
  load(): Effect.Effect<string, ArchiveError>
  /** Release the cached object URL to free memory. */
  unload(): void
}

/**
 * An open book: the archive has been read far enough to know its pages, but
 * their images are still fetched one at a time through {@linkcode Page.load}.
 */
export interface LoadedBook {
  /** Stable identity, also the key the shelf and progress are stored under. */
  readonly id: string
  /** What the shelf and the reader header call this book. */
  readonly title: string
  /** Where the pages came from. */
  readonly source: BookSource
  /** Every page, in reading order. */
  readonly pages: Page[]
}
