import { Array, Option } from 'effect'

import { buildSpreads, spreadOfPage } from '../../spreads.ts'
import type { Settings } from '../../types.ts'

/** 읽는 자리 양옆으로 미리 데워 둘 스프레드 수, 그리고 계속 쥐고 있을 수. */
const PRELOAD = 1
const KEEP = 3

/**
 * 페이지별 가로세로비. 번호는 페이지 번호이고, 임포트할 때 재지 못한 페이지는
 * `None`이다.
 */
export type Ratios = ReadonlyArray<Option.Option<number>>

/** 그 페이지의 비. 책 밖이거나 재지 못했으면 없음. */
const ratioAt = (ratios: Ratios, page: number): Option.Option<number> =>
  Option.flatten(Array.get(ratios, page))

/**
 * 스프레드는 저장하지 않고 매번 이끌어 낸다. 기대는 것이 페이지 수와 설정, 그리고
 * 책과 함께 도착한 페이지 비뿐이고, 이끌어 내면 한 장/두 장을 바꿨을 때 낡은
 * 묶음이 Model에 남을 수 없다.
 *
 * 크기를 모르는 페이지는 넓지 않은 것으로 친다. 재기 전에 들여온 책이 예전과
 * 똑같이 열리는 쪽이, 모른다는 이유로 통째로 한 장씩 보이는 쪽보다 낫다.
 */
export const spreadsFor = (
  pageCount: number,
  settings: Settings,
  ratios: Ratios,
): ReadonlyArray<ReadonlyArray<number>> =>
  buildSpreads(pageCount, settings.view, settings.coverAlone, (page) =>
    Option.exists(ratioAt(ratios, page), (ratio) => ratio >= settings.singleThreshold),
  )

/**
 * 페이지가 어느 스프레드에 속하는지. 책 밖의 페이지는 없음이 아니라 첫 스프레드로
 * 답한다.
 */
export const indexOfPage = (spreads: ReadonlyArray<ReadonlyArray<number>>, page: number): number =>
  spreadOfPage(
    spreads.map((spread) => [...spread]),
    page,
  )

/** 스프레드 하나의 페이지들. 책의 양 끝을 넘어가면 비어 있다. */
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

/** 준비해 둘 만한 페이지. 지금 스프레드와 양옆 하나씩. */
export const neighbourPages = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
): ReadonlyArray<number> => pagesWithin(spreads, index, PRELOAD)

/**
 * 쥐고 있을 만한 페이지. 이보다 멀리 있는 것은 object URL을 놓아 주며, 그것이
 * 긴 책이 메모리를 채우는 것을 막는다.
 */
export const pagesToKeep = (
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  index: number,
): ReadonlyArray<number> => pagesWithin(spreads, index, KEEP)

/** 한 걸음 뒤에 닿는 페이지. 책 밖으로는 나가지 않는다. */
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
 * 페이지에 대한 슬라이더 값이자, 그 값에 대한 페이지. 오른쪽에서 왼쪽으로 읽으면
 * 슬라이더도 반대로 가므로, 값은 끝에서부터 센 페이지가 된다. 픽셀이 아니라 값을
 * 뒤집으므로 컴포넌트 자신의 포인터 계산과 화살표 키가 기대한 쪽을 가리킨다.
 *
 * 스스로의 역함수라서, 이 매핑의 양방향을 한 함수가 맡는다.
 */
export const mirrorForDirection = (
  page: number,
  pageCount: number,
  direction: Settings['direction'],
): number => (direction === 'rtl' ? Math.max(0, pageCount - 1) - page : page)
