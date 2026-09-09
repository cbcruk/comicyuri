import type { ViewMode } from './types.ts'

/**
 * 페이지 번호를 화면에 한 번에 보이는 단위로 묶는다.
 * `single`은 단위마다 한 장, `spread`는 두 장이며, 표지를 혼자 두면 이후 쌍이
 * 인쇄된 책처럼 맞는다.
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

/** 주어진 페이지가 들어 있는 스프레드의 번호. */
export function spreadOfPage(spreads: number[][], page: number): number {
  const idx = spreads.findIndex((s) => s.includes(page))
  return idx < 0 ? 0 : idx
}
