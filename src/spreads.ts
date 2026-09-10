import type { ViewMode } from './types.ts'

/**
 * 페이지가 한 화면을 어떻게 차지하는지.
 *
 * `alone`은 혼자 서고, `pair`는 다음 장과 묶이며, `auto`는 옆 장 사정에 맡긴다.
 * 손으로 걸어 둔 표시가 앞의 둘이 되고, 표시가 없는 페이지가 `auto`다.
 */
export type Binding = 'alone' | 'pair' | 'auto'

/**
 * 이 페이지가 다음 장과 한 화면에 서는지.
 *
 * `pair`는 다른 무엇도 이긴다. 자동 판정이 틀렸을 때 그것을 덮으라고 있는
 * 표시이므로, 다음 장이 넓게 나왔다는 이유로 무시되면 탈출구가 아니다.
 *
 * 그 밖에는 두 장이 서로를 원해야 묶인다. 다음 장이 혼자 서겠다고 했거나 이미
 * 그 다음 장과 묶이기로 했다면, 이 장에게 남은 짝은 없다.
 */
function pairsWithNext(bindingOf: (page: number) => Binding, page: number, count: number): boolean {
  if (page + 1 >= count) return false

  const here = bindingOf(page)
  if (here === 'pair') return true
  if (here === 'alone') return false

  return bindingOf(page + 1) === 'auto'
}

/**
 * 페이지 번호를 화면에 한 번에 보이는 단위로 묶는다.
 * `single`은 단위마다 한 장, `spread`는 두 장이며, 표지를 혼자 두면 이후 쌍이
 * 인쇄된 책처럼 맞는다.
 *
 * 넓은 페이지는 짝을 짓지 않는다. 책 한가운데의 양면 삽화나 눕혀 스캔한 쪽이
 * 그것인데, 이 규칙이 없으면 그런 페이지 하나가 그 뒤의 모든 쌍을 한 장씩
 * 어긋나게 만든다. 넓은 페이지의 앞 장도 홀로 남는다 — 옆에 세울 짝이 없다.
 *
 * 표지를 혼자 두는 규칙보다 손으로 걸어 둔 `pair`가 세다. 첫 장부터 양면인 책이
 * 실제로 있고, 그런 책에서 표지 규칙은 틀린 답이다.
 *
 * @param bindingOf 그 번호의 페이지가 한 화면을 어떻게 차지하는지. 기본값은
 * 모두 `auto`이므로, 아무것도 모르는 책은 페이지 수만으로 둘씩 묶인다.
 */
export function buildSpreads(
  count: number,
  view: ViewMode,
  coverAlone: boolean,
  bindingOf: (page: number) => Binding = () => 'auto',
): number[][] {
  if (view === 'single') {
    return Array.from({ length: count }, (_, i) => [i])
  }
  const spreads: number[][] = []
  let i = 0
  if (coverAlone && count > 0 && bindingOf(0) !== 'pair') {
    spreads.push([0])
    i = 1
  }
  while (i < count) {
    if (pairsWithNext(bindingOf, i, count)) {
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
