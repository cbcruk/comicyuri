/**
 * 리더가 주고받는 것. Foldkit의 `defineMessageUnion`을 Effect의 `Data` 태그
 * 유니온으로 옮긴 자리다.
 *
 * 태그 이름과 필드 이름은 옮기기 전과 같다. 그래야 story 테스트가 같은 문장으로
 * 남고, 화면이 보내는 것도 그대로다.
 *
 * 페이지를 부르는 메시지(`CompletedLoadSpread`·`FailedLoadSpread`·
 * `CompletedPreloadNeighbours`)는 여기 없다. 스프레드가 도착했는지는 이제
 * `src/atoms/pages.ts`의 atom이 안다.
 */

import { Data, Option } from 'effect'

import { Slider, VirtualList } from '@foldkit/ui'

import type { Point } from '../page/reader/gesture.ts'
import type { Room, ScrollDevice } from '../page/reader/scroll.ts'
import type { Panel } from './model.ts'
import type { AtBookEnd, PageMark, Resume, Rotation, Settings } from '../types.ts'

/**
 * 리더 안에서 일어날 수 있는 모든 일.
 *
 * 포인터 메시지는 자기가 나온 `pointerId`를 지고 다닌다. 제스처는 그것을 시작한
 * 포인터의 것일 뿐이기 때문이다. 드래그 중에 도착한 두 번째 손가락을 첫 손가락이
 * 튄 것으로 착각해서는 안 된다.
 */
export type Message = Data.TaggedEnum<{
  CompletedOpenBook: {
    readonly title: string
    readonly pageCount: number
    readonly ratios: ReadonlyArray<Option.Option<number>>
    readonly names: ReadonlyArray<string>
  }
  FailedOpenBook: { readonly text: string }

  ClickedPrevious: {}
  ClickedNext: {}
  ClickedFirst: {}
  ClickedLast: {}
  ClickedExit: {}
  ClickedToggleDirection: {}
  ClickedToggleView: {}
  ClickedToggleBinding: {}
  ClickedCycleFit: {}
  ClickedSkip: { readonly pages: number }
  /** 번호를 적고 Enter를 눌렀거나 입력란을 떠났다. 적힌 것이 무엇이든 지고 온다. */
  SubmittedGoToPage: { readonly text: string }
  /** 키가 눌렸다. Shift는 리더가 쓰는 유일한 수정키라 함께 지고 온다. */
  PressedKey: { readonly key: string; readonly withShift: boolean }

  PressedPointer: { readonly pointerId: number; readonly at: Point }
  MovedPointer: { readonly pointerId: number; readonly at: Point }
  ReleasedPointer: {
    readonly pointerId: number
    readonly at: Point
    readonly timeStamp: number
    readonly viewportWidth: number
  }
  CancelledPointer: { readonly pointerId: number }
  AbandonedPointer: {}
  ScrolledToZoom: { readonly delta: number; readonly at: Point }
  /**
   * 휠이나 트랙패드로 굴렸다. 그때 페이지가 어느 쪽으로 얼마나 더 갈 수 있었는지와
   * 어느 장치에서 온 굴림인지를 함께 지고 온다 — 둘 다 브라우저에서만 알 수 있다.
   *
   * 넘긴 페이지가 아직 서지 않았으면 화면이 `NO_ROOM`을 실어 보낸다(`R-207`).
   * 그 판단은 스프레드가 도착했는지를 아는 atom 쪽에 있다.
   */
  ScrolledStage: { readonly delta: Point; readonly room: Room; readonly device: ScrollDevice }

  ClickedToggleSlideshow: {}
  ElapsedSlide: {}
  ClickedNudgeSlideSeconds: { readonly by: number }

  ClickedZoomIn: {}
  ClickedZoomOut: {}
  /** 툴바와 푸터를 숨기거나 되부른다. `Hide` 버튼과 `h` 키가 보낸다. */
  ClickedToggleChrome: {}

  GotSliderMessage: { readonly message: Slider.Message }

  ClickedRotate: {}

  ClickedResume: { readonly page: number }
  ClickedDismissResume: {}

  ClickedToggleBookmark: {}
  ClickedStepBookmark: { readonly step: number }
  ClickedToggleBookmarksOnly: {}
  ClickedRemoveBookmark: { readonly page: number }

  ClickedToggleFullscreen: {}
  CompletedToggleFullscreen: {}
  ChangedFullscreen: { readonly isFullscreen: boolean }

  ClickedToggleSettings: {}
  ToggledCoverAlone: { readonly isChecked: boolean }
  ToggledEnlargeToFit: { readonly isChecked: boolean }
  ToggledSplitWide: { readonly isChecked: boolean }
  ToggledRememberBookSettings: { readonly isChecked: boolean }
  SelectedAtBookEnd: { readonly atBookEnd: AtBookEnd }
  SelectedResume: { readonly resume: Resume }
  ClickedNudgeThreshold: { readonly by: number }

  ClickedToggleThumbs: {}
  /** 격자가 놓인 곳의 너비를 쟀다. 열 때 한 번, 그 뒤로는 창이 바뀔 때마다. */
  MeasuredThumbsWidth: { readonly width: number }
  GotThumbsMessage: { readonly message: VirtualList.Message }
  SelectedThumb: { readonly page: number }
  /** 격자가 보여 줄 썸네일이 도착했다. 뽑는 일은 atom이 한다. */
  CompletedLoadThumbs: { readonly panels: ReadonlyArray<Panel> }
}>

/** {@linkcode Message} 유니온의 생성자와 `$match`. */
export const Message = Data.taggedEnum<Message>()

/** 리더가 애플리케이션에 올려 보내는 것. */
export type OutMessage = Data.TaggedEnum<{
  RequestedExit: {}
  /** 책장 순서에서 이웃한 책을 열어 달라는 것. 앞으로 한 칸이면 `1`. */
  RequestedNeighbourBook: { readonly bookId: string; readonly step: number }
  ChangedSettings: { readonly bookId: string; readonly settings: Settings }
  UpdatedProgress: {
    readonly bookId: string
    readonly page: number
    readonly bookmarks: ReadonlyArray<number>
    readonly marks: ReadonlyArray<PageMark>
    readonly rotation: Rotation
  }
}>

/** {@linkcode OutMessage} 유니온의 생성자와 `$match`. */
export const OutMessage = Data.taggedEnum<OutMessage>()
