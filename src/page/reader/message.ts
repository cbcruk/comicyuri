import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Slider, VirtualList } from '@foldkit/ui'

import { AtBookEnd, PageMark, Rotation, Settings } from '../../types.ts'
import { Point } from './gesture.ts'
import { Panel } from './model.ts'
import { Room, ScrollDevice } from './scroll.ts'

/**
 * 리더 안에서 일어날 수 있는 모든 일.
 *
 * 포인터 메시지는 자기가 나온 `pointerId`를 지고 다닌다. 제스처는 그것을 시작한
 * 포인터의 것일 뿐이기 때문이다. 드래그 중에 도착한 두 번째 손가락을 첫 손가락이
 * 튄 것으로 착각해서는 안 된다.
 */
export const Message = defineMessageUnion({
  CompletedOpenBook: {
    title: Schema.String,
    pageCount: Schema.Number,
    ratios: Schema.Array(Schema.Option(Schema.Number)),
    names: Schema.Array(Schema.String),
  },
  FailedOpenBook: { text: Schema.String },
  CompletedReleaseBook: {},

  CompletedLoadSpread: { page: Schema.Number, panels: Schema.Array(Panel) },
  FailedLoadSpread: { page: Schema.Number, text: Schema.String },
  CompletedPreloadNeighbours: {},

  ClickedPrevious: {},
  ClickedNext: {},
  ClickedFirst: {},
  ClickedLast: {},
  ClickedExit: {},
  ClickedToggleDirection: {},
  ClickedToggleView: {},
  ClickedToggleBinding: {},
  ClickedCycleFit: {},
  ClickedSkip: { pages: Schema.Number },
  /** 번호를 적고 Enter를 눌렀거나 입력란을 떠났다. 적힌 것이 무엇이든 지고 온다. */
  SubmittedGoToPage: { text: Schema.String },
  /** 키가 눌렸다. Shift는 리더가 쓰는 유일한 수정키라 함께 지고 온다. */
  PressedKey: { key: Schema.String, withShift: Schema.Boolean },

  PressedPointer: { pointerId: Schema.Number, at: Point },
  MovedPointer: { pointerId: Schema.Number, at: Point },
  ReleasedPointer: {
    pointerId: Schema.Number,
    at: Point,
    timeStamp: Schema.Number,
    viewportWidth: Schema.Number,
  },
  CancelledPointer: { pointerId: Schema.Number },
  AbandonedPointer: {},
  ScrolledToZoom: { delta: Schema.Number, at: Point },
  /**
   * 휠이나 트랙패드로 굴렸다. 그때 페이지가 어느 쪽으로 얼마나 더 갈 수 있었는지와
   * 어느 장치에서 온 굴림인지를 함께 지고 온다 — 둘 다 브라우저에서만 알 수 있다.
   */
  ScrolledStage: { delta: Point, room: Room, device: ScrollDevice },

  ClickedToggleSlideshow: {},
  ElapsedSlide: {},
  ClickedNudgeSlideSeconds: { by: Schema.Number },

  ClickedZoomIn: {},
  ClickedZoomOut: {},
  ElapsedChromeIdle: { token: Schema.Number },
  EnteredChrome: {},
  LeftChrome: {},

  GotSliderMessage: { message: Slider.Message },

  ClickedRotate: {},

  ClickedToggleBookmark: {},
  ClickedStepBookmark: { step: Schema.Number },
  ClickedToggleBookmarksOnly: {},

  ClickedToggleFullscreen: {},
  CompletedToggleFullscreen: {},
  ChangedFullscreen: { isFullscreen: Schema.Boolean },

  ClickedToggleSettings: {},
  ToggledCoverAlone: { isChecked: Schema.Boolean },
  ToggledEnlargeToFit: { isChecked: Schema.Boolean },
  ToggledSplitWide: { isChecked: Schema.Boolean },
  ToggledRememberBookSettings: { isChecked: Schema.Boolean },
  SelectedAtBookEnd: { atBookEnd: AtBookEnd },
  ClickedNudgeThreshold: { by: Schema.Number },

  ClickedToggleThumbs: {},
  GotThumbsMessage: { message: VirtualList.Message },
  SelectedThumb: { page: Schema.Number },
  CompletedLoadThumbs: { panels: Schema.Array(Panel) },
})

/** {@linkcode Message} 유니온의 디코딩된 값. */
export type Message = typeof Message.Type

/** 리더가 애플리케이션에 올려 보내는 것. */
export const OutMessage = defineMessageUnion({
  RequestedExit: {},
  /** 책장 순서에서 이웃한 책을 열어 달라는 것. 앞으로 한 칸이면 `1`. */
  RequestedNeighbourBook: { bookId: Schema.String, step: Schema.Number },
  ChangedSettings: { bookId: Schema.String, settings: Settings },
  UpdatedProgress: {
    bookId: Schema.String,
    page: Schema.Number,
    bookmarks: Schema.Array(Schema.Number),
    marks: Schema.Array(PageMark),
    rotation: Rotation,
  },
})

/** {@linkcode OutMessage} 유니온의 디코딩된 값. */
export type OutMessage = typeof OutMessage.Type
