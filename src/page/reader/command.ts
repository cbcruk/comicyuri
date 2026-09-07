import { Array, Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import { describeUnknown } from '../../errors.ts'
import type { AppError } from '../../errors.ts'
import type { Page } from '../../types.ts'
import { Message } from './message.ts'
import type { Panel } from './model.ts'
import { OpenBook } from './resource.ts'

const panelFor = (page: Page, index: number): Effect.Effect<Panel, AppError> =>
  Effect.map(page.load(), (url) => ({ page: index, url }))

/**
 * Resolves the images for one spread. The result carries the page it was asked
 * for, so update can drop an answer that arrives after the reader has moved on.
 */
export const LoadSpread = Command.define('LoadSpread', {
  args: { page: Schema.Number, pages: Schema.Array(Schema.Number) },
  messages: [Message.CompletedLoadSpread, Message.FailedLoadSpread],
  execute: ({ page, pages }) =>
    Effect.gen(function* () {
      const book = yield* OpenBook.get
      const panels = yield* Effect.forEach(pages, (index) => panelFor(book.pages[index]!, index))
      return Message.CompletedLoadSpread({ page, panels })
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Message.FailedLoadSpread({ page, text: describeUnknown(error) })),
      ),
    ),
})

/**
 * Warms the neighbouring spreads and releases every page far from the reader,
 * so a long book does not hold on to everything it has ever shown.
 */
export const PreloadNeighbours = Command.define('PreloadNeighbours', {
  args: { warm: Schema.Array(Schema.Number), keep: Schema.Array(Schema.Number) },
  messages: [Message.CompletedPreloadNeighbours],
  execute: ({ warm, keep }) =>
    Effect.gen(function* () {
      const book = yield* OpenBook.get

      yield* Effect.forEach(warm, (index) => Effect.ignore(book.pages[index]!.load()), {
        discard: true,
      })

      yield* Effect.sync(() =>
        Array.forEach(book.pages, (page, index) => {
          if (!Array.contains(keep, index)) {
            page.unload()
          }
        }),
      )

      return Message.CompletedPreloadNeighbours()
    }).pipe(Effect.catch(() => Effect.succeed(Message.CompletedPreloadNeighbours()))),
})
