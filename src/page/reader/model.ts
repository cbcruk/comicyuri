import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Slider, VirtualList } from '@foldkit/ui'

import { Reading } from '../../domain/index.ts'
import { PageMark, Rotation, Settings } from '../../types.ts'
import type { BookSettings } from '../../types.ts'
import { SLIDER_ID, THUMBS_DEFAULT_WIDTH, THUMBS_ID } from './constant.ts'
import { rowHeightFor } from './thumbs.ts'
import { ORIGIN, Point, Side, ZOOM_MIN } from './gesture.ts'
import { Half } from './half.ts'

/**
 * 책을 여는 일이 어디까지 왔는지.
 *
 * `Ready`가 페이지 비를 지고 있는 이유는 스프레드 묶기가 그것을 보기 때문이다.
 * 넓은 페이지는 짝을 짓지 않으므로, 페이지 수만으로는 무엇이 한 화면인지 정할
 * 수 없다.
 */
export const OpenState = defineTaggedUnion({
  Opening: {},
  Ready: {
    title: Schema.String,
    pageCount: Schema.Number,
    /** 페이지별 가로세로비. 임포트할 때 재지 못한 페이지는 없음이다. */
    ratios: Schema.Array(Schema.Option(Schema.Number)),
    /**
     * 페이지별 파일 이름. 폴더는 떼어 낸 것이다.
     *
     * 정렬이 이상할 때 그것을 알아볼 유일한 단서다 — 화면에 걸린 것이 몇 번째
     * 페이지인지는 카운터가 말해 주지만, 그 번호가 왜 그 그림인지는 파일 이름만이
     * 말해 준다.
     */
    names: Schema.Array(Schema.String),
  },
  Failed: { text: Schema.String },
})

/** {@linkcode OpenState} 유니온의 디코딩된 값. */
export type OpenState = typeof OpenState.Type

/**
 * 페이지에 들어선 쪽. 앞으로 넘기면 페이지의 처음이고, 뒤로 넘기면 끝이다.
 *
 * 화면에 통째로 들어가는 페이지에는 처음도 끝도 없다 — 그런 페이지는 어느 쪽에서
 * 들어서든 가운데에 놓인다.
 */
export const PageEntry = Schema.Literals(['start', 'end'])

/** {@linkcode PageEntry} 스키마의 디코딩된 값. */
export type PageEntry = typeof PageEntry.Type

/** 화면에 걸린 이미지 하나. */
export const Panel = Schema.Struct({
  page: Schema.Number,
  url: Schema.String,
})

/** {@linkcode Panel} 스키마의 디코딩된 값. */
export type Panel = typeof Panel.Type

/**
 * 넘기기 직전에 화면에 걸려 있던 스프레드. 다음 것이 그릴 수 있게 될 때까지 그대로
 * 둔다(`R-207`).
 *
 * 그 페이지를 그릴 때 쓰던 `entry`, `half`, 배율과 이동을 함께 지닌다. 넘기는 순간
 * Model의 이 값들은 이미 다음 페이지의 것이라, 그것으로 이전 페이지를 그리면 끝에
 * 붙거나 반쪽이 바뀌거나 확대가 풀려 한 번 튄다.
 */
export const OnScreen = Schema.Struct({
  page: Schema.Number,
  panels: Schema.Array(Panel),
  entry: PageEntry,
  half: Half,
  zoom: Schema.Number,
  pan: Point,
})

/** {@linkcode OnScreen} 스키마의 디코딩된 값. */
export type OnScreen = typeof OnScreen.Type

/**
 * 지금 스프레드에 대해 화면이 보여 주고 있는 것.
 *
 * `Loading`은 다음 스프레드를 부르는 중이다. 그동안 보여 줄 이전 스프레드가 있으면
 * 그것을 지니고, 책을 막 열었을 때처럼 없으면 비어 있다.
 */
export const SpreadState = defineTaggedUnion({
  Loading: { maybeOnScreen: Schema.Option(OnScreen) },
  Shown: { panels: Schema.Array(Panel) },
  Failed: { text: Schema.String },
})

/** {@linkcode SpreadState} 유니온의 디코딩된 값. */
export type SpreadState = typeof SpreadState.Type

/**
 * 페이지를 넘긴 가장 최근의 탭. 화면이 어느 쪽에서 온 탭인지 보여 줄 수 있도록
 * 남긴다. `token`은 넘길 때마다 바뀌고, 그것이 같은 쪽을 두 번 탭했을 때
 * 애니메이션을 다시 시작시킨다.
 */
export const TapFlash = Schema.Struct({
  side: Side,
  token: Schema.Number,
})

/** {@linkcode TapFlash} 스키마의 디코딩된 값. */
export type TapFlash = typeof TapFlash.Type

/**
 * 지금 포인터들이 하고 있는 일.
 *
 * `Tracking`은 일부러 정하지 않은 상태다. 같은 누름이 얼마나 움직였는지와
 * 페이지가 확대되어 있는지에 따라 탭이 되기도, 스와이프가 되기도, 이동이
 * 되기도 하는데, 그 어느 것도 움직이거나 떼기 전에는 알 수 없다.
 */
export const Gesture = defineTaggedUnion({
  Idle: {},
  Tracking: {
    pointerId: Schema.Number,
    origin: Point,
    last: Point,
    hasLeftSlop: Schema.Boolean,
  },
  Pinching: {
    firstId: Schema.Number,
    secondId: Schema.Number,
    first: Point,
    second: Point,
    startSpan: Schema.Number,
    startZoom: Schema.Number,
  },
})

/** {@linkcode Gesture} 유니온의 디코딩된 값. */
export type Gesture = typeof Gesture.Type

/**
 * 책 한 권을 열어 둔 리더의 상태.
 *
 * 위치의 기준은 스프레드 번호가 아니라 `page`다. 한 장/두 장을 바꿔도 살아남고,
 * 저장되는 것도 이 값이다. 스프레드는 매번 그릴 때 이 값과 페이지 수, 페이지 비,
 * 묶기 교정, 설정에서 이끌어 낸다.
 *
 * 페이지 이미지 URL은 일부러 여기에 두지 않았다. 그것들은 열린 책 리소스가 쥔
 * `Page` 객체 안에 살면서 캐시되고 놓이므로, Model은 지금 화면에 걸린 몇 장과
 * 격자가 열려 있는 동안 뽑아 둔 썸네일만 지고 있으면 된다.
 */
export const Model = Schema.Struct({
  bookId: Schema.String,
  openState: OpenState,
  spread: SpreadState,
  page: Schema.Number,
  bookmarks: Schema.Array(Schema.Number),
  /** 자동 묶기가 틀렸을 때 사람이 고쳐 둔 것. 책마다 저장된다. */
  marks: Schema.Array(PageMark),
  /** 이 책을 세워 둔 각도. 묶기 교정과 같이 책마다 저장된다. */
  rotation: Rotation,
  /**
   * 지금 이 책에 걸려 있는 설정. 전역 기본값과 이 책의 것을 합친 결과다.
   */
  settings: Settings,
  /**
   * 합치기 전의 전역 기본값.
   *
   * 책마다 기억하기를 껐을 때 무엇으로 돌아갈지 아는 데 필요하다. 그 순간
   * 리더가 쥔 것은 이 책의 설정이고, 앱에 물어볼 길은 없다.
   */
  globalSettings: Settings,

  zoom: Schema.Number,
  pan: Point,
  gesture: Gesture,
  /**
   * 이 페이지에 어느 쪽에서 들어섰는지. 뒤로 넘겨 온 페이지는 화면보다 길면
   * 끝에서 시작한다 — 되돌아 읽는 움직임과 맞는다.
   */
  entry: PageEntry,
  /** 나뉜 페이지에서 보고 있는 반쪽. 나뉘지 않는 페이지에서는 쓰이지 않는다. */
  half: Half,

  /**
   * 저장된 자리로 갈지 묻고 있는 페이지. 묻지 않는 동안에는 없음이다.
   *
   * 물어보기로 한 사람에게만 생긴다(`Resume`). 답하기 전까지 사라지지 않으므로,
   * 첫 장부터 읽다가 나중에 눌러도 그 자리로 간다.
   */
  maybeResumePage: Schema.Option(Schema.Number),

  /** 슬라이드쇼가 돌고 있는지. 돌면 정해 둔 시간마다 스스로 넘어간다. */
  isPlaying: Schema.Boolean,
  /**
   * 툴바와 푸터가 화면에 있는지. 스스로 숨지 않고, 사람이 숨기거나 슬라이드쇼를
   * 시작할 때만 내려간다.
   *
   * 숨으면 흐려지는 것이 아니라 레이아웃에서 빠진다. 그래야 스테이지가 그 높이를
   * 가져가고, 숨기는 일이 읽을 자리를 넓힌다.
   */
  isChromeVisible: Schema.Boolean,
  /**
   * 짝을 기다리는 가운데 탭이 떨어진 시각(이벤트의 `timeStamp`, 밀리초). 다음 탭이
   * 더블인지 알아보는 데 쓰고, 기다리는 탭이 없으면 없음이다.
   *
   * `0`으로 없음을 대신하지 않는다. `timeStamp`는 문서가 열린 순간부터 세므로, 열리고
   * 300ms 안에 온 첫 탭이 있지도 않은 탭과 짝지어져 툴바 대신 확대가 된다.
   */
  maybeLastTapAt: Schema.Option(Schema.Number),
  maybeTapFlash: Schema.Option(TapFlash),

  slider: Slider.Model,

  isFullscreen: Schema.Boolean,
  /** 읽는 규칙을 한 번 정해 두는 패널. 툴바와 달리 읽는 동안 쓰는 것이 아니다. */
  isSettingsOpen: Schema.Boolean,
  isThumbsOpen: Schema.Boolean,
  /** 격자가 북마크한 페이지만 늘어놓고 있는지. 그것이 곧 북마크 목록이다. */
  showsBookmarksOnly: Schema.Boolean,
  /**
   * 격자가 놓인 곳의 너비(픽셀). 몇 칸이 서고 칸이 얼마나 넓고 행이 얼마나
   * 높은지가 모두 여기서 나온다.
   *
   * 재어 둔 값 하나에서 갈라 내는 이유는 셋이 서로 맞물려 있기 때문이다. 따로
   * 두면 어긋난 채로 그려지고, 그러면 보이지 않는 썸네일을 뽑거나 보이는 자리를
   * 비워 둔다.
   */
  thumbsWidth: Schema.Number,
  thumbs: VirtualList.Model,
  /** 지금까지 뽑아 둔 썸네일. 격자는 보여 줄 수 있는 것만 요청한다. */
  thumbPanels: Schema.Array(Panel),
})

/** {@linkcode Model} 스키마의 디코딩된 값. */
export type Model = typeof Model.Type

/**
 * 지금 화면에 걸려 있는 스프레드. 불러오는 중이면 그동안 남겨 둔 이전 것이고, 실패했으면
 * 없다.
 */
export const onScreen = (model: Model): Option.Option<OnScreen> =>
  SpreadState.match(model.spread, {
    Shown: ({ panels }) =>
      Option.some({
        page: model.page,
        panels,
        entry: model.entry,
        half: model.half,
        zoom: model.zoom,
        pan: model.pan,
      }),
    Loading: ({ maybeOnScreen }) => maybeOnScreen,
    Failed: () => Option.none(),
  })

/**
 * 화면에 걸린 스프레드가 Model이 가리키는 페이지와 배율이 아닌지. 넘긴 페이지가 아직
 * 서지 않아 이전 것이 남아 있을 때다(`R-207`).
 *
 * 그동안 화면에서 잰 값은 남아 있는 페이지의 것이라, Model의 페이지에 대한 사실이 아니다.
 */
export const holdsEarlierSpread = (model: Model): boolean =>
  Option.exists(
    onScreen(model),
    (shown) =>
      shown.page !== model.page ||
      shown.zoom !== model.zoom ||
      shown.pan.x !== model.pan.x ||
      shown.pan.y !== model.pan.y,
  )

/**
 * {@linkcode init}이 책을 열기 위해 필요한 것. 어느 책을 어디에 걸지, 그리고 그
 * 책에 남아 있는 북마크·교정·설정.
 */
export type InitConfig = Readonly<{
  /** 어느 책을 열지. 진행 상태를 저장하는 키이기도 하다. */
  bookId: string
  /** 리더가 처음 걸 페이지. */
  page: number
  /**
   * 저장된 자리로 갈지 물어볼 페이지. 묻지 않기로 했으면 없음이다.
   * `Reading.opening`이 설정을 보고 이것과 `page`를 함께 정한다.
   */
  maybeResumePage: Option.Option<number>
  /** 이미 북마크된 페이지들. */
  bookmarks: ReadonlyArray<number>
  /** 이 책에 걸어 둔 묶기 교정. */
  marks: ReadonlyArray<PageMark>
  /** 이 책을 세워 둔 각도. */
  rotation: Rotation
  /** 이 책에만 걸린 설정. 기억하기가 꺼져 있으면 쓰이지 않는다. */
  maybeBookSettings: Option.Option<BookSettings>
  /** 전역 기본값. 리더가 고치고 위로 알린다. */
  settings: Settings
}>

/**
 * `config.page`에 가 있는 리더를 만든다. 책은 그 뒤에서 아직 열리는 중이다.
 *
 * 슬라이더에는 아직 범위가 없다 — 페이지 수는 책과 함께 도착한다 — 그래서 그때가
 * 오기 전까지는 아무것도 끌 수 없다.
 */
export const init = (config: InitConfig): Model => ({
  bookId: config.bookId,
  openState: OpenState.Opening(),
  spread: SpreadState.Loading({ maybeOnScreen: Option.none() }),
  page: config.page,
  maybeResumePage: config.maybeResumePage,
  bookmarks: config.bookmarks,
  marks: config.marks,
  rotation: config.rotation,
  settings: Reading.forBook(config.settings, config.maybeBookSettings),
  globalSettings: config.settings,
  zoom: ZOOM_MIN,
  pan: ORIGIN,
  gesture: Gesture.Idle(),
  entry: 'start',
  half: 'first',
  isPlaying: false,
  isChromeVisible: true,
  maybeLastTapAt: Option.none(),
  maybeTapFlash: Option.none(),
  // 책이 페이지 수를 말해 주기 전까지 범위는 비어 있다.
  slider: Slider.init({ id: SLIDER_ID, min: 0, max: 0, step: 1 }),
  isFullscreen: false,
  isSettingsOpen: false,
  isThumbsOpen: false,
  showsBookmarksOnly: false,
  thumbsWidth: THUMBS_DEFAULT_WIDTH,
  thumbs: VirtualList.init({
    id: THUMBS_ID,
    rowHeightPx: rowHeightFor(THUMBS_DEFAULT_WIDTH),
  }),
  thumbPanels: [],
})
