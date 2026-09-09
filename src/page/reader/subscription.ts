import { Duration, Effect, Option, Schema, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { Slider, VirtualList } from '@foldkit/ui'

import { STAGE_ID } from './constant.ts'
import { ZOOM_MIN } from './gesture.ts'
import { handlesKeysItself, isReaderKey } from './keys.ts'
import type { Point } from './gesture.ts'
import { Message } from './message.ts'
import { Model } from './model.ts'

/** 아무 일도 없을 때 툴바가 숨기까지 기다리는 시간. */
const CHROME_IDLE = Duration.seconds(3)

/**
 * 포인터 위치는 뷰포트 한가운데를 기준으로 전한다. pan 오프셋이 이미 쓰는
 * 원점이라서, update는 페이지 크기를 알 필요가 없다.
 */
const centreRelative = (event: PointerEvent): Point => ({
  x: event.clientX - window.innerWidth / 2,
  y: event.clientY - window.innerHeight / 2,
})

/** 누름은 툴바가 아니라 페이지 위에 떨어졌을 때만 친다. */
const isOnStage = (event: Event): boolean =>
  event.target instanceof Element && event.target.closest(`#${STAGE_ID}`) !== null

/** thumb을 잡은 뒤의 드래그는 슬라이더가 스스로 따라간다. */
const sliderSubscriptions = Subscription.lift({
  sliderPointer: Slider.subscriptions.dragPointer,
  sliderEscape: Slider.subscriptions.dragEscape,
})<Model, Message>({
  toChildModel: (model) => model.slider,
  toParentMessage: (message) => Message.GotSliderMessage({ message }),
})

/** 격자는 자기 컨테이너를 재고 자기 스크롤을 따라간다. */
const thumbsSubscriptions = Subscription.lift({
  thumbsContainer: VirtualList.subscriptions.containerEvents,
})<Model, Message>({
  toChildModel: (model) => model.thumbs,
  toParentMessage: (message) => Message.GotThumbsMessage({ message }),
  when: (model) => model.isThumbsOpen,
})

/**
 * `pointerId`와 `ctrlKey`, `deltaY`는 요소 단위 핸들러에 실려 오지 않고, 드래그는
 * 포인터가 시작한 페이지를 벗어난 뒤에도 계속 따라가야 한다. 그래서 이 모두를
 * 뷰가 아니라 document에서 읽는다.
 */
const readerSubscriptions = Subscription.make<Model, Message>()((entry) => ({
  // 키를 가져가겠다는 결정과 그것을 관철하는 `preventDefault`는 브라우저가
  // 이벤트를 흘리는 것과 같은 동기 턴 안에서 일어나야 하고, `fromEventFilterMap`이
  // 그것을 위한 것이다. 뒤에서 결정하면 리더가 보기도 전에 Space로 페이지가
  // 스크롤되고, 모든 키를 가져가면 Ctrl+R까지 삼킨다.
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

  // 이동과 놓음은 제스처가 살아 있는 동안에만 존재한다. 그래서 페이지를 건드리지
  // 않는 사람에게는 아무 값도 들지 않는다.
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
   * 제스처는 포인터를 놓아야 끝나는데, 창이 포커스를 잃거나 탭이 뒤로 넘어가면
   * 그 놓음이 끝내 오지 않을 수 있다. 그러면 돌아왔을 때도 제스처가 열린 채라서,
   * 다음 누름이 낡은 지점을 상대로 한 두 번째 손가락으로 읽힌다.
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

  // 트랙패드 핀치와 마우스 줌은 둘 다 Ctrl+휠로 도착한다.
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

            // 확대된 페이지는 화면보다 크므로 그냥 스크롤하면 페이지가 움직인다.
            // 확대되지 않았다면 움직일 것이 없고, 여느 페이지처럼 스크롤되면
            // 된다.
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
      // 썸네일 격자가 열려 있거나 포인터가 그 위에 머무는 동안에는 툴바의 시간이
      // 흐르지 않는다. 둘 다 아직 쓰고 있다는 뜻이다.
      modelToDependencies: (model) => ({
        isWaiting: model.isChromeVisible && !model.isThumbsOpen && !model.isPointerOverChrome,
        activityToken: model.activityToken,
      }),
      // 무슨 일이든 있으면 토큰이 바뀌고, 그러면 이 대기가 처음부터 다시 간다.
      // `Stream.tick`은 곧바로 한 번 흘리고 그다음부터 간격을 두므로, 툴바가
      // 나타나는 순간 숨겨 버린다. 먼저 자는 것이 곧 대기다.
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

/**
 * 리더가 듣는 모든 것. document의 키보드와 포인터, 전체화면 상태, 툴바를 숨기는
 * 대기, 그리고 슬라이더와 페이지 격자가 필요로 해서 리더 안으로 lift 한 드래그
 * 스트림들.
 */
export const subscriptions = Subscription.aggregate<Model, Message>()(
  readerSubscriptions,
  sliderSubscriptions,
  thumbsSubscriptions,
)
