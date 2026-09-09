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
 * 스프레드 하나의 이미지를 가져온다. 결과는 요청받은 페이지를 지고 오므로,
 * 이미 다른 데로 옮겨 간 뒤에 도착한 답은 update가 버릴 수 있다.
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
 * 이웃한 스프레드를 미리 데워 두고, 읽는 자리에서 먼 페이지는 모두 놓아 준다.
 * 그래야 긴 책이 한 번 보여 준 것을 전부 쥐고 있지 않는다.
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
 * 썸네일은 화면이 보여 주는 것과 같은, 필요할 때 뽑아 두는 페이지에서 온다.
 * 그래서 이미 화면에 있는 페이지는 격자에 같이 놓아도 값이 들지 않는다.
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
      // 끝내 나오지 않는 썸네일은 알릴 만한 일이 아니다.
      Effect.catch(() => Effect.succeed(Message.CompletedLoadThumbs({ panels: [] }))),
    ),
})

/**
 * Fullscreen API는 브라우저가 거절하면 reject 되는 promise이고, 어느 쪽이든
 * 결과는 document가 자기 이벤트로 알린다. 그래서 이 Command는 묻기만 하면 된다.
 */
export const ToggleFullscreen = Command.define('ToggleFullscreen', {
  args: { wantFullscreen: Schema.Boolean },
  messages: [Message.CompletedToggleFullscreen],
  execute: ({ wantFullscreen }) =>
    Effect.tryPromise(() =>
      wantFullscreen ? document.documentElement.requestFullscreen() : document.exitFullscreen(),
    ).pipe(Effect.ignore, Effect.as(Message.CompletedToggleFullscreen())),
})
