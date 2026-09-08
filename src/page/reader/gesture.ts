import { Schema } from 'effect'

export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
export type Point = typeof Point.Type

export const ORIGIN: Point = { x: 0, y: 0 }

export const ZOOM_MIN = 1
export const ZOOM_MAX = 6

/** Movement still counted as a tap rather than a drag. */
export const TAP_SLOP = 10

/** Sideways travel before a drag becomes a page turn. */
export const SWIPE_MIN = 45

/**
 * Two pointers closer together than this are not a pinch. A pinch scales by
 * how much the span between them grew, so a span that starts near zero makes
 * that ratio unbounded — and a stale pointer left behind by a lost release
 * lands exactly there.
 */
export const MIN_PINCH_SPAN = 24

/** Two taps closer together than this are a double tap. */
export const DOUBLE_TAP_MILLIS = 300

/** What a double tap zooms to, and what a second one leaves. */
export const DOUBLE_TAP_ZOOM = 2.5

export const clampZoom = (zoom: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export const translate = (pan: Point, from: Point, to: Point): Point => ({
  x: pan.x + (to.x - from.x),
  y: pan.y + (to.y - from.y),
})

/**
 * Zooms so that whatever sits under `anchor` stays under it. Without this the
 * page slides away from the fingers as it grows.
 */
export const zoomAround = (pan: Point, zoom: number, nextZoom: number, anchor: Point): Point => {
  const scale = nextZoom / zoom
  return {
    x: anchor.x - (anchor.x - pan.x) * scale,
    y: anchor.y - (anchor.y - pan.y) * scale,
  }
}

/** A zoom of 1 has nothing to pan, so the offset goes back to the origin. */
export const panForZoom = (pan: Point, zoom: number): Point => (zoom === ZOOM_MIN ? ORIGIN : pan)

/**
 * Pointer positions arrive measured from the centre of the viewport, the same
 * origin `pan` uses, so an anchor and an offset can be added without knowing
 * where on the page anything sits.
 */
export const Side = Schema.Literals(['Left', 'Middle', 'Right'])
export type Side = typeof Side.Type

/** Tap zones: the outer thirds turn pages, the middle shows the chrome. */
export const zoneAt = (x: number, width: number): Side => {
  if (x < -width / 6) return 'Left'
  if (x > width / 6) return 'Right'
  return 'Middle'
}

/**
 * Dragging leftwards pulls in what lies to the right, so the page being asked
 * for is the one on that side.
 */
export const swipeFrom = (origin: Point, release: Point): Side => {
  const travel = release.x - origin.x
  if (Math.abs(travel) < SWIPE_MIN) return 'Middle'
  return travel > 0 ? 'Left' : 'Right'
}
