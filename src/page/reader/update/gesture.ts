/**
 * 페이지 위의 포인터 제스처를 update로 읽는 자리. 누름과 움직임과 놓음이 탭,
 * 스와이프, 이동, 핀치가 된다.
 *
 * 좌표와 거리 같은 순수한 계산은 `../gesture.ts`에 있고, 여기는 그것을 Model에
 * 거는 쪽이다.
 */

import { Option } from 'effect'
import { evo } from 'foldkit/struct'

import {
  DOUBLE_TAP_MILLIS,
  DOUBLE_TAP_ZOOM,
  MIN_PINCH_SPAN,
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
} from '../gesture.ts'
import type { Point, Side } from '../gesture.ts'
import { Gesture } from '../model.ts'
import type { Model } from '../model.ts'
import { step } from './navigation.ts'
import type { UpdateReturn } from './navigation.ts'

/** 배율을 바꾸되, `anchor` 아래 있던 것이 그 자리에 머물도록 옮긴다. */
export const zoomedTo = (model: Model, nextZoom: number, anchor: Point): Model => {
  const zoom = clampZoom(nextZoom)
  return evo(model, {
    zoom: () => zoom,
    pan: () => panForZoom(zoomAround(model.pan, model.zoom, zoom, anchor), zoom),
  })
}

/** 누름은 추적을 시작하거나, 이미 있는 추적에 붙어 핀치가 된다. */
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
      // 같은 포인터가 다시 눌렀다면 앞선 흐름이 끝내 놓이지 않은 것이지 —
      // `pointerup`을 놓친 것이다 — 두 번째 손가락이 아니다. 이것을 핀치로 읽으면
      // 낡은 점과 새 점 사이를 재게 되고, 그 비율이 닿는 아무 데로나 배율이 튄다.
      tracking.pointerId === pointerId || distance(tracking.last, at) < MIN_PINCH_SPAN
        ? evo(model, {
            gesture: () =>
              Gesture.Tracking({
                pointerId,
                origin: at,
                last: at,
                hasLeftSlop: false,
              }),
          })
        : evo(model, {
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
    // 세 번째 손가락은 이 리더가 아는 제스처가 아니다.
    Pinching: () => model,
  })

/**
 * 가리킨 방향이 눈에 보이는 대로 한 걸음 옮긴다. 오른쪽에서 왼쪽으로 읽으면 다음
 * 페이지가 왼쪽에 있고, 그래서 왼쪽 탭이 만화를 앞으로 넘긴다.
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

      // 페이지가 화면보다 커야 옮기는 것이 뜻을 갖는다.
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
 * 누름이 마침내 뜻을 갖는 자리가 놓음이다. 옮기는 일은 움직이는 동안 이미
 * 적용했으므로, 여기 남는 것은 페이지가 화면에 들어맞을 때 누름이 뜻하는 것 —
 * 스와이프이거나, 세 구역 중 한 곳의 탭이다.
 */
const released = (
  model: Model,
  tracking: typeof Gesture.Tracking.Type,
  at: Point,
  timeStamp: number,
  viewportWidth: number,
): UpdateReturn => {
  const settled = evo(model, { gesture: () => Gesture.Idle() })

  // 드래그는 결코 탭이 아니며, 앞선 탭이 열어 둔 짝도 닫는다.
  if (tracking.hasLeftSlop) {
    const dragged = evo(settled, { lastTapAt: () => 0 })

    // 확대된 상태에서 움직인 누름은 이동이었고, 이미 적용되어 있다.
    if (model.zoom > ZOOM_MIN) return { model: dragged }

    const swipe = swipeFrom(tracking.origin, at)
    return swipe === 'Middle' ? { model: dragged } : step(dragged, stepForSide(dragged, swipe))
  }

  const zone = zoneAt(at.x, viewportWidth)

  // 바깥쪽 1/3은 페이지를 넘길 뿐 다른 일은 하지 않는다. 그곳을 빠르게 두 번
  // 탭하는 것은 빨리 읽고 있다는 뜻이고, 그것을 확대 요청으로 읽었기에 트랙패드에서
  // 두 페이지를 넘긴 것이 확대가 되었다.
  if (zone !== 'Middle') {
    const turning = evo(settled, { lastTapAt: () => 0 })
    return withTapFlash(step(turning, stepForSide(turning, zone)), turning.page, zone)
  }

  // 가운데가 모드가 사는 곳이다. 한 번은 툴바, 두 번은 줌.
  if (timeStamp - model.lastTapAt < DOUBLE_TAP_MILLIS) {
    // 여기서 써 버리므로, 세 번째 탭은 이것을 되돌리지 않고 새 짝을 연다.
    const consumed = evo(settled, { lastTapAt: () => 0 })

    return {
      model:
        model.zoom > ZOOM_MIN
          ? evo(consumed, { zoom: () => ZOOM_MIN, pan: () => ORIGIN })
          : zoomedTo(consumed, DOUBLE_TAP_ZOOM, at),
    }
  }

  return {
    model: evo(settled, {
      lastTapAt: () => timeStamp,
      isChromeVisible: (visible) => !visible,
    }),
  }
}

/**
 * 페이지가 어느 쪽에서 왔는지 표시한다. 다만 실제로 넘어갔을 때만이다. 같은 만화의
 * 두 페이지는 넘김이 같은 이미지가 움직인 것처럼 보일 만큼 닮을 수 있고, 책 끝에서는
 * 일어나지도 않은 넘김을 표시가 주장하게 된다.
 */
const withTapFlash = (turned: UpdateReturn, pageBefore: number, side: Side): UpdateReturn =>
  turned.model.page === pageBefore
    ? turned
    : {
        ...turned,
        model: evo(turned.model, {
          maybeTapFlash: (flash) =>
            Option.some({
              side,
              token: Option.match(flash, {
                onNone: () => 0,
                onSome: ({ token }) => token + 1,
              }),
            }),
        }),
      }

/** 포인터가 페이지를 눌렀다. 추적을 시작하거나 핀치로 잇는다. */
export const pressedPointer = (model: Model, pointerId: number, at: Point): UpdateReturn => ({
  model: pressed(model, pointerId, at),
})

/** 누른 포인터가 움직였다. 확대된 페이지를 옮기거나 핀치의 배율을 바꾼다. */
export const movedPointer = (model: Model, pointerId: number, at: Point): UpdateReturn => ({
  model: moved(model, pointerId, at),
})

/**
 * 포인터를 뗐다. 추적하던 포인터면 스와이프나 탭으로 읽고, 핀치 중이었다면 남은
 * 손가락으로 추적을 잇는다.
 */
export const releasedPointer = (
  model: Model,
  pointerId: number,
  at: Point,
  timeStamp: number,
  viewportWidth: number,
): UpdateReturn =>
  Gesture.match(model.gesture, {
    Idle: () => ({ model }),
    Tracking: (tracking) =>
      tracking.pointerId === pointerId
        ? released(model, tracking, at, timeStamp, viewportWidth)
        : { model },
    // 핀치에서 손가락 하나를 떼도 다른 하나는 아직 눌려 있다.
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
  })

/**
 * 제스처를 버린다. 브라우저가 누름을 거두었거나(`CancelledPointer`), 제스처가 열린
 * 채로 페이지를 만질 수 없게 되었을 때(`AbandonedPointer`)다. 어느 쪽이든 제스처가
 * 쥐고 있던 것은 더 이상 사실이 아니다.
 */
export const droppedGesture = (model: Model): UpdateReturn => ({
  model: evo(model, { gesture: () => Gesture.Idle() }),
})
