import { Array, Option, Schema } from 'effect'

import { BookSource } from '../types.ts'

/**
 * What the shelf needs to draw a book. The archive bytes stay in IndexedDB;
 * the cover arrives as an object URL the shelf can hand to an `img` and revoke
 * when the shelf is redrawn.
 */
export const BookSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  source: BookSource,
  maybePageCount: Schema.Option(Schema.Number),
  maybeCoverUrl: Schema.Option(Schema.String),
})

/** The decoded value of the {@linkcode BookSummary} schema. */
export type BookSummary = typeof BookSummary.Type

/** The shape of a persisted record this module can summarise. */
export type Record = Readonly<{
  /** The book's stable identity. */
  id: string
  /** What to call it on a card. */
  title: string
  /** Where its pages came from. */
  source: BookSource
  /** Absent until the archive has been opened once. */
  pageCount?: number | undefined
}>

/**
 * Summarises a persisted record for the shelf.
 *
 * The cover is passed in rather than read here: object URLs are created and
 * revoked by the command that owns them, and this stays pure.
 */
export const fromRecord = (record: Record, maybeCoverUrl: Option.Option<string>): BookSummary => ({
  id: record.id,
  title: record.title,
  source: record.source,
  maybePageCount: Option.fromNullishOr(record.pageCount),
  maybeCoverUrl,
})

/**
 * Every cover URL currently held, for revoking them in one go.
 *
 * Books without a cover simply drop out, so the result is what there is to
 * release rather than a list with holes in it.
 */
export const coverUrls = (books: ReadonlyArray<BookSummary>): ReadonlyArray<string> =>
  Array.getSomes(Array.map(books, ({ maybeCoverUrl }) => maybeCoverUrl))

/**
 * How a card states its length — singular, plural, or unknown for a book whose
 * archive has not been opened yet.
 */
export const pageCountLabel = (book: BookSummary): string =>
  Option.match(book.maybePageCount, {
    onNone: () => 'Page count unknown',
    onSome: (count) => (count === 1 ? '1 page' : `${count} pages`),
  })
