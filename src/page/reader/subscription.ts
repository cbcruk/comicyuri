import { Duration, Effect, Option, Schema, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { Slider, VirtualList } from '@foldkit/ui'

import { STAGE_ID } from './constant.ts'
import { ZOOM_MIN } from './gesture.ts'
import { handlesKeysItself, isReaderKey } from './keys.ts'
import type { Point } from './gesture.ts'
import { Message } from './message.ts'
import { Model } from './model.ts'

/** How long the chrome waits, with nothing happening, before it hides. */
const CHROME_IDLE = Duration.seconds(3)

/**
 * Pointer positions are reported from the centre of the viewport, the origin
 * the pan offset already uses, so update never has to know the page's size.
 */
const centreRelative = (event: PointerEvent): Point => ({
  x: event.clientX - window.innerWidth / 2,
  y: event.clientY - window.innerHeight / 2,
})

/** A press only counts when it lands on the page, not on the chrome. */
const isOnStage = (event: Event): boolean =>
  event.target instanceof Element && event.target.closest(`#${STAGE_ID}`) !== null

/**
 * `pointerId`, `ctrlKey` and `deltaY` are not on the element-level handlers, and
 * a drag has to keep tracking after the pointer leaves the page it started on,
 * so all of this is read from the document instead of the view.
 */
/** The slider tracks its own drag once a thumb is grabbed. */
const sliderSubscriptions = Subscription.lift({
  sliderPointer: Slider.subscriptions.dragPointer,
  sliderEscape: Slider.subscriptions.dragEscape,
})<Model, Message>({
  toChildModel: (model) => model.slider,
  toParentMessage: (message) => Message.GotSliderMessage({ message }),
})

/** The grid measures its own container and follows its own scroll. */
const thumbsSubscriptions = Subscription.lift({
  thumbsContainer: VirtualList.subscriptions.containerEvents,
})<Model, Message>({
  toChildModel: (model) => model.thumbs,
  toParentMessage: (message) => Message.GotThumbsMessage({ message }),
  when: (model) => model.isThumbsOpen,
})

const readerSubscriptions = Subscription.make<Model, Message>()((entry) => ({
  // The decision to take a key and the `preventDefault` that enforces it have
  // to happen in the same synchronous turn as the browser's dispatch, which is
  // what `fromEventFilterMap` is for. Deciding downstream would let the page
  // scroll on Space before the reader ever saw it, and taking every key would
  // swallow Ctrl+R along the way.
  keyboard: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEventFilterMap<KeyboardEvent, Message>({
          target: document,
          type: 'keydown',
          toMessage: (event) => {
            if (handlesKeysItself(event.target)) return Option.none()

            if (
              !isReaderKey(event.key, {
                ctrl: event.ctrlKey,
                meta: event.metaKey,
                alt: event.altKey,
              })
            ) {
              return Option.none()
            }

            event.preventDefault()
            return Option.some(Message.PressedKey({ key: event.key }))
          },
        }),
    },
  ),

  pointerDown: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEventFilterMap<PointerEvent, Message>({
          target: document,
          type: 'pointerdown',
          toMessage: (event) =>
            isOnStage(event)
              ? Option.some(
                  Message.PressedPointer({
                    pointerId: event.pointerId,
                    at: centreRelative(event),
                  }),
                )
              : Option.none(),
        }),
    },
  ),

  // Move and release only exist while a gesture is live, so a reader who is
  // not touching the page costs nothing.
  pointerMove: entry(
    { isGesturing: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        isGesturing: model.gesture._tag !== 'Idle',
      }),
      dependenciesToStream: ({ isGesturing }) =>
        isGesturing
          ? Subscription.fromEventFilterMap<PointerEvent, Message>({
              target: document,
              type: 'pointermove',
              toMessage: (event) =>
                Option.some(
                  Message.MovedPointer({
                    pointerId: event.pointerId,
                    at: centreRelative(event),
                  }),
                ),
            })
          : Stream.empty,
    },
  ),

  pointerUp: entry(
    { isGesturing: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        isGesturing: model.gesture._tag !== 'Idle',
      }),
      dependenciesToStream: ({ isGesturing }) =>
        isGesturing
          ? Stream.merge(
              Subscription.fromEventFilterMap<PointerEvent, Message>({
                target: document,
                type: 'pointerup',
                toMessage: (event) =>
                  Option.some(
                    Message.ReleasedPointer({
                      pointerId: event.pointerId,
                      at: centreRelative(event),
                      timeStamp: event.timeStamp,
                      viewportWidth: window.innerWidth,
                    }),
                  ),
              }),
              Subscription.fromEventFilterMap<PointerEvent, Message>({
                target: document,
                type: 'pointercancel',
                toMessage: (event) =>
                  Option.some(Message.CancelledPointer({ pointerId: event.pointerId })),
              }),
            )
          : Stream.empty,
    },
  ),

  /**
   * A gesture only ends when the pointer is released, and a window that loses
   * focus or a tab that goes to the background may never deliver that release.
   * The gesture would then still be open when the reader comes back, and the
   * next press would read as a second finger against a stale point.
   */
  pointerAbandon: entry(
    { isGesturing: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        isGesturing: model.gesture._tag !== 'Idle',
      }),
      dependenciesToStream: ({ isGesturing }) =>
        isGesturing
          ? Stream.merge(
              Subscription.fromEventFilterMap<Event, Message>({
                target: document,
                type: 'visibilitychange',
                toMessage: () =>
                  document.hidden ? Option.some(Message.AbandonedPointer()) : Option.none(),
              }),
              Subscription.fromEventFilterMap<Event, Message>({
                target: window,
                type: 'blur',
                toMessage: () => Option.some(Message.AbandonedPointer()),
              }),
            )
          : Stream.empty,
    },
  ),

  // Ctrl+wheel is what a trackpad pinch and a mouse zoom both arrive as.
  wheel: entry(
    { isZoomed: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isZoomed: model.zoom > ZOOM_MIN }),
      dependenciesToStream: ({ isZoomed }) =>
        Subscription.fromEventFilterMap<WheelEvent, Message>({
          target: document,
          type: 'wheel',
          options: { passive: false },
          toMessage: (event) => {
            if (!isOnStage(event)) return Option.none()

            // A zoomed page is larger than the stage, so a plain scroll moves
            // it. Unzoomed there is nothing to move, and the page should
            // scroll the way any page does.
            if (!event.ctrlKey) {
              if (!isZoomed) return Option.none()
              event.preventDefault()
              return Option.some(
                Message.ScrolledToPan({
                  delta: { x: event.deltaX, y: event.deltaY },
                }),
              )
            }

            event.preventDefault()
            return Option.some(
              Message.ScrolledToZoom({
                delta: event.deltaY,
                at: {
                  x: event.clientX - window.innerWidth / 2,
                  y: event.clientY - window.innerHeight / 2,
                },
              }),
            )
          },
        }),
    },
  ),

  fullscreen: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Subscription.fromEventFilterMap<Event, Message>({
          target: document,
          type: 'fullscreenchange',
          toMessage: () =>
            Option.some(
              Message.ChangedFullscreen({
                isFullscreen: document.fullscreenElement !== null,
              }),
            ),
        }),
    },
  ),

  chromeIdle: entry(
    {
      isWaiting: Schema.Boolean,
      activityToken: Schema.Number,
    },
    {
      // The chrome does not time out from under an open thumbnail grid, nor
      // from under a pointer resting on it. Both are someone still using it.
      modelToDependencies: (model) => ({
        isWaiting: model.isChromeVisible && !model.isThumbsOpen && !model.isPointerOverChrome,
        activityToken: model.activityToken,
      }),
      // Every activity changes the token, which restarts this wait.
      // `Stream.tick` emits at once and then on the interval, which would hide
      // the chrome the instant it appeared. Sleeping first is the wait.
      dependenciesToStream: ({ isWaiting, activityToken }) =>
        isWaiting
          ? Stream.fromEffect(
              Effect.as(
                Effect.sleep(CHROME_IDLE),
                Message.ElapsedChromeIdle({ token: activityToken }),
              ),
            )
          : Stream.empty,
    },
  ),
}))

export const subscriptions = Subscription.aggregate<Model, Message>()(
  readerSubscriptions,
  sliderSubscriptions,
  thumbsSubscriptions,
)
