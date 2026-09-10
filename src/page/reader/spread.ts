import { Array, Option } from 'effect'

import { buildSpreads, spreadOfPage } from '../../spreads.ts'
import type { Binding } from '../../spreads.ts'
import type { PageMark, Settings } from '../../types.ts'

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

/** 묶기를 정하는 데 필요한, 책 쪽에서 오는 사실들. */
export type Layout = Readonly<{
  /** 책의 페이지 수. */
  pageCount: number
  /** 임포트할 때 잰 페이지별 비. */
  ratios: Ratios
  /** 자동 판정을 덮어쓰려고 손으로 걸어 둔 표시. */
  marks: ReadonlyArray<PageMark>
}>

/** 그 페이지에 걸린 표시. 없으면 자동 판정에 맡긴다. */
const markAt = (marks: ReadonlyArray<PageMark>, page: number): Option.Option<PageMark> =>
  Array.findFirst(marks, (mark) => mark.page === page)

/**
 * 손으로 걸어 둔 표시를 먼저 보고, 없으면 페이지 비로 정한다. 자동 판정이 아무리
 * 좋아도 틀릴 때가 있고, 그때 사람이 내린 답을 이길 근거는 없다.
 */
const bindingFor = (layout: Layout, settings: Settings, page: number): Binding =>
  Option.match(markAt(layout.marks, page), {
    onSome: (mark) => mark.binding,
    onNone: () =>
      Option.exists(ratioAt(layout.ratios, page), (ratio) => ratio >= settings.singleThreshold)
        ? 'alone'
        : 'auto',
  })

/**
 * 스프레드는 저장하지 않고 매번 이끌어 낸다. 기대는 것이 설정과 책 쪽 사실들뿐이고,
 * 이끌어 내면 한 장/두 장을 바꿨을 때 낡은 묶음이 Model에 남을 수 없다.
 *
 * 크기를 모르고 표시도 없는 페이지는 넓지 않은 것으로 친다. 재기 전에 들여온
 * 책이 예전과 똑같이 열리는 쪽이, 모른다는 이유로 통째로 한 장씩 보이는 쪽보다
 * 낫다.
 */
export const spreadsFor = (
  layout: Layout,
  settings: Settings,
): ReadonlyArray<ReadonlyArray<number>> =>
  buildSpreads(layout.pageCount, settings.view, settings.coverAlone, (page) =>
    bindingFor(layout, settings, page),
  )

/**
 * 지금 이 스프레드에 걸 표시. 두 장이 보이고 있으면 첫 장을 혼자 세우고, 한 장만
 * 보이고 있으면 다음 장과 묶는다.
 *
 * 같은 자리에서 두 번 누르면 처음 보던 묶음으로 돌아온다.
 */
export const flipBinding = (
  marks: ReadonlyArray<PageMark>,
  spread: ReadonlyArray<number>,
): ReadonlyArray<PageMark> =>
  Option.match(Array.head(spread), {
    onNone: () => marks,
    onSome: (first) =>
      Array.append(
        Array.filter(marks, (mark) => mark.page !== first),
        { page: first, binding: spread.length > 1 ? 'alone' : 'pair' },
      ),
  })

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
