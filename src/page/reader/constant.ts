/** The element a pointer has to be over for a gesture to count as reading. */
export const STAGE_ID = 'reader-stage'

/** The page slider, addressed by the parent when it lifts the drag subscriptions. */
export const SLIDER_ID = 'reader-page-slider'

export const THUMBS_ID = 'reader-thumbs'

/**
 * A virtual list measures rows, not cells, so the thumbnail grid is rows of a
 * fixed number of pages. Both numbers are fixed rather than measured, which is
 * the price of windowing a grid through a list.
 */
export const THUMBS_PER_ROW = 4
export const THUMB_ROW_HEIGHT = 180

/** Rows loaded beyond the ones on screen, so scrolling finds them ready. */
export const THUMB_OVERSCAN = 2
