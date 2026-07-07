import type { ViewMode } from './types.ts'

/**
 * Group page indices into the units shown on screen at once.
 * `single` → one page per unit; `spread` → two pages, optionally with the
 * cover shown on its own so subsequent pairs line up like a printed book.
 */
export function buildSpreads(count: number, view: ViewMode, coverAlone: boolean): number[][] {
  if (view === 'single') {
    return Array.from({ length: count }, (_, i) => [i])
  }
  const spreads: number[][] = []
  let i = 0
  if (coverAlone && count > 0) {
    spreads.push([0])
    i = 1
  }
  for (; i < count; i += 2) {
    spreads.push(i + 1 < count ? [i, i + 1] : [i])
  }
  return spreads
}

/** Index of the spread that contains a given page. */
export function spreadOfPage(spreads: number[][], page: number): number {
  const idx = spreads.findIndex((s) => s.includes(page))
  return idx < 0 ? 0 : idx
}
