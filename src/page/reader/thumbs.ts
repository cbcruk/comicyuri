import { Array, Option } from 'effect'

import { VirtualList } from '@foldkit/ui'

import { THUMBS_PER_ROW, THUMB_OVERSCAN } from './constant.ts'
import type { Panel } from './model.ts'

/** The pages of each row of the grid. `Array.range` counts inclusively, so an
 *  empty book has to be turned away before it asks for `range(0, -1)`. */
export const rowsFor = (pageCount: number): ReadonlyArray<ReadonlyArray<number>> =>
  pageCount <= 0 ? [] : Array.chunksOf(Array.range(0, pageCount - 1), THUMBS_PER_ROW)

/**
 * Which pages the grid could show right now, read back out of the list's own
 * scroll state. The component renders the window; this works out what to
 * extract for it.
 */
export const pagesInView = (list: VirtualList.Model, pageCount: number): ReadonlyArray<number> => {
  const containerHeight =
    list.measurement._tag === 'Measured' ? list.measurement.containerHeight : 0

  const firstRow = Math.floor(list.scrollTop / list.rowHeightPx)
  const rowsOnScreen = Math.ceil(containerHeight / list.rowHeightPx) + 1

  const from = Math.max(0, firstRow - THUMB_OVERSCAN)
  const to = firstRow + rowsOnScreen + THUMB_OVERSCAN

  return Array.filter(
    Array.range(from * THUMBS_PER_ROW, to * THUMBS_PER_ROW - 1),
    (page) => page >= 0 && page < pageCount,
  )
}

/**
 * The wanted pages that have not been extracted yet, so a scroll only asks for
 * what the last one did not already fetch.
 */
export const missingFrom = (
  loaded: ReadonlyArray<Panel>,
  wanted: ReadonlyArray<number>,
): ReadonlyArray<number> =>
  Array.filter(wanted, (page) => !Array.some(loaded, (panel) => panel.page === page))

/** The thumbnail for a page, absent until it has been extracted. */
export const urlFor = (loaded: ReadonlyArray<Panel>, page: number): Option.Option<string> =>
  Option.map(
    Array.findFirst(loaded, (panel) => panel.page === page),
    (panel) => panel.url,
  )

/** Every page already extracted, which is what the release side works from. */
export const loadedPages = (loaded: ReadonlyArray<Panel>): ReadonlyArray<number> =>
  Array.map(loaded, (panel) => panel.page)
