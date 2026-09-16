/**
 * 리더의 상태. Foldkit을 걷어 내고 순수한 값과 함수만 남긴 자리다.
 *
 * Schema로 세우던 것을 평범한 타입과 Effect의 `Data` 태그 유니온으로 옮겼다. 태그
 * 이름과 필드 이름은 그대로라, 저장된 값도 테스트도 같은 것을 가리킨다.
 *
 * 스프레드를 부르는 일은 이제 `src/atoms/pages.ts`가 맡는다. 그래서 Model에는 무엇을
 * 보여 줄지만 있고, 그것이 도착했는지는 없다.
 */

import { Data, Option } from 'effect'

import { Reading } from '../domain/index.ts'
import { ORIGIN, ZOOM_MIN } from '../page/reader/gesture.ts'
import type { Point, Side } from '../page/reader/gesture.ts'
import type { Half } from '../page/reader/half.ts'
import { indexOfPage, pagesAt, spreadsFor } from '../page/reader/spread.ts'
import type { BookSettings, PageMark, Rotation, Settings } from '../types.ts'

/**
 * 책을 여는 일이 어디까지 왔는지.
 *
 * `Ready`가 페이지 비를 지고 있는 이유는 스프레드 묶기가 그것을 보기 때문이다.
 * 넓은 페이지는 짝을 짓지 않으므로, 페이지 수만으로는 무엇이 한 화면인지 정할
 * 수 없다.
 */
export type OpenState = Data.TaggedEnum<{
  Opening: {}
  Ready: {
    readonly title: string
    readonly pageCount: number
    /** 페이지별 가로세로비. 임포트할 때 재지 못한 페이지는 없음이다. */
    readonly ratios: ReadonlyArray<Option.Option<number>>
    /**
     * 페이지별 파일 이름. 폴더는 떼어 낸 것이다.
     *
     * 정렬이 이상할 때 그것을 알아볼 유일한 단서다 — 화면에 걸린 것이 몇 번째
     * 페이지인지는 카운터가 말해 주지만, 그 번호가 왜 그 그림인지는 파일 이름만이
     * 말해 준다.
     */
    readonly names: ReadonlyArray<string>
  }
  Failed: { readonly text: string }
}>

/** {@linkcode OpenState} 유니온의 생성자와 `$match`. */
export const OpenState = Data.taggedEnum<OpenState>()

/**
 * 페이지에 들어선 쪽. 앞으로 넘기면 페이지의 처음이고, 뒤로 넘기면 끝이다.
 *
 * 화면에 통째로 들어가는 페이지에는 처음도 끝도 없다 — 그런 페이지는 어느 쪽에서
 * 들어서든 가운데에 놓인다.
 */
export type PageEntry = 'start' | 'end'

/**
 * 페이지를 넘긴 가장 최근의 탭. 화면이 어느 쪽에서 온 탭인지 보여 줄 수 있도록
 * 남긴다. `token`은 넘길 때마다 바뀌고, 그것이 같은 쪽을 두 번 탭했을 때
 * 애니메이션을 다시 시작시킨다.
 */
export type TapFlash = Readonly<{ side: Side; token: number }>

/**
 * 지금 포인터들이 하고 있는 일.
 *
 * `Tracking`은 일부러 정하지 않은 상태다. 같은 누름이 얼마나 움직였는지와
 * 페이지가 확대되어 있는지에 따라 탭이 되기도, 스와이프가 되기도, 이동이
 * 되기도 하는데, 그 어느 것도 움직이거나 떼기 전에는 알 수 없다.
 */
export type Gesture = Data.TaggedEnum<{
  Idle: {}
  Tracking: {
    readonly pointerId: number
    readonly origin: Point
    readonly last: Point
    readonly hasLeftSlop: boolean
  }
  Pinching: {
    readonly firstId: number
    readonly secondId: number
    readonly first: Point
    readonly second: Point
    readonly startSpan: number
    readonly startZoom: number
  }
}>

/** {@linkcode Gesture} 유니온의 생성자와 `$match`. */
export const Gesture = Data.taggedEnum<Gesture>()

/** 추적 중인 제스처. 놓음을 읽는 쪽이 이 모양만 따로 받는다. */
export type Tracking = Extract<Gesture, { readonly _tag: 'Tracking' }>

/**
 * 책 한 권을 열어 둔 리더의 상태.
 *
 * 위치의 기준은 스프레드 번호가 아니라 `page`다. 한 장/두 장을 바꿔도 살아남고,
 * 저장되는 것도 이 값이다. 스프레드는 매번 그릴 때 이 값과 페이지 수, 페이지 비,
 * 묶기 교정, 설정에서 이끌어 낸다({@linkcode spreadPages}).
 *
 * 페이지 이미지 URL은 여기에 없다. 그것을 부르고 놓아 주는 일은 `src/atoms/pages.ts`의
 * atom이 맡으므로, Model은 무엇을 보여 줄지만 말한다(`R-207`, `R-214`도 그쪽에 있다).
 *
 * 슬라이더와 썸네일 격자의 상태도 여기에 없다. 슬라이더는 `src/app/chrome/slider.tsx`가,
 * 격자는 `src/app/thumbs/thumbs.tsx`가 각자 쥔다 — 트랙 위의 값도, 잰 너비도, 어느
 * 칸이 서 있는지도 그리는 쪽에서만 뜻이 있다. Model에 두면 진실이 두 벌이 된다.
 */
export type Model = Readonly<{
  bookId: string
  openState: OpenState
  page: number
  bookmarks: ReadonlyArray<number>
  /** 자동 묶기가 틀렸을 때 사람이 고쳐 둔 것. 책마다 저장된다. */
  marks: ReadonlyArray<PageMark>
  /** 이 책을 세워 둔 각도. 묶기 교정과 같이 책마다 저장된다. */
  rotation: Rotation
  /** 지금 이 책에 걸려 있는 설정. 전역 기본값과 이 책의 것을 합친 결과다. */
  settings: Settings
  /**
   * 합치기 전의 전역 기본값.
   *
   * 책마다 기억하기를 껐을 때 무엇으로 돌아갈지 아는 데 필요하다. 그 순간
   * 리더가 쥔 것은 이 책의 설정이고, 앱에 물어볼 길은 없다.
   */
  globalSettings: Settings

  zoom: number
  pan: Point
  gesture: Gesture
  /**
   * 이 페이지에 어느 쪽에서 들어섰는지. 뒤로 넘겨 온 페이지는 화면보다 길면
   * 끝에서 시작한다 — 되돌아 읽는 움직임과 맞는다.
   */
  entry: PageEntry
  /** 나뉜 페이지에서 보고 있는 반쪽. 나뉘지 않는 페이지에서는 쓰이지 않는다. */
  half: Half

  /**
   * 저장된 자리로 갈지 묻고 있는 페이지. 묻지 않는 동안에는 없음이다.
   *
   * 물어보기로 한 사람에게만 생긴다(`Resume`). 답하기 전까지 사라지지 않으므로,
   * 첫 장부터 읽다가 나중에 눌러도 그 자리로 간다.
   */
  maybeResumePage: Option.Option<number>

  /** 슬라이드쇼가 돌고 있는지. 돌면 정해 둔 시간마다 스스로 넘어간다. */
  isPlaying: boolean
  /**
   * 툴바와 푸터가 화면에 있는지. 스스로 숨지 않고, 사람이 숨기거나 슬라이드쇼를
   * 시작할 때만 내려간다.
   *
   * 숨으면 흐려지는 것이 아니라 레이아웃에서 빠진다. 그래야 스테이지가 그 높이를
   * 가져가고, 숨기는 일이 읽을 자리를 넓힌다.
   */
  isChromeVisible: boolean
  /**
   * 짝을 기다리는 가운데 탭이 떨어진 시각(이벤트의 `timeStamp`, 밀리초). 다음 탭이
   * 더블인지 알아보는 데 쓰고, 기다리는 탭이 없으면 없음이다.
   *
   * `0`으로 없음을 대신하지 않는다. `timeStamp`는 문서가 열린 순간부터 세므로, 열리고
   * 300ms 안에 온 첫 탭이 있지도 않은 탭과 짝지어져 툴바 대신 확대가 된다.
   */
  maybeLastTapAt: Option.Option<number>
  maybeTapFlash: Option.Option<TapFlash>

  isFullscreen: boolean
  /** 읽는 규칙을 한 번 정해 두는 패널. 툴바와 달리 읽는 동안 쓰는 것이 아니다. */
  isSettingsOpen: boolean
  isThumbsOpen: boolean
  /** 격자가 북마크한 페이지만 늘어놓고 있는지. 그것이 곧 북마크 목록이다. */
  showsBookmarksOnly: boolean
}>

/**
 * 지금 페이지가 속한 스프레드의 페이지들. 한 장 모드면 한 장이고, 책이 아직
 * 열리는 중이면 비어 있다.
 *
 * Foldkit 리더에서는 이 값을 `LoadSpread`가 지고 갔다. 이제 그 이미지를 부르는 것은
 * atom이라, Model은 무엇이 한 화면인지만 말하고 화면이 그 값으로 atom을 부른다.
 */
export const spreadPages = (model: Model): ReadonlyArray<number> =>
  OpenState.$match(model.openState, {
    Opening: () => [],
    Failed: () => [],
    Ready: ({ pageCount, ratios }) => {
      const spreads = spreadsFor({ pageCount, ratios, marks: model.marks }, model.settings)
      return pagesAt(spreads, indexOfPage(spreads, model.page))
    },
  })

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
 * 페이지 수는 책과 함께 도착하므로 그때까지 `openState`는 `Opening`이고
 * {@linkcode spreadPages}는 비어 있다. 슬라이더와 격자는 그 값을 보고 스스로
 * 자기 범위를 정한다 — Model에는 그 둘의 상태가 없다.
 */
export const init = (config: InitConfig): Model => ({
  bookId: config.bookId,
  openState: OpenState.Opening(),
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
  isFullscreen: false,
  isSettingsOpen: false,
  isThumbsOpen: false,
  showsBookmarksOnly: false,
})
