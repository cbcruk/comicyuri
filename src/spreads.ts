import type { ViewMode } from './types.ts'

/**
 * 페이지 번호를 화면에 한 번에 보이는 단위로 묶는다.
 * `single`은 단위마다 한 장, `spread`는 두 장이며, 표지를 혼자 두면 이후 쌍이
 * 인쇄된 책처럼 맞는다.
 *
 * 넓은 페이지는 짝을 짓지 않는다. 책 한가운데의 양면 삽화나 눕혀 스캔한 쪽이
 * 그것인데, 이 규칙이 없으면 그런 페이지 하나가 그 뒤의 모든 쌍을 한 장씩
 * 어긋나게 만든다. 넓은 페이지의 앞 장도 홀로 남는다 — 옆에 세울 짝이 없다.
 *
 * @param isWide 그 번호의 페이지가 혼자 나와야 하는지. 기본값은 아무도 넓지
 * 않다고 답하므로, 크기를 모르는 책은 예전 그대로 둘씩 묶인다.
 */
export function buildSpreads(
  count: number,
  view: ViewMode,
  coverAlone: boolean,
  isWide: (page: number) => boolean = () => false,
): number[][] {
  if (view === 'single') {
    return Array.from({ length: count }, (_, i) => [i])
  }
  const spreads: number[][] = []
  let i = 0
  if (coverAlone && count > 0) {
    spreads.push([0])
    i = 1
  }
  while (i < count) {
    if (i + 1 < count && !isWide(i) && !isWide(i + 1)) {
      spreads.push([i, i + 1])
      i += 2
    } else {
      spreads.push([i])
      i += 1
    }
  }
  return spreads
}

/** 주어진 페이지가 들어 있는 스프레드의 번호. */
export function spreadOfPage(spreads: number[][], page: number): number {
  const idx = spreads.findIndex((s) => s.includes(page))
  return idx < 0 ? 0 : idx
}
