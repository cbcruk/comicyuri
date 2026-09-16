/**
 * 페이지 로딩. 책 한 권, 페이지 한 장, 스프레드 하나가 각자 atom 하나다.
 *
 * Foldkit 리더는 URL의 수명을 손으로 쥐었다. `Page`가 URL을 캐시하고, `PreloadNeighbours`가
 * 놓아 줄 페이지를 `keep` 목록으로 가르고, `CompletedLoadSpread`가 늦은 답을
 * `page === model.page`로 버렸다. 여기서는 그것을 atom의 수명에 맡긴다.
 *
 * - 책 한 권, 페이지 한 장, 스프레드 하나가 각자 atom 하나다. 같은 키는 같은 atom이라,
 *   두 곳이 같은 페이지를 동시에 원해도 압축은 한 번 풀리고 URL은 하나다.
 * - 페이지 URL은 atom의 스코프에 매여 있다. 그 페이지를 원하는 atom이 하나도 남지 않으면
 *   레지스트리가 atom을 치우고, 스코프가 닫히며 URL이 해제된다.
 * - 스프레드의 답은 자기 atom에만 들어간다. 이미 떠난 스프레드의 답이 지금 스프레드를
 *   덮을 길이 없다.
 */

import { Array, Effect } from 'effect'
import { Atom } from 'effect/unstable/reactivity'
import type { AsyncResult } from 'effect/unstable/reactivity'

import { ArchiveError } from '../errors.ts'
import type { AppError } from '../errors.ts'
import type { LoadedBook } from '../types.ts'

/**
 * atom들이 바깥 세계에 닿는 길. 브라우저에서는 IndexedDB와 `URL`, `Image.decode`이고
 * 시험에서는 가짜다.
 */
export type PageLoading = Readonly<{
  openBook: (bookId: string) => Effect.Effect<LoadedBook, AppError>
  createUrl: (blob: Blob) => string
  revokeUrl: (url: string) => void
  /** 브라우저가 그 URL을 그릴 수 있게 될 때까지 기다린다. 실패해도 성공으로 끝낸다. */
  decode: (url: string) => Effect.Effect<void>
}>

/** 화면에 걸 이미지 하나. 리더의 `Panel`과 같은 모양이다. */
export type SpreadPanel = Readonly<{ page: number; url: string }>

/** {@linkcode makePageAtoms}가 돌려주는 atom 묶음. */
export type PageAtoms = Readonly<{
  /** 열린 책. 페이지 atom이 모두 이것에 기댄다. */
  book: (bookId: string) => Atom.Atom<AsyncResult.AsyncResult<LoadedBook, AppError>>
  /** 디코딩까지 끝난 페이지 한 장의 URL. 아무도 원하지 않게 되면 해제된다. */
  pageUrl: (bookId: string, page: number) => Atom.Atom<AsyncResult.AsyncResult<string, AppError>>
  /** 스프레드 하나. 모든 페이지가 그릴 수 있게 된 뒤에야 성공한다(`R-206`). */
  spread: (
    bookId: string,
    pages: ReadonlyArray<number>,
  ) => Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<SpreadPanel>, AppError>>
}>

/**
 * family의 키. `Atom.family`는 키를 `Equal`로 비교하므로 배열이나 객체를 키로 주면 부를
 * 때마다 새 atom이 생긴다. 그래서 문자열로 접는다. 페이지 번호에는 `|`가 없으므로 첫
 * `|`까지가 번호다.
 */
const keyOf = (bookId: string, pages: ReadonlyArray<number>): string =>
  `${Array.join(Array.map(pages, String), ',')}|${bookId}`

const fromKey = (key: string): Readonly<{ bookId: string; pages: ReadonlyArray<number> }> => {
  const bar = key.indexOf('|')
  return {
    bookId: key.slice(bar + 1),
    pages: Array.map(key.slice(0, bar).split(','), Number),
  }
}

/**
 * 페이지 로딩 atom들을 만든다. 같은 {@linkcode PageLoading}으로 한 번만 만들어 앱 전체가
 * 나눠 써야 한다 — 두 번 만들면 family도 둘이라 같은 페이지가 두 atom이 된다.
 */
export const makePageAtoms = (loading: PageLoading): PageAtoms => {
  const book = Atom.family((bookId: string) => Atom.make(loading.openBook(bookId)))

  const pageUrl = Atom.family((key: string) => {
    const { bookId, pages } = fromKey(key)
    const page = pages[0] ?? 0

    return Atom.make((get) =>
      Effect.gen(function* () {
        const opened = yield* get.result(book(bookId))
        const source = opened.pages[page]
        if (source === undefined) {
          return yield* new ArchiveError({ reason: `Page ${page + 1} is not in this book` })
        }

        const blob = yield* source.read()
        // URL은 이 atom의 스코프가 닫힐 때 해제된다. 디코딩보다 먼저 걸어 두어야,
        // 디코딩 도중에 atom이 치워져도 URL이 남지 않는다.
        const url = yield* Effect.acquireRelease(
          Effect.sync(() => loading.createUrl(blob)),
          (created) => Effect.sync(() => loading.revokeUrl(created)),
        )
        yield* loading.decode(url)

        return url
      }),
    )
  })

  const spread = Atom.family((key: string) => {
    const { bookId, pages } = fromKey(key)

    return Atom.make((get) =>
      Effect.forEach(
        pages,
        (page) =>
          Effect.map(get.result(pageUrl(keyOf(bookId, [page]))), (url): SpreadPanel => ({
            page,
            url,
          })),
        { concurrency: 'unbounded' },
      ),
    )
  })

  return {
    book,
    pageUrl: (bookId, page) => pageUrl(keyOf(bookId, [page])),
    spread: (bookId, pages) => spread(keyOf(bookId, pages)),
  }
}
