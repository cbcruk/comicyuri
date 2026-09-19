/**
 * 리더 크롬이 주고받는 것. 지금 상태 하나와 콜백 묶음 하나다.
 *
 * 크롬은 리더 상태를 스스로 읽지 않는다. 어느 메뉴가 열려 있는지만 컴포넌트가
 * 쥐고(`MIGRATION.md`의 "화면 순간의 상태"), 나머지는 모두 여기로 들어온다.
 */

import type { FitMode, ReadingDirection, ViewMode } from '../../types.ts'

/** 크롬이 그리는 데 필요한 지금 상태. */
export type ChromeState = Readonly<{
  /** 카운터에 적히는 글자. 한 장이면 `3 / 120`, 두 장이면 `4–5 / 120`(`R-213`). */
  counter: string
  /** 슬라이더와 자리표시자가 가리키는 페이지. `0`부터 센다. */
  page: number
  /** 책의 페이지 수. */
  pageCount: number
  direction: ReadingDirection
  view: ViewMode
  fit: FitMode
  /** 지금 페이지가 책갈피에 들어 있는지. 책갈피 항목의 이름이 이것으로 갈린다. */
  isBookmarked: boolean
  isThumbsOpen: boolean
  isSettingsOpen: boolean
  isFullscreen: boolean
  isPlaying: boolean
  /**
   * 크롬이 화면에 서 있는지(`R-252`). 거짓이면 헤더도 푸터도 그리지 않는다 —
   * 자리를 차지한 채 투명해지면 숨기는 일이 읽을 자리를 넓히지 못한다.
   */
  isChromeVisible: boolean
}>

/** 크롬의 버튼과 메뉴 항목이 부르는 것들. */
export type ChromeActions = Readonly<{
  onExit: () => void
  onToggleBookmark: () => void
  onToggleThumbs: () => void
  onToggleSettings: () => void
  onToggleFullscreen: () => void
  onToggleChrome: () => void
  onChooseDirection: (direction: ReadingDirection) => void
  onToggleView: () => void
  onCycleFit: () => void
  onToggleBinding: () => void
  onToggleSlideshow: () => void
  onRotate: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFirst: () => void
  onPrevious: () => void
  onNext: () => void
  onLast: () => void
  /** 책갈피 하나만큼 앞뒤로. `1`이 다음, `-1`이 이전이다. */
  onStepBookmark: (step: number) => void
  /** 슬라이더가 멈춘 자리. `0`부터 세는 페이지 번호다. */
  onSlide: (page: number) => void
  /**
   * 입력란에 적힌 것. 숫자가 아니거나 책 밖의 번호일 수 있으므로 적힌 글자
   * 그대로 넘긴다 — 무엇이 유효한지는 리더가 정한다(`R-266`).
   */
  onGoToPage: (text: string) => void
}>

/** 크롬 컴포넌트가 받는 것. */
export type ChromeProps = Readonly<{
  state: ChromeState
  actions: ChromeActions
}>
