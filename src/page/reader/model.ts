import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Slider, VirtualList } from '@foldkit/ui'

import { Settings } from '../../types.ts'
import { SLIDER_ID, THUMBS_ID, THUMB_ROW_HEIGHT } from './constant.ts'
import { ORIGIN, Point, Side, ZOOM_MIN } from './gesture.ts'

/** How far along opening the archive is. */
export const OpenState = defineTaggedUnion({
  Opening: {},
  Ready: { title: Schema.String, pageCount: Schema.Number },
  Failed: { text: Schema.String },
})

export type OpenState = typeof OpenState.Type

/** One image on screen. */
export const Panel = Schema.Struct({
  page: Schema.Number,
  url: Schema.String,
})

export type Panel = typeof Panel.Type

/** What the stage is showing for the current spread. */
export const SpreadState = defineTaggedUnion({
  Loading: {},
  Shown: { panels: Schema.Array(Panel) },
  Failed: { text: Schema.String },
})

export type SpreadState = typeof SpreadState.Type

/**
 * The most recent tap that turned a page, so the stage can show which side it
 * came from. `token` changes with every turn, which is what restarts the
 * animation when the same side is tapped twice.
 */
export const TapFlash = Schema.Struct({
  side: Side,
  token: Schema.Number,
})

export type TapFlash = typeof TapFlash.Type

/**
 * What the pointers are currently doing.
 *
 * `Tracking` is deliberately undecided: the same press becomes a tap, a swipe
 * or a pan depending on how far it travels and whether the page is zoomed in,
 * and none of that is known until it moves or lifts.
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

export type Gesture = typeof Gesture.Type

/**
 * `page` rather than a spread index is the position of record: it survives a
 * one-page/two-page toggle, and it is what gets persisted. The spread is
 * derived from it, the page count and the settings on every render.
 *
 * Page image URLs are deliberately absent. They live in the `Page` objects the
 * open-book resource holds, which memoize and release them, so the Model only
 * carries the handful currently on screen.
 */
export const Model = Schema.Struct({
  bookId: Schema.String,
  openState: OpenState,
  spread: SpreadState,
  page: Schema.Number,
  bookmarks: Schema.Array(Schema.Number),
  settings: Settings,

  zoom: Schema.Number,
  pan: Point,
  gesture: Gesture,

  /** Chrome hides itself while reading and comes back on any activity. */
  isChromeVisible: Schema.Boolean,
  /** Changing this restarts the wait that hides the chrome. */
  activityToken: Schema.Number,
  /** When the last tap lifted, so the next one can tell it is a double. */
  lastTapAt: Schema.Number,
  maybeTapFlash: Schema.Option(TapFlash),

  slider: Slider.Model,

  isFullscreen: Schema.Boolean,
  isThumbsOpen: Schema.Boolean,
  thumbs: VirtualList.Model,
  /** Thumbnails resolved so far; the grid only asks for what it can show. */
  thumbPanels: Schema.Array(Panel),
})

export type Model = typeof Model.Type

export type InitConfig = Readonly<{
  bookId: string
  page: number
  bookmarks: ReadonlyArray<number>
  settings: Settings
}>

export const init = (config: InitConfig): Model => ({
  bookId: config.bookId,
  openState: OpenState.Opening(),
  spread: SpreadState.Loading(),
  page: config.page,
  bookmarks: config.bookmarks,
  settings: config.settings,
  zoom: ZOOM_MIN,
  pan: ORIGIN,
  gesture: Gesture.Idle(),
  isChromeVisible: true,
  activityToken: 0,
  lastTapAt: 0,
  maybeTapFlash: Option.none(),
  // The range is empty until the book says how many pages it has.
  slider: Slider.init({ id: SLIDER_ID, min: 0, max: 0, step: 1 }),
  isFullscreen: false,
  isThumbsOpen: false,
  thumbs: VirtualList.init({
    id: THUMBS_ID,
    rowHeightPx: THUMB_ROW_HEIGHT,
  }),
  thumbPanels: [],
})
