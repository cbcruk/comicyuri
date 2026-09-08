import { Array, Option } from 'effect'

import { buildSpreads, spreadOfPage } from '../../spreads.ts'
import type { Settings } from '../../types.ts'

/** Spreads to warm on each side of the reader, and to keep loaded. */
const PRELOAD = 1
const KEEP = 3

/**
 * The spreads are derived, never stored: the page count and the settings are
 * all they depend on, and deriving them means a one-page/two-page toggle
 * cannot leave a stale grouping in the Model.
 */
export const spreadsFor = (
  pageCount: number,
  settings: Settings,
): ReadonlyArray<ReadonlyArray<number>> =>
  buildSpreads(pageCount, settings.view, settings.coverAlone)

/**
 * Which spread a page is part of. Pages outside the book answer with the first
 * spread rather than nothing.
 */
export const indexOfPage = (spreads: ReadonlyArray<ReadonlyArray<number>>, page: number): number =>
  spreadOfPage(
    spreads.map((spread) => [...spread]),
    page,
  )

/** The pages of one spread, empty past either end of the book. */
export const pagesAt = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
): ReadonlyArray<number> => Option.getOrElse(Array.get(spreads, index), () => Array.empty<number>())

const pagesWithin = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
  reach: number,
): ReadonlyArray<number> =>
  Array.flatMap(Array.range(index - reach, index + reach), (at) => pagesAt(spreads, at))

/** The pages worth having ready: this spread and the one on each side. */
export const neighbourPages = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
): ReadonlyArray<number> => pagesWithin(spreads, index, PRELOAD)

/**
 * The pages worth holding on to. Anything further out than this has its object
 * URL released, which is what stops a long book from filling memory.
 */
export const pagesToKeep = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
): ReadonlyArray<number> => pagesWithin(spreads, index, KEEP)

/** The page a step lands on, clamped to the book. */
export const pageAfterStep = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  page: number,
  step: number,
): number => {
  const next = indexOfPage(spreads, page) + step
  return Option.match(Array.get(spreads, next), {
    onNone: () => page,
    onSome: (pages) => Option.getOrElse(Array.head(pages), () => page),
  })
}

/**
 * The page slider's value for a page, and a page for its value: reading right
 * to left runs the slider the other way, so the value is the page counted from
 * the end. Mirroring the value rather than the pixels keeps the component's own
 * pointer maths and arrow keys pointing where the reader expects.
 *
 * Its own inverse, so one function serves both directions of the mapping.
 */
export const mirrorForDirection = (
  page: number,
  pageCount: number,
  direction: Settings['direction'],
): number => (direction === 'rtl' ? Math.max(0, pageCount - 1) - page : page)
