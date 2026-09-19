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
 *
 * 슬라이더와 격자의 자식 메시지도 없다. 그 둘은 React 컴포넌트가 스스로 쥐고, 리더에
 * 말을 거는 것은 "몇 페이지에 섰다" 하나뿐이다(`SelectedSliderPage`·`SelectedThumb`).
 */

import { Data, Option } from 'effect'

import type { Point } from '../reader/gesture.ts'
import type { Room, ScrollDevice } from '../reader/scroll.ts'
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
  }
  FailedOpenBook: { readonly text: string }

  ClickedPrevious: {}
  ClickedNext: {}
  ClickedFirst: {}
  ClickedLast: {}
  ClickedExit: {}
  ClickedToggleDirection: {}
  /** 메뉴에서 읽는 방향을 골랐다. 뒤집기와 달리 지금 값과 같아도 그대로 둔다. */
  ChoseDirection: { readonly direction: Settings['direction'] }
  ClickedToggleView: {}
  ClickedToggleBinding: {}
  /** 메뉴에서 맞춤 모드를 골랐다. 이미 걸린 모드를 골라도 그대로 둔다. */
  ChoseFit: { readonly fit: Settings['fit'] }
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
   * **`room`은 보내는 쪽의 약속이다.** 넘긴 스프레드가 아직 서지 않았으면 재어 온
   * 값이 아니라 `NO_ROOM`을 실어야 한다(`R-207`). 그동안 화면에 걸려 있는 것은
   * 이전 페이지라, 거기서 잰 거리는 다음 페이지에 대한 사실이 아니다 — 확대해 둔
   * 이전 페이지의 거리로 굴리면 확대가 풀린 다음 페이지가 엉뚱한 자리에 앉는다.
   *
   * update는 이 약속을 검사할 수 없다. 스프레드가 도착했는지를 아는 것은
   * `src/atoms/pages.ts`의 atom뿐이고, 그것을 `room`으로 옮겨 오는 것이
   * `subscription.ts`의 `roomOnStage`와 `messageForWheel`을 부르는 쪽의 일이다.
   */
  ScrolledStage: { readonly delta: Point; readonly room: Room; readonly device: ScrollDevice }

  ClickedToggleSlideshow: {}
  ElapsedSlide: {}
  ClickedNudgeSlideSeconds: { readonly by: number }

  ClickedZoomIn: {}
  ClickedZoomOut: {}
  /** 툴바와 푸터를 숨기거나 되부른다. `Hide` 버튼과 `h` 키가 보낸다. */
  ClickedToggleChrome: {}

  /**
   * 슬라이더가 페이지 하나에 섰다. 트랙 위의 값이 아니라 페이지 번호로 온다 —
   * 오른쪽에서 왼쪽으로 읽을 때의 뒤집기는 슬라이더가 스스로 한다(`R-264`).
   */
  SelectedSliderPage: { readonly page: number }

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
  SelectedThumb: { readonly page: number }
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
