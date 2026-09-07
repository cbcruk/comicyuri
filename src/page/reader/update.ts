import { Array, Option } from 'effect'
import { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import type { FitMode } from '../../types.ts'
import { LoadSpread, PreloadNeighbours } from './command.ts'
import { Message, OutMessage } from './message.ts'
import { Model, OpenState, SpreadState } from './model.ts'
import type { OpenBookService } from './resource.ts'
import {
  indexOfPage,
  neighbourPages,
  pageAfterStep,
  pagesAt,
  pagesToKeep,
  spreadsFor,
} from './spread.ts'

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, OpenBookService>

const FIT_ORDER: ReadonlyArray<FitMode> = ['contain', 'width', 'height', 'original']

const nextFit = (fit: FitMode): FitMode =>
  Option.getOrElse(
    Array.get(
      FIT_ORDER,
      (Array.findFirstIndex(FIT_ORDER, (f) => f === fit).pipe(Option.getOrElse(() => 0)) + 1) %
        FIT_ORDER.length,
    ),
    () => fit,
  )

/**
 * Everything the reader has to do after its position or its layout changes:
 * ask for the images on screen, warm the neighbours, release the rest.
 */
const showPage = (model: Model, page: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model: evo(model, { page: () => page }) }),
    Failed: () => ({ model: evo(model, { page: () => page }) }),
    Ready: ({ pageCount }) => {
      const spreads = spreadsFor(pageCount, model.settings)
      const index = indexOfPage(spreads, page)
      const pages = pagesAt(spreads, index)

      return {
        model: evo(model, {
          page: () => page,
          spread: () => SpreadState.Loading(),
        }),
        commands: [
          LoadSpread({ page, pages }),
          PreloadNeighbours({
            warm: neighbourPages(spreads, index),
            keep: pagesToKeep(spreads, index),
          }),
        ],
        outMessage: OutMessage.UpdatedProgress({
          bookId: model.bookId,
          page,
          bookmarks: model.bookmarks,
        }),
      }
    },
  })

const step = (model: Model, by: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model }),
    Failed: () => ({ model }),
    Ready: ({ pageCount }) =>
      showPage(model, pageAfterStep(spreadsFor(pageCount, model.settings), model.page, by)),
  })

/** A setting the reader owns changed: relayout, and tell the application. */
const withSettings = (model: Model, settings: Model['settings']): UpdateReturn => {
  const next = showPage(evo(model, { settings: () => settings }), model.page)

  return {
    ...next,
    outMessage: OutMessage.ChangedSettings({ settings }),
  }
}

/**
 * Keyboard shortcuts resolve to the Message the equivalent control would send,
 * so a key and a button cannot drift apart.
 *
 * The turn keys follow the visual direction: in right-to-left reading the left
 * key advances, which is what makes manga feel right.
 */
const messageForKey = (model: Model, key: string): Option.Option<Message> => {
  const rtl = model.settings.direction === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const back = rtl ? 'ArrowRight' : 'ArrowLeft'

  if (key === forward || key === 'ArrowDown' || key === 'PageDown' || key === ' ') {
    return Option.some(Message.ClickedNext())
  }
  if (key === back || key === 'ArrowUp' || key === 'PageUp') {
    return Option.some(Message.ClickedPrevious())
  }

  return Option.fromNullishOr(
    {
      Home: Message.ClickedFirst(),
      End: Message.ClickedLast(),
      Escape: Message.ClickedExit(),
      d: Message.ClickedToggleDirection(),
      v: Message.ClickedToggleView(),
      f: Message.ClickedCycleFit(),
    }[key],
  )
}

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    CompletedOpenBook: ({ title, pageCount }) =>
      showPage(
        evo(model, {
          openState: () => OpenState.Ready({ title, pageCount }),
        }),
        model.page,
      ),

    FailedOpenBook: ({ text }) => ({
      model: evo(model, {
        openState: () => OpenState.Failed({ text }),
        spread: () => SpreadState.Failed({ text }),
      }),
    }),

    CompletedReleaseBook: () => ({ model }),

    // An answer for a page the reader has already left is not the answer to
    // the question it is asking now.
    CompletedLoadSpread: ({ page, panels }) =>
      page === model.page
        ? { model: evo(model, { spread: () => SpreadState.Shown({ panels }) }) }
        : { model },

    FailedLoadSpread: ({ page, text }) =>
      page === model.page
        ? { model: evo(model, { spread: () => SpreadState.Failed({ text }) }) }
        : { model },

    CompletedPreloadNeighbours: () => ({ model }),

    ClickedPrevious: () => step(model, -1),
    ClickedNext: () => step(model, 1),
    ClickedFirst: () => showPage(model, 0),

    ClickedLast: () =>
      OpenState.match(model.openState, {
        Opening: () => ({ model }),
        Failed: () => ({ model }),
        Ready: ({ pageCount }) => showPage(model, Math.max(0, pageCount - 1)),
      }),

    ClickedExit: () => ({ model, outMessage: OutMessage.RequestedExit() }),

    ClickedToggleDirection: () =>
      withSettings(
        model,
        evo(model.settings, {
          direction: (direction) => (direction === 'rtl' ? 'ltr' : 'rtl'),
        }),
      ),

    ClickedToggleView: () =>
      withSettings(
        model,
        evo(model.settings, {
          view: (view) => (view === 'single' ? 'spread' : 'single'),
        }),
      ),

    ClickedCycleFit: () => withSettings(model, evo(model.settings, { fit: nextFit })),

    PressedKey: ({ key }) =>
      Option.match(messageForKey(model, key), {
        onNone: () => ({ model }),
        onSome: (message) => update(model, message),
      }),
  })
