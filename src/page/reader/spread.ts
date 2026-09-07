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

export const indexOfPage = (spreads: ReadonlyArray<ReadonlyArray<number>>, page: number): number =>
  spreadOfPage(
    spreads.map((spread) => [...spread]),
    page,
  )

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

export const neighbourPages = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
): ReadonlyArray<number> => pagesWithin(spreads, index, PRELOAD)

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
