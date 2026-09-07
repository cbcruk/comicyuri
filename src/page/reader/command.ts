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

/**
 * Thumbnails come from the same lazily-extracted pages the stage shows, so a
 * page already on screen costs nothing to put in the grid as well.
 */
export const LoadThumbs = Command.define('LoadThumbs', {
  args: { pages: Schema.Array(Schema.Number) },
  messages: [Message.CompletedLoadThumbs],
  execute: ({ pages }) =>
    Effect.gen(function* () {
      const book = yield* OpenBook.get
      const panels = yield* Effect.forEach(
        Array.filter(pages, (index) => index < book.pages.length),
        (index) => panelFor(book.pages[index]!, index),
      )
      return Message.CompletedLoadThumbs({ panels })
    }).pipe(
      // A thumbnail that will not resolve is not worth reporting.
      Effect.catch(() => Effect.succeed(Message.CompletedLoadThumbs({ panels: [] }))),
    ),
})

/**
 * The Fullscreen API is a promise that rejects when the browser declines, and
 * the document reports the result through its own event either way, so this
 * Command only has to ask.
 */
export const ToggleFullscreen = Command.define('ToggleFullscreen', {
  args: { wantFullscreen: Schema.Boolean },
  messages: [Message.CompletedToggleFullscreen],
  execute: ({ wantFullscreen }) =>
    Effect.tryPromise(() =>
      wantFullscreen ? document.documentElement.requestFullscreen() : document.exitFullscreen(),
    ).pipe(Effect.ignore, Effect.as(Message.CompletedToggleFullscreen())),
})
