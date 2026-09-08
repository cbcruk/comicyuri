import { Array, Option, Order } from 'effect'
import { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import type { FitMode } from '../../types.ts'
import { LoadSpread, LoadThumbs, PreloadNeighbours, ToggleFullscreen } from './command.ts'
import {
  DOUBLE_TAP_MILLIS,
  DOUBLE_TAP_ZOOM,
  ORIGIN,
  TAP_SLOP,
  ZOOM_MIN,
  clampZoom,
  distance,
  midpoint,
  panForZoom,
  swipeFrom,
  translate,
  zoomAround,
  zoneAt,
} from './gesture.ts'
import type { Point } from './gesture.ts'
import { Slider, VirtualList } from '@foldkit/ui'

import { messageForKey } from './keys.ts'
import { Message, OutMessage } from './message.ts'
import { Gesture, Model, OpenState, SpreadState } from './model.ts'
import type { OpenBookService } from './resource.ts'
import { loadedPages, missingFrom, pagesInView } from './thumbs.ts'
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
            // Thumbnails on screen hold URLs from these same pages, so
            // releasing them would blank the grid.
            keep: Array.appendAll(pagesToKeep(spreads, index), loadedPages(model.thumbPanels)),
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

/**
 * Moving to another page starts fresh. The pan offset was measured against the
 * page being left, so carrying it over lands on an arbitrary part of the next
 * one — which is why the viewer this replaced reset on every turn and jump.
 * Re-showing the same page after a settings change keeps the zoom.
 */
const goToPage = (model: Model, page: number): UpdateReturn =>
  showPage(evo(model, { zoom: () => ZOOM_MIN, pan: () => ORIGIN }), page)

const step = (model: Model, by: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model }),
    Failed: () => ({ model }),
    Ready: ({ pageCount }) =>
      goToPage(model, pageAfterStep(spreadsFor(pageCount, model.settings), model.page, by)),
  })

/** A setting the reader owns changed: relayout, and tell the application. */
const withSettings = (model: Model, settings: Model['settings']): UpdateReturn => {
  const next = showPage(evo(model, { settings: () => settings }), model.page)

  return {
    ...next,
    outMessage: OutMessage.ChangedSettings({ settings }),
  }
}

/** Brings the chrome back and restarts the wait that hides it. */
const withActivity = (model: Model): Model =>
  evo(model, {
    isChromeVisible: () => true,
    activityToken: (token) => token + 1,
  })

/**
 * A press restarts the wait but does not itself reveal the chrome. A tap in
 * the middle of the page is a request to toggle it, and revealing on the way
 * down would mean every one of those taps resolved to hidden.
 */
const withPress = (model: Model): Model => evo(model, { activityToken: (token) => token + 1 })

const zoomedTo = (model: Model, nextZoom: number, anchor: Point): Model => {
  const zoom = clampZoom(nextZoom)
  return evo(model, {
    zoom: () => zoom,
    pan: () => panForZoom(zoomAround(model.pan, model.zoom, zoom, anchor), zoom),
  })
}

/** A press either starts tracking, or joins an existing one into a pinch. */
const pressed = (model: Model, pointerId: number, at: Point): Model =>
  Gesture.match(model.gesture, {
    Idle: () =>
      evo(model, {
        gesture: () =>
          Gesture.Tracking({
            pointerId,
            origin: at,
            last: at,
            hasLeftSlop: false,
          }),
      }),
    Tracking: (tracking) =>
      evo(model, {
        gesture: () =>
          Gesture.Pinching({
            firstId: tracking.pointerId,
            secondId: pointerId,
            first: tracking.last,
            second: at,
            startSpan: distance(tracking.last, at),
            startZoom: model.zoom,
          }),
      }),
    // A third finger is not a gesture this reader knows.
    Pinching: () => model,
  })

/**
 * Steps in the visual direction the reader pointed. Right-to-left reading puts
 * the next page on the left, which is what makes a left tap advance a manga.
 */
const stepForSide = (model: Model, side: 'Left' | 'Right'): number => {
  const forward = model.settings.direction === 'rtl' ? 'Left' : 'Right'
  return side === forward ? 1 : -1
}

const moved = (model: Model, pointerId: number, at: Point): Model =>
  Gesture.match(model.gesture, {
    Idle: () => model,

    Tracking: (tracking) => {
      if (tracking.pointerId !== pointerId) return model

      const hasLeftSlop = tracking.hasLeftSlop || distance(tracking.origin, at) > TAP_SLOP

      // Panning only makes sense once there is more page than screen.
      const panned =
        model.zoom > ZOOM_MIN
          ? evo(model, { pan: () => translate(model.pan, tracking.last, at) })
          : model

      return evo(panned, {
        gesture: () => Gesture.Tracking({ ...tracking, last: at, hasLeftSlop }),
      })
    },

    Pinching: (pinching) => {
      const first = pinching.firstId === pointerId ? at : pinching.first
      const second = pinching.secondId === pointerId ? at : pinching.second
      const span = distance(first, second)

      if (span === 0) return model

      const zoomed = zoomedTo(
        model,
        pinching.startZoom * (span / pinching.startSpan),
        midpoint(first, second),
      )

      return evo(zoomed, {
        gesture: () => Gesture.Pinching({ ...pinching, first, second }),
      })
    },
  })

/**
 * A release is where a press finally means something. Panning has already been
 * applied while moving, so what is left is what a press means when the page
 * fits the screen: a swipe, or a tap on one of three zones.
 */
const released = (
  model: Model,
  tracking: typeof Gesture.Tracking.Type,
  at: Point,
  timeStamp: number,
  viewportWidth: number,
): UpdateReturn => {
  const isDoubleTap = !tracking.hasLeftSlop && timeStamp - model.lastTapAt < DOUBLE_TAP_MILLIS

  const settled = evo(model, {
    gesture: () => Gesture.Idle(),
    lastTapAt: () => (tracking.hasLeftSlop ? 0 : timeStamp),
  })

  if (isDoubleTap) {
    // Consumed, so a third tap opens a fresh pair rather than undoing this one.
    const consumed = evo(settled, { lastTapAt: () => 0 })

    return {
      model:
        model.zoom > ZOOM_MIN
          ? evo(consumed, { zoom: () => ZOOM_MIN, pan: () => ORIGIN })
          : zoomedTo(consumed, DOUBLE_TAP_ZOOM, at),
    }
  }

  if (tracking.hasLeftSlop) {
    // Zoomed in, a press that moved was a pan, and it is already applied.
    if (model.zoom > ZOOM_MIN) return { model: settled }

    const swipe = swipeFrom(tracking.origin, at)
    return swipe === 'Middle' ? { model: settled } : step(settled, stepForSide(settled, swipe))
  }

  const zone = zoneAt(at.x, viewportWidth)
  return zone === 'Middle'
    ? {
        model: evo(settled, {
          isChromeVisible: (visible) => !visible,
          activityToken: (token) => token + 1,
        }),
      }
    : step(settled, stepForSide(settled, zone))
}

/** The slider reports pages, which is exactly what `showPage` takes. */
const foldSliderOutMessage = Slider.OutMessage.match<
  Update.StepWithOutMessage<Model, Message, OutMessage, OpenBookService>
>({
  ChangedValue:
    ({ value }) =>
    (model) =>
      goToPage(model, value),
})

const foldSlider = Update.foldChild({
  update: Slider.update,
  read: (model: Model) => Option.some(model.slider),
  write: (model, nextSlider) => evo(model, { slider: () => nextSlider }),
  toParentMessage: (message) => Message.GotSliderMessage({ message }),
  foldOutMessage: foldSliderOutMessage,
})

/** Asks for whatever the grid could show and has not extracted yet. */
const fillThumbs = (model: Model): UpdateReturn => {
  const pageCount = OpenState.match(model.openState, {
    Opening: () => 0,
    Failed: () => 0,
    Ready: ({ pageCount }) => pageCount,
  })

  const missing = missingFrom(model.thumbPanels, pagesInView(model.thumbs, pageCount))

  return Array.match(missing, {
    onEmpty: () => ({ model }),
    onNonEmpty: (pages) => ({ model, commands: [LoadThumbs({ pages })] }),
  })
}

const foldThumbs = Update.foldChild({
  update: VirtualList.update,
  read: (model: Model) => Option.some(model.thumbs),
  write: (model, nextThumbs) => evo(model, { thumbs: () => nextThumbs }),
  toParentMessage: (message) => Message.GotThumbsMessage({ message }),
})

/**
 * Whether this Message is someone using a control, which keeps the chrome up
 * and restarts the wait that hides it.
 *
 * Keyed on how the Message is named rather than a list of handlers to visit.
 * A list is what let the toolbar time out from under a reader who was using
 * it: every control added since had to remember to say so, and they did not.
 * `Clicked*` and `Selected*` already mean a person acted on a control, so a
 * new one is covered by being named the way the conventions require.
 *
 * Pointer Messages are deliberately absent. A press must not reveal the
 * chrome, or the tap that toggles it would resolve to hidden every time.
 */
const isControlUse = (message: Message): boolean =>
  message._tag !== 'ClickedExit' &&
  (message._tag.startsWith('Clicked') ||
    message._tag.startsWith('Selected') ||
    message._tag === 'PressedKey' ||
    message._tag === 'ScrolledToZoom' ||
    message._tag === 'GotSliderMessage')

export const update = (model: Model, message: Message): UpdateReturn =>
  applyMessage(isControlUse(message) ? withActivity(model) : model, message)

const applyMessage = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    CompletedOpenBook: ({ title, pageCount }) =>
      showPage(
        evo(model, {
          openState: () => OpenState.Ready({ title, pageCount }),
          slider: Slider.reflectRange({ min: 0, max: Math.max(0, pageCount - 1) }),
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
    ClickedFirst: () => goToPage(model, 0),

    ClickedLast: () =>
      OpenState.match(model.openState, {
        Opening: () => ({ model }),
        Failed: () => ({ model }),
        Ready: ({ pageCount }) => goToPage(model, Math.max(0, pageCount - 1)),
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

    GotSliderMessage: ({ message }) => foldSlider(model, message),

    ClickedToggleBookmark: () => {
      const bookmarks = Array.contains(model.bookmarks, model.page)
        ? Array.filter(model.bookmarks, (page) => page !== model.page)
        : Array.sort(Array.append(model.bookmarks, model.page), Order.Number)

      return {
        model: evo(model, { bookmarks: () => bookmarks }),
        outMessage: OutMessage.UpdatedProgress({
          bookId: model.bookId,
          page: model.page,
          bookmarks,
        }),
      }
    },

    // The document reports the outcome through `ChangedFullscreen`, including
    // the times the browser declines or the reader leaves with Escape.
    ClickedToggleFullscreen: () => ({
      model,
      commands: [ToggleFullscreen({ wantFullscreen: !model.isFullscreen })],
    }),

    CompletedToggleFullscreen: () => ({ model }),

    ChangedFullscreen: ({ isFullscreen }) => ({
      model: evo(model, { isFullscreen: () => isFullscreen }),
    }),

    ClickedToggleThumbs: () =>
      model.isThumbsOpen
        ? {
            model: evo(model, {
              isThumbsOpen: () => false,
              // Nothing is showing them any more, and the pages they came
              // from are free to be released on the next turn.
              thumbPanels: () => [],
            }),
          }
        : fillThumbs(
            evo(model, {
              isThumbsOpen: () => true,
              isChromeVisible: () => true,
              activityToken: (token) => token + 1,
            }),
          ),

    GotThumbsMessage: ({ message }) => {
      const scrolled = foldThumbs(model, message)
      const filled = fillThumbs(scrolled.model)

      return {
        model: filled.model,
        commands: Array.appendAll(scrolled.commands ?? [], filled.commands ?? []),
      }
    },

    CompletedLoadThumbs: ({ panels }) => ({
      model: evo(model, {
        thumbPanels: (existing) => Array.appendAll(existing, panels),
      }),
    }),

    SelectedThumb: ({ page }) => {
      const jumped = goToPage(evo(model, { isThumbsOpen: () => false }), page)
      return {
        ...jumped,
        model: evo(jumped.model, { thumbPanels: () => [] }),
      }
    },

    PressedPointer: ({ pointerId, at }) => ({
      model: pressed(withPress(model), pointerId, at),
    }),

    MovedPointer: ({ pointerId, at }) => ({
      model: moved(model, pointerId, at),
    }),

    ReleasedPointer: ({ pointerId, at, timeStamp, viewportWidth }) =>
      Gesture.match(model.gesture, {
        Idle: () => ({ model }),
        Tracking: (tracking) =>
          tracking.pointerId === pointerId
            ? released(model, tracking, at, timeStamp, viewportWidth)
            : { model },
        // Lifting one finger of a pinch leaves the other still down.
        Pinching: (pinching) => ({
          model: evo(model, {
            gesture: () =>
              pinching.firstId === pointerId
                ? Gesture.Tracking({
                    pointerId: pinching.secondId,
                    origin: pinching.second,
                    last: pinching.second,
                    hasLeftSlop: true,
                  })
                : Gesture.Tracking({
                    pointerId: pinching.firstId,
                    origin: pinching.first,
                    last: pinching.first,
                    hasLeftSlop: true,
                  }),
          }),
        }),
      }),

    CancelledPointer: () => ({
      model: evo(model, { gesture: () => Gesture.Idle() }),
    }),

    ScrolledToZoom: ({ delta, at }) => ({
      model: zoomedTo(model, model.zoom * Math.exp(-delta / 300), at),
    }),

    // Panning by wheel or trackpad, which the page can only need while zoomed.
    ScrolledToPan: ({ delta }) => ({
      model: evo(withPress(model), {
        pan: (pan) => ({ x: pan.x - delta.x, y: pan.y - delta.y }),
      }),
    }),

    ClickedZoomIn: () => ({
      model: zoomedTo(model, model.zoom * 1.25, ORIGIN),
    }),

    ClickedZoomOut: () => ({
      model: zoomedTo(model, model.zoom / 1.25, ORIGIN),
    }),

    // Only the wait started for the current activity may hide the chrome.
    ElapsedChromeIdle: ({ token }) =>
      token === model.activityToken
        ? { model: evo(model, { isChromeVisible: () => false }) }
        : { model },

    PressedKey: ({ key }) =>
      Option.match(messageForKey(model, key), {
        onNone: () => ({ model }),
        onSome: (message) => update(model, message),
      }),
  })
