import { Array, Option, Schema } from 'effect'

import { BookSource } from '../types.ts'

/**
 * 책장이 책 한 권을 그리는 데 필요한 것. 아카이브 바이트는 IndexedDB에 남고,
 * 표지는 `img`에 그대로 넘길 수 있고 책장을 다시 그릴 때 놓아 줄 수 있는
 * object URL로 온다.
 */
export const BookSummary = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  source: BookSource,
  maybePageCount: Schema.Option(Schema.Number),
  maybeCoverUrl: Schema.Option(Schema.String),
})

/** {@linkcode BookSummary} 스키마의 디코딩된 값. */
export type BookSummary = typeof BookSummary.Type

/** 이 모듈이 요약할 수 있는 저장 레코드의 모양. */
export type Record = Readonly<{
  /** 책의 고정된 정체. */
  id: string
  /** 카드에 적을 이름. */
  title: string
  /** 페이지가 어디서 왔는지. */
  source: BookSource
  /** 아카이브를 한 번 열기 전까지는 없다. */
  pageCount?: number | undefined
}>

/**
 * 저장 레코드를 책장용으로 요약한다.
 *
 * 표지는 여기서 읽지 않고 받아 온다. object URL은 그것을 가진 Command가 만들고
 * 놓아 주며, 이 함수는 순수하게 남는다.
 */
export const fromRecord = (record: Record, maybeCoverUrl: Option.Option<string>): BookSummary => ({
  id: record.id,
  title: record.title,
  source: record.source,
  maybePageCount: Option.fromNullishOr(record.pageCount),
  maybeCoverUrl,
})

/**
 * 지금 쥐고 있는 표지 URL 전부. 한 번에 놓아 주려고 모은다.
 *
 * 표지가 없는 책은 그냥 빠지므로, 결과는 구멍 뚫린 목록이 아니라 놓아 줄 것
 * 그 자체다.
 */
export const coverUrls = (books: ReadonlyArray<BookSummary>): ReadonlyArray<string> =>
  Array.getSomes(Array.map(books, ({ maybeCoverUrl }) => maybeCoverUrl))

/**
 * 카드가 분량을 말하는 방식. 한 장이면 단수로, 여럿이면 복수로, 아직 아카이브를
 * 열어 보지 않은 책이면 모른다고 적는다.
 */
export const pageCountLabel = (book: BookSummary): string =>
  Option.match(book.maybePageCount, {
    onNone: () => 'Page count unknown',
    onSome: (count) => (count === 1 ? '1 page' : `${count} pages`),
  })
