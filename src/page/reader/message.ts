import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Slider, VirtualList } from '@foldkit/ui'

import { Settings } from '../../types.ts'
import { Point } from './gesture.ts'
import { Panel } from './model.ts'

export const Message = defineMessageUnion({
  CompletedOpenBook: { title: Schema.String, pageCount: Schema.Number },
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
  ClickedCycleFit: {},
  PressedKey: { key: Schema.String },

  PressedPointer: { pointerId: Schema.Number, at: Point },
  MovedPointer: { pointerId: Schema.Number, at: Point },
  ReleasedPointer: {
    pointerId: Schema.Number,
    at: Point,
    timeStamp: Schema.Number,
    viewportWidth: Schema.Number,
  },
  CancelledPointer: { pointerId: Schema.Number },
  ScrolledToZoom: { delta: Schema.Number, at: Point },
  ScrolledToPan: { delta: Point },

  ClickedZoomIn: {},
  ClickedZoomOut: {},
  ElapsedChromeIdle: { token: Schema.Number },

  GotSliderMessage: { message: Slider.Message },

  ClickedToggleBookmark: {},

  ClickedToggleFullscreen: {},
  CompletedToggleFullscreen: {},
  ChangedFullscreen: { isFullscreen: Schema.Boolean },

  ClickedToggleThumbs: {},
  GotThumbsMessage: { message: VirtualList.Message },
  SelectedThumb: { page: Schema.Number },
  CompletedLoadThumbs: { panels: Schema.Array(Panel) },
})

export type Message = typeof Message.Type

/** What the reader reports up to the application. */
export const OutMessage = defineMessageUnion({
  RequestedExit: {},
  ChangedSettings: { settings: Settings },
  UpdatedProgress: {
    bookId: Schema.String,
    page: Schema.Number,
    bookmarks: Schema.Array(Schema.Number),
  },
})

export type OutMessage = typeof OutMessage.Type
