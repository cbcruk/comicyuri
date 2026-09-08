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
 * The opened book: a parsed ZIP archive plus the object URLs its pages hand
 * out. Neither can live in the Model, and both have to be released when the
 * reader closes, which is exactly what a ManagedResource keyed on Model state
 * does. Commands that need a page reach it through `OpenBook.get`.
 */
export const OpenBook = ManagedResource.tag<LoadedBook>()('OpenBook')

/** The service a Command asks for when it needs the open book. */
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
 * Holds the book open for exactly as long as the reader is on that book.
 *
 * The runtime acquires it when `bookId` appears and releases it when the
 * reader leaves, so every page URL the book handed out is revoked without any
 * teardown code in `update`.
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
