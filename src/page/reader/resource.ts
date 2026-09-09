import { Array, Effect, Option, Schema } from 'effect'
import { ManagedResource } from 'foldkit'

import { getAllBooks } from '../../db.ts'
import { EmptyBookError, describeUnknown } from '../../errors.ts'
import type { AppError } from '../../errors.ts'
import { bookFromStored } from '../../loader.ts'
import type { LoadedBook } from '../../types.ts'
import { Message } from './message.ts'
import type { Model } from './model.ts'

/**
 * 열린 책. 파싱된 ZIP 아카이브와 그 페이지들이 내주는 object URL이다. 둘 다
 * Model에 살 수 없고 리더가 닫힐 때 놓아 주어야 하는데, Model 상태를 키로 삼는
 * ManagedResource가 정확히 그 일을 한다. 페이지가 필요한 Command는
 * `OpenBook.get`으로 닿는다.
 */
export const OpenBook = ManagedResource.tag<LoadedBook>()('OpenBook')

/** 열린 책이 필요할 때 Command가 요구하는 서비스. */
export type OpenBookService = ManagedResource.ServiceOf<typeof OpenBook>

const openBook = (bookId: string): Effect.Effect<LoadedBook, AppError> =>
  Effect.gen(function* () {
    const stored = Array.findFirst(yield* getAllBooks, ({ id }) => id === bookId)

    if (Option.isNone(stored)) {
      return yield* new EmptyBookError({ title: bookId })
    }

    return yield* bookFromStored(stored.value)
  })

/**
 * 리더가 그 책에 머무는 동안 딱 그만큼 책을 열어 둔다.
 *
 * 런타임이 `bookId`가 나타나면 얻고 리더가 떠나면 놓는다. 그래서 책이 내준 모든
 * 페이지 URL이 `update`에 정리 코드 한 줄 없이 회수된다.
 */
export const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
  openBook: entry(Schema.Option(Schema.String), {
    resource: OpenBook,
    modelToMaybeRequirements: (model) => Option.some(model.bookId),
    acquire: openBook,
    release: (book) => Effect.sync(() => Array.forEach(book.pages, (page) => page.unload())),
    onAcquired: (book) =>
      Message.CompletedOpenBook({
        title: book.title,
        pageCount: book.pages.length,
      }),
    onReleased: () => Message.CompletedReleaseBook(),
    onAcquireError: (error) => Message.FailedOpenBook({ text: describeUnknown(error) }),
  }),
}))
