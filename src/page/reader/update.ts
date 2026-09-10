import { Array, Option, Order } from 'effect'
import { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import type { FitMode } from '../../types.ts'
import { LoadSpread, LoadThumbs, PreloadNeighbours, ToggleFullscreen } from './command.ts'
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
} from './gesture.ts'
import type { Point, Side } from './gesture.ts'
import { Slider, VirtualList } from '@foldkit/ui'

import { messageForKey } from './keys.ts'
import { Message, OutMessage } from './message.ts'
import { Gesture, Model, OpenState, SpreadState } from './model.ts'
import type { OpenBookService } from './resource.ts'
import { loadedPages, missingFrom, pagesInView } from './thumbs.ts'
import {
  flipBinding,
  indexOfPage,
  mirrorForDirection,
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
 * 위치나 배치가 바뀐 뒤에 리더가 해야 하는 모든 일. 화면에 걸릴 이미지를 요청하고,
 * 이웃을 데우고, 나머지를 놓아 준다.
 */
const showPage = (model: Model, page: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model: evo(model, { page: () => page }) }),
    Failed: () => ({ model: evo(model, { page: () => page }) }),
    Ready: ({ pageCount, ratios }) => {
      const spreads = spreadsFor({ pageCount, ratios, marks: model.marks }, model.settings)
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
            // 화면의 썸네일이 바로 이 페이지들의 URL을 쥐고 있으므로, 놓아
            // 주면 격자가 빈다.
            keep: Array.appendAll(pagesToKeep(spreads, index), loadedPages(model.thumbPanels)),
          }),
        ],
        outMessage: OutMessage.UpdatedProgress({
          bookId: model.bookId,
          page,
          bookmarks: model.bookmarks,
          marks: model.marks,
        }),
      }
    },
  })

/**
 * 다른 페이지로 옮기면 처음부터 시작한다. pan 오프셋은 떠나는 페이지를 기준으로
 * 잰 값이라 그대로 가져가면 다음 페이지의 엉뚱한 곳에 앉는다 — 이것이 이 뷰어가
 * 대신한 예전 뷰어가 넘길 때와 건너뛸 때마다 초기화한 이유다. 설정을 바꾼 뒤 같은
 * 페이지를 다시 보여 줄 때는 배율을 지킨다.
 */
const goToPage = (model: Model, page: number): UpdateReturn =>
  showPage(evo(model, { zoom: () => ZOOM_MIN, pan: () => ORIGIN }), page)

const step = (model: Model, by: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model }),
    Failed: () => ({ model }),
    Ready: ({ pageCount, ratios }) =>
      goToPage(
        model,
        pageAfterStep(
          spreadsFor({ pageCount, ratios, marks: model.marks }, model.settings),
          model.page,
          by,
        ),
      ),
  })

/** 리더가 가진 설정이 바뀌었다. 다시 배치하고 애플리케이션에 알린다. */
const withSettings = (model: Model, settings: Model['settings']): UpdateReturn => {
  const next = showPage(evo(model, { settings: () => settings }), model.page)

  return {
    ...next,
    outMessage: OutMessage.ChangedSettings({ settings }),
  }
}

/**
 * 지금 보고 있는 스프레드의 묶기를 뒤집는다. 자리는 그대로 두고 배치만 바꾸므로
 * `goToPage`가 아니라 `showPage`다 — 배율을 되돌릴 이유가 없다.
 *
 * 한 장 모드에는 뒤집을 묶기가 없다.
 */
const flipBindingHere = (model: Model): UpdateReturn =>
  model.settings.view === 'single'
    ? { model }
    : OpenState.match(model.openState, {
        Opening: () => ({ model }),
        Failed: () => ({ model }),
        Ready: ({ pageCount, ratios }) => {
          const layout = { pageCount, ratios, marks: model.marks }
          const spreads = spreadsFor(layout, model.settings)
          const marks = flipBinding(model.marks, pagesAt(spreads, indexOfPage(spreads, model.page)))

          return showPage(evo(model, { marks: () => marks }), model.page)
        },
      })

/** 툴바를 다시 불러오고, 그것을 숨기는 대기를 처음부터 다시 시작한다. */
const withActivity = (model: Model): Model =>
  evo(model, {
    isChromeVisible: () => true,
    activityToken: (token) => token + 1,
  })

/**
 * 누름은 대기를 다시 시작시키지만 그 자체로 툴바를 보이지는 않는다. 페이지
 * 가운데를 탭하는 것은 툴바를 토글하라는 뜻인데, 누르는 길에 보여 버리면 그
 * 탭들이 하나같이 '숨김'으로 끝난다.
 */
const withPress = (model: Model): Model => evo(model, { activityToken: (token) => token + 1 })

const zoomedTo = (model: Model, nextZoom: number, anchor: Point): Model => {
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
      activityToken: (token) => token + 1,
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

/**
 * 슬라이더는 자기 값으로 일하고, 오른쪽에서 왼쪽으로 읽을 때 그 값은 반대로 간다.
 * 이 매핑은 스스로의 역함수라서, 같은 호출이 뷰에서는 페이지를 값으로 바꾸고
 * 여기서는 값을 다시 페이지로 되돌린다.
 */
export const sliderPage = (model: Model, value: number): number =>
  mirrorForDirection(
    value,
    OpenState.match(model.openState, {
      Opening: () => 0,
      Failed: () => 0,
      Ready: ({ pageCount }) => pageCount,
    }),
    model.settings.direction,
  )

/** 슬라이더는 페이지를 알려 오고, 그것이 바로 `showPage`가 받는 것이다. */
const foldSliderOutMessage = Slider.OutMessage.match<
  Update.StepWithOutMessage<Model, Message, OutMessage, OpenBookService>
>({
  ChangedValue:
    ({ value }) =>
    (model) =>
      goToPage(model, sliderPage(model, value)),
})

const foldSlider = Update.foldChild({
  update: Slider.update,
  read: (model: Model) => Option.some(model.slider),
  write: (model, nextSlider) => evo(model, { slider: () => nextSlider }),
  toParentMessage: (message) => Message.GotSliderMessage({ message }),
  foldOutMessage: foldSliderOutMessage,
})

/** 격자가 보여 줄 수 있으면서 아직 뽑지 않은 것을 요청한다. */
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
 * 이 Message가 누군가 컨트롤을 쓴 것인지. 그렇다면 툴바를 띄워 두고 그것을 숨기는
 * 대기를 처음부터 다시 시작한다.
 *
 * 들를 핸들러 목록이 아니라 Message의 이름을 기준으로 삼는다. 쓰고 있는 사람 밑에서
 * 툴바가 사라지게 만든 것이 바로 그 목록이었다. 그 뒤로 더해진 컨트롤마다 목록에
 * 적어 넣기를 기억해야 했고, 아무도 기억하지 않았다. `Clicked*`와 `Selected*`는
 * 이미 사람이 컨트롤에 손댔다는 뜻이므로, 규약대로 이름 붙인 새 컨트롤은 저절로
 * 포함된다.
 *
 * 포인터 Message는 일부러 빠져 있다. 누름이 툴바를 보여서는 안 된다. 그러면 툴바를
 * 토글하는 탭이 매번 '숨김'으로 끝난다.
 */
const isControlUse = (message: Message): boolean =>
  message._tag !== 'ClickedExit' &&
  (message._tag.startsWith('Clicked') ||
    message._tag.startsWith('Selected') ||
    message._tag === 'PressedKey' ||
    message._tag === 'ScrolledToZoom' ||
    message._tag === 'GotSliderMessage')

/**
 * Message 하나를 리더에 접어 넣는다.
 *
 * 사람이 일부러 한 일은 모두 활동으로도 쳐서 툴바를 되불러오고 숨김 대기를 다시
 * 시작시킨다 — 그래서 그 처리가 아래 모든 분기에 되풀이되는 대신 여기에 있다.
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  applyMessage(isControlUse(message) ? withActivity(model) : model, message)

const applyMessage = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    CompletedOpenBook: ({ title, pageCount, ratios }) =>
      showPage(
        evo(model, {
          openState: () => OpenState.Ready({ title, pageCount, ratios }),
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

    // 이미 떠난 페이지에 대한 답은 지금 묻고 있는 질문의 답이 아니다.
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

    ClickedToggleBinding: () => flipBindingHere(model),

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
          marks: model.marks,
        }),
      }
    },

    // 결과는 document가 `ChangedFullscreen`으로 알린다. 브라우저가 거절했을 때나
    // Escape로 빠져나왔을 때도 마찬가지다.
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
              // 이제 아무도 그것들을 보여 주지 않으므로, 그 출처인 페이지들은
              // 다음 넘김에 놓아 주어도 된다.
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
      }),

    CancelledPointer: () => ({
      model: evo(model, { gesture: () => Gesture.Idle() }),
    }),

    // 제스처가 열린 채로 페이지를 만질 수 없게 되었으므로, 그것이 쥐고 있던 것은
    // 더 이상 사실이 아니다.
    AbandonedPointer: () => ({
      model: evo(model, { gesture: () => Gesture.Idle() }),
    }),

    ScrolledToZoom: ({ delta, at }) => ({
      model: zoomedTo(model, model.zoom * Math.exp(-delta / 300), at),
    }),

    // 휠이나 트랙패드로 옮기기. 확대된 동안에만 필요한 일이다.
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

    EnteredChrome: () => ({
      model: evo(model, { isPointerOverChrome: () => true }),
    }),

    // 벗어날 때는 대기를 다시 시작한다. 포인터가 오기 전의 대기가 곧바로 끝나
    // 버리게 두지 않는다.
    LeftChrome: () => ({
      model: evo(model, {
        isPointerOverChrome: () => false,
        activityToken: (token) => token + 1,
      }),
    }),

    // 지금의 활동을 위해 시작된 대기만 툴바를 숨길 수 있다.
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
