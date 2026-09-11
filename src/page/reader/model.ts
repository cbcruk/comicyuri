import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Slider, VirtualList } from '@foldkit/ui'

import { Reading } from '../../domain/index.ts'
import { PageMark, Rotation, Settings } from '../../types.ts'
import type { BookSettings } from '../../types.ts'
import { SLIDER_ID, THUMBS_ID, THUMB_ROW_HEIGHT } from './constant.ts'
import { ORIGIN, Point, Side, ZOOM_MIN } from './gesture.ts'
import { Half } from './half.ts'

/**
 * 아카이브를 여는 일이 어디까지 왔는지.
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
     * 페이지별 파일 이름. 아카이브 안에서의 이름이고, 폴더는 떼어 낸 것이다.
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

/** 지금 스프레드에 대해 화면이 보여 주고 있는 것. */
export const SpreadState = defineTaggedUnion({
  Loading: {},
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
 * 위치의 기준은 스프레드 번호가 아니라 `page`다. 한 장/두 장을 바꿔도 살아남고,
 * 저장되는 것도 이 값이다. 스프레드는 매번 그릴 때 이 값과 페이지 수, 설정에서
 * 이끌어 낸다.
 *
 * 페이지 이미지 URL은 일부러 여기에 두지 않았다. 그것들은 열린 책 리소스가 쥔
 * `Page` 객체 안에 살면서 캐시되고 놓이므로, Model은 지금 화면에 걸린 몇 장만
 * 지고 있으면 된다.
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

  /** 툴바는 읽는 동안 스스로 숨고, 무슨 일이든 있으면 돌아온다. */
  isChromeVisible: Schema.Boolean,
  /** 포인터가 툴바 위에 머무는 동안에는 시간이 흐르지 않는다. */
  isPointerOverChrome: Schema.Boolean,
  /** 이 값을 바꾸면 툴바를 숨기는 대기가 처음부터 다시 간다. */
  activityToken: Schema.Number,
  /** 마지막 탭이 떨어진 시각. 다음 탭이 더블인지 알아보는 데 쓴다. */
  lastTapAt: Schema.Number,
  maybeTapFlash: Schema.Option(TapFlash),

  slider: Slider.Model,

  isFullscreen: Schema.Boolean,
  /** 읽는 규칙을 한 번 정해 두는 패널. 툴바와 달리 읽는 동안 쓰는 것이 아니다. */
  isSettingsOpen: Schema.Boolean,
  isThumbsOpen: Schema.Boolean,
  /** 격자가 북마크한 페이지만 늘어놓고 있는지. 그것이 곧 북마크 목록이다. */
  showsBookmarksOnly: Schema.Boolean,
  thumbs: VirtualList.Model,
  /** 지금까지 뽑아 둔 썸네일. 격자는 보여 줄 수 있는 것만 요청한다. */
  thumbPanels: Schema.Array(Panel),
})

/** {@linkcode Model} 스키마의 디코딩된 값. */
export type Model = typeof Model.Type

/**
 * {@linkcode init}이 책을 열기 위해 필요한 것. 어느 책인지, 그리고 어디까지
 * 읽었는지.
 */
export type InitConfig = Readonly<{
  /** 어느 책을 열지. 진행 상태를 저장하는 키이기도 하다. */
  bookId: string
  /** 이 책을 어디까지 읽었는지. */
  page: number
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
 * 저장된 페이지에 이미 가 있는 리더를 만든다. 책은 그 뒤에서 아직 열리는 중이다.
 *
 * 슬라이더에는 아직 범위가 없다 — 페이지 수는 책과 함께 도착한다 — 그래서 그때가
 * 오기 전까지는 아무것도 끌 수 없다.
 */
export const init = (config: InitConfig): Model => ({
  bookId: config.bookId,
  openState: OpenState.Opening(),
  spread: SpreadState.Loading(),
  page: config.page,
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
  isChromeVisible: true,
  isPointerOverChrome: false,
  activityToken: 0,
  lastTapAt: 0,
  maybeTapFlash: Option.none(),
  // 책이 페이지 수를 말해 주기 전까지 범위는 비어 있다.
  slider: Slider.init({ id: SLIDER_ID, min: 0, max: 0, step: 1 }),
  isFullscreen: false,
  isSettingsOpen: false,
  isThumbsOpen: false,
  showsBookmarksOnly: false,
  thumbs: VirtualList.init({
    id: THUMBS_ID,
    rowHeightPx: THUMB_ROW_HEIGHT,
  }),
  thumbPanels: [],
})
