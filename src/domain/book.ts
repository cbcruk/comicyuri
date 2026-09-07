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

export type BookSummary = typeof BookSummary.Type

/** The shape of a persisted record this module can summarise. */
export type Record = Readonly<{
  id: string
  title: string
  source: BookSource
  pageCount?: number | undefined
}>

export const fromRecord = (record: Record, maybeCoverUrl: Option.Option<string>): BookSummary => ({
  id: record.id,
  title: record.title,
  source: record.source,
  maybePageCount: Option.fromNullishOr(record.pageCount),
  maybeCoverUrl,
})

export const coverUrls = (books: ReadonlyArray<BookSummary>): ReadonlyArray<string> =>
  Array.getSomes(Array.map(books, ({ maybeCoverUrl }) => maybeCoverUrl))

export const pageCountLabel = (book: BookSummary): string =>
  Option.match(book.maybePageCount, {
    onNone: () => 'Page count unknown',
    onSome: (count) => (count === 1 ? '1 page' : `${count} pages`),
  })
