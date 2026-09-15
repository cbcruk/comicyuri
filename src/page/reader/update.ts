import { Array, Option, Order } from 'effect'
import { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import { Slider } from '@foldkit/ui'

import { Reading } from '../../domain/index.ts'
import { nudgedSlideSeconds, nudgedThreshold } from '../../settings.ts'
import type { FitMode } from '../../types.ts'
import { bookmarkFrom } from './bookmark.ts'
import { ToggleFullscreen } from './command.ts'
import { ORIGIN } from './gesture.ts'
import { messageForKey } from './keys.ts'
import { Message, OutMessage } from './message.ts'
import { Model, OpenState, SpreadState, holdsEarlierSpread } from './model.ts'
import type { OpenBookService } from './resource.ts'
import { rotatedRight } from './rotation.ts'
import { NO_ROOM, pannedBy, turnFromEdge } from './scroll.ts'
import { flipBinding, indexOfPage, mirrorForDirection, pagesAt, spreadsFor } from './spread.ts'
import {
  droppedGesture,
  movedPointer,
  pressedPointer,
  releasedPointer,
  zoomedTo,
} from './update/gesture.ts'
import { goToPage, showPage, skip, step } from './update/navigation.ts'
import type { UpdateReturn } from './update/navigation.ts'
import {
  clickedRemoveBookmark,
  clickedToggleBookmarksOnly,
  clickedToggleThumbs,
  completedLoadThumbs,
  gotThumbsMessage,
  measuredThumbsWidth,
  selectedThumb,
} from './update/thumbs.ts'

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
 * 리더가 가진 설정이 바뀌었다. 다시 배치하고 애플리케이션에 알린다.
 *
 * 전역 사본도 앱이 저장할 것과 똑같이 움직인다. 두 곳이 같은 함수로 가르므로,
 * 기억하기를 껐을 때 리더가 돌아가는 자리와 앱에 저장된 기본값이 어긋날 수 없다.
 */
const withSettings = (model: Model, settings: Model['settings']): UpdateReturn => {
  const next = showPage(
    evo(model, {
      settings: () => settings,
      globalSettings: (global) => Reading.split(global, settings).global,
    }),
    model.page,
  )

  return {
    ...next,
    outMessage: OutMessage.ChangedSettings({ bookId: model.bookId, settings }),
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

/**
 * 슬라이더 값에 해당하는 페이지.
 *
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

/**
 * 슬라이더는 트랙 위의 값을 알려 온다. `sliderPage`로 페이지로 되돌려 `goToPage`에
 * 넘기므로, 넘길 때처럼 배율이 풀린다.
 */
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

/** Message 하나를 리더에 접어 넣는다. */
export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    /**
     * 책이 열렸다. 받아 든 자리를 그대로 보여 주되, 그것을 저장된 자리로 적지는
     * 않는다. 리더는 스스로 옮긴 자리만 보고한다.
     *
     * 열자마자 적어 두면 받아 든 자리가 저장된 자리를 덮어쓴다. 첫 장에서 물어보는
     * 동안 저장된 자리가 첫 장이 되어 물음이 스스로를 지우고, 처음부터 보기로 한
     * 사람은 책을 열었다 나가는 것만으로 읽던 자리를 잃는다.
     */
    CompletedOpenBook: ({ title, pageCount, ratios, names }) => {
      const opened = showPage(
        evo(model, {
          openState: () => OpenState.Ready({ title, pageCount, ratios, names }),
          slider: Slider.reflectRange({ min: 0, max: Math.max(0, pageCount - 1) }),
        }),
        model.page,
      )

      return { model: opened.model, commands: opened.commands }
    },

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

    ClickedSkip: ({ pages }) => skip(model, pages),

    /**
     * 적어 넣은 번호로 간다. 책 밖의 번호나 숫자가 아닌 것은 아무 일도 일으키지
     * 않는다 — 잘못 적은 것을 되돌릴 자리가 입력란 자신이기 때문이다.
     */
    SubmittedGoToPage: ({ text }) =>
      OpenState.match(model.openState, {
        Opening: () => ({ model }),
        Failed: () => ({ model }),
        Ready: ({ pageCount }) => {
          const page = Number.parseInt(text, 10) - 1
          return Number.isInteger(page) && page >= 0 && page < pageCount
            ? goToPage(model, page)
            : { model }
        },
      }),

    ClickedCycleFit: () => withSettings(model, evo(model.settings, { fit: nextFit })),

    ClickedToggleBinding: () => flipBindingHere(model),

    /**
     * 페이지를 시계 방향으로 한 번 더 세운다. 자리는 그대로 두고 세우는 각도만
     * 바꾸므로 `showPage`다 — 배율을 되돌릴 이유가 없고, 같은 길로 나가야 새 각도가
     * 읽던 자리와 함께 저장된다.
     */
    ClickedRotate: () =>
      showPage(evo(model, { rotation: (rotation) => rotatedRight(rotation) }), model.page),

    ClickedToggleSettings: () => ({
      model: evo(model, { isSettingsOpen: (open) => !open }),
    }),

    ToggledCoverAlone: ({ isChecked }) =>
      withSettings(model, evo(model.settings, { coverAlone: () => isChecked })),

    ToggledEnlargeToFit: ({ isChecked }) =>
      withSettings(model, evo(model.settings, { enlargeToFit: () => isChecked })),

    /** 반씩 읽기를 켜면 지금 페이지도 그 자리에서 나뉜다. 언제나 앞쪽 반부터다. */
    ToggledSplitWide: ({ isChecked }) =>
      withSettings(
        evo(model, { half: () => 'first' as const }),
        evo(model.settings, { splitWide: () => isChecked }),
      ),

    /**
     * 기억하기를 끄면 이 책이 정한 것을 놓고 전역 기본값으로 돌아간다. 그러지
     * 않으면 이 책의 배치가 그대로 전역 기본값이 되어 다음에 여는 책까지
     * 따라간다.
     */
    ToggledRememberBookSettings: ({ isChecked }) =>
      withSettings(
        model,
        isChecked
          ? evo(model.settings, { rememberBookSettings: () => true })
          : {
              ...model.settings,
              ...Reading.bookPartOf(model.globalSettings),
              rememberBookSettings: false,
            },
      ),

    SelectedAtBookEnd: ({ atBookEnd }) =>
      withSettings(model, evo(model.settings, { atBookEnd: () => atBookEnd })),

    SelectedResume: ({ resume }) =>
      withSettings(model, evo(model.settings, { resume: () => resume })),

    ClickedNudgeThreshold: ({ by }) =>
      withSettings(
        model,
        evo(model.settings, { singleThreshold: (threshold) => nudgedThreshold(threshold, by) }),
      ),

    /**
     * 슬라이드쇼를 돌리거나 멈춘다. 돌기 시작하면 툴바도 함께 숨어, 도는 동안 화면에는
     * 페이지만 남는다.
     *
     * 멈출 때는 툴바를 되부르지 않는다. 슬라이드쇼 전에 손으로 숨겨 둔 사람에게는 되부르는
     * 것이 도리어 끼어드는 일이고, 되부를 길은 `h` 키와 가운데 탭이 이미 가지고 있다.
     */
    ClickedToggleSlideshow: () =>
      model.isPlaying
        ? { model: evo(model, { isPlaying: () => false }) }
        : { model: evo(model, { isPlaying: () => true, isChromeVisible: () => false }) },

    ClickedNudgeSlideSeconds: ({ by }) =>
      withSettings(
        model,
        evo(model.settings, { slideSeconds: (seconds) => nudgedSlideSeconds(seconds, by) }),
      ),

    /**
     * 슬라이드쇼가 한 장을 다 보여 주었다. 더 갈 곳이 없으면 스스로 멈춘다 —
     * 아무도 보고 있지 않을 수 있는 화면에서 마지막 장을 붙들고 도는 것은 도는
     * 것이 아니다.
     */
    ElapsedSlide: () => {
      const turned = step(model, 1)
      const moved =
        turned.model.page !== model.page ||
        turned.model.half !== model.half ||
        turned.outMessage !== undefined

      return moved ? turned : { model: evo(model, { isPlaying: () => false }) }
    },

    GotSliderMessage: ({ message }) => foldSlider(model, message),

    /**
     * 물어본 자리로 간다. 묻는 줄은 답을 받았으므로 사라진다.
     */
    ClickedResume: ({ page }) =>
      goToPage(evo(model, { maybeResumePage: () => Option.none<number>() }), page),

    /** 묻는 줄을 치운다. 읽던 자리는 저장된 그대로 남으므로 다음에 또 물어본다. */
    ClickedDismissResume: () => ({
      model: evo(model, { maybeResumePage: () => Option.none<number>() }),
    }),

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
          rotation: model.rotation,
        }),
      }
    },

    // 바뀐 결과는 document가 `ChangedFullscreen`으로 알린다. Escape로 빠져나올 때도
    // 마찬가지다. 브라우저가 거절하면 아무것도 오지 않고, 상태도 바뀌지 않았으므로
    // 그것으로 맞다.
    ClickedToggleFullscreen: () => ({
      model,
      commands: [ToggleFullscreen({ wantFullscreen: !model.isFullscreen })],
    }),

    CompletedToggleFullscreen: () => ({ model }),

    ChangedFullscreen: ({ isFullscreen }) => ({
      model: evo(model, { isFullscreen: () => isFullscreen }),
    }),

    ClickedToggleThumbs: () => clickedToggleThumbs(model),
    GotThumbsMessage: ({ message }) => gotThumbsMessage(model, message),
    CompletedLoadThumbs: ({ panels }) => completedLoadThumbs(model, panels),
    MeasuredThumbsWidth: ({ width }) => measuredThumbsWidth(model, width),
    ClickedToggleBookmarksOnly: () => clickedToggleBookmarksOnly(model),
    ClickedRemoveBookmark: ({ page }) => clickedRemoveBookmark(model, page),

    /**
     * 앞뒤 북마크로 건너뛴다. 그쪽에 더 남은 북마크가 없으면 제자리에 머문다 —
     * 책의 끝과 달리 여기서 감아 돌면 어디까지 봤는지 알 수 없게 된다.
     */
    ClickedStepBookmark: ({ step }) =>
      Option.match(bookmarkFrom(model.bookmarks, model.page, step), {
        onNone: () => ({ model }),
        onSome: (page) => goToPage(model, page),
      }),

    SelectedThumb: ({ page }) => selectedThumb(model, page),

    PressedPointer: ({ pointerId, at }) => pressedPointer(model, pointerId, at),
    MovedPointer: ({ pointerId, at }) => movedPointer(model, pointerId, at),
    ReleasedPointer: ({ pointerId, at, timeStamp, viewportWidth }) =>
      releasedPointer(model, pointerId, at, timeStamp, viewportWidth),
    CancelledPointer: () => droppedGesture(model),
    AbandonedPointer: () => droppedGesture(model),

    ScrolledToZoom: ({ delta, at }) => ({
      model: zoomedTo(model, model.zoom * Math.exp(-delta / 300), at),
    }),

    /**
     * 휠이나 트랙패드로 굴렸다. 페이지가 아직 갈 곳이 있으면 그만큼 움직이고,
     * 끝에 닿아 있으면 마우스 휠에 한해 페이지를 넘긴다 — 화면에 통째로 들어가는
     * 페이지는 처음부터 끝에 닿아 있으므로 한 칸 굴리는 것이 곧 한 장 넘기는 것이다.
     *
     * 끝에 닿기까지 굴린 그 이벤트로는 넘어가지 않는다. 그 이벤트는 남은 거리를
     * 움직이는 데 쓰였고, 읽던 사람은 아직 페이지의 끝을 보지도 못했다.
     *
     * 넘긴 페이지가 서기 전에 잰 거리는 남아 있는 이전 페이지의 것이다(`R-207`). 확대해
     * 둔 이전 페이지의 거리로 굴리면 확대하지 않은 다음 페이지가 엉뚱한 자리에 앉으므로,
     * 그동안은 갈 곳이 없는 것으로 친다.
     */
    ScrolledStage: ({ delta, room: measured, device }) => {
      const room = holdsEarlierSpread(model) ? NO_ROOM : measured
      const pan = pannedBy(model.pan, delta, room)

      if (pan.x !== model.pan.x || pan.y !== model.pan.y) {
        return { model: evo(model, { pan: () => pan }) }
      }

      if (device === 'trackpad') return { model }

      return Option.match(turnFromEdge(delta, room), {
        onNone: () => ({ model }),
        onSome: (by) => step(model, by),
      })
    },

    ClickedZoomIn: () => ({
      model: zoomedTo(model, model.zoom * 1.25, ORIGIN),
    }),

    ClickedZoomOut: () => ({
      model: zoomedTo(model, model.zoom / 1.25, ORIGIN),
    }),

    ClickedToggleChrome: () => ({
      model: evo(model, { isChromeVisible: (isVisible) => !isVisible }),
    }),

    PressedKey: ({ key, withShift }) =>
      Option.match(messageForKey(model, key, withShift), {
        onNone: () => ({ model }),
        onSome: (message) => update(model, message),
      }),
  })
