/**
 * 열린 책 하나에서 화면이 알아야 하는 것을 한 번에 이끌어 내는 자리.
 *
 * 스프레드 묶기는 페이지 수와 페이지 비, 손으로 고친 묶기, 설정에서 나온다. 스테이지도
 * 크롬도 격자도 같은 묶기를 봐야 하므로 한 번만 셈해 내려보낸다. Foldkit 리더의 `view`가
 * 첫머리에서 하던 일이 이것이다.
 */

import { Array, Option } from 'effect'

import { indexOfPage, pagesAt, spreadsFor } from '../../reader/spread.ts'
import type { Layout } from '../../reader/spread.ts'
import { OpenState } from '../../reader/model.ts'
import type { Model } from '../../reader/model.ts'

/** 지금 열려 있는 책에 대해 화면이 셈해 둔 것. */
export type ReaderLayout = Readonly<{
  title: string
  pageCount: number
  /** 페이지별 파일 이름. 카운터 아래에 이것이 적힌다(`R-217`). */
  names: ReadonlyArray<string>
  /** 묶기와 반쪽 계산이 보는 것. */
  layout: Layout
  spreads: ReadonlyArray<ReadonlyArray<number>>
  /** 지금 페이지가 속한 스프레드의 번호. */
  index: number
  /** 지금 화면에 걸릴 스프레드의 페이지들. */
  here: ReadonlyArray<number>
  /** 미리 읽어 둘 양옆 스프레드(`R-215`). 책의 끝에서는 한쪽뿐이다. */
  neighbours: ReadonlyArray<ReadonlyArray<number>>
}>

/** 책이 열린 뒤에만 셈할 수 있다. 여는 중이거나 실패했으면 없음이다. */
export const readerLayout = (model: Model): Option.Option<ReaderLayout> =>
  OpenState.$match(model.openState, {
    Opening: (): Option.Option<ReaderLayout> => Option.none(),
    Failed: (): Option.Option<ReaderLayout> => Option.none(),
    Ready: ({ title, pageCount, ratios, names }): Option.Option<ReaderLayout> => {
      const layout: Layout = { pageCount, ratios, marks: model.marks }
      const spreads = spreadsFor(layout, model.settings)
      const index = indexOfPage(spreads, model.page)

      return Option.some({
        title,
        pageCount,
        names,
        layout,
        spreads,
        index,
        here: pagesAt(spreads, index),
        neighbours: Array.filter(
          [pagesAt(spreads, index - 1), pagesAt(spreads, index + 1)],
          (spread) => spread.length > 0,
        ),
      })
    },
  })

/**
 * 카운터에 적히는 글자. 한 장이면 `3 / 120`, 두 장이면 `4–5 / 120`이다(`R-213`).
 *
 * Foldkit 툴바의 `counterLabel`을 그대로 옮긴 것이다.
 */
export const counterLabel = (pages: ReadonlyArray<number>, pageCount: number): string => {
  const first = Option.getOrElse(Array.head(pages), () => 0)
  const last = Option.getOrElse(Array.last(pages), () => first)
  const shown = first === last ? `${first + 1}` : `${first + 1}–${last + 1}`
  return `${shown} / ${pageCount}`
}

/** 지금 화면에 걸린 파일들의 이름, 읽는 순서대로(`R-217`). */
export const fileNamesFor = (
  pages: ReadonlyArray<number>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> => Array.getSomes(Array.map(pages, (page) => Array.get(names, page)))
