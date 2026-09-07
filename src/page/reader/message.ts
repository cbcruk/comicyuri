import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Settings } from '../../types.ts'
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
