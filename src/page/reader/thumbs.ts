import { Array, Option } from 'effect'

import { VirtualList } from '@foldkit/ui'

import { THUMBS_PER_ROW, THUMB_OVERSCAN } from './constant.ts'
import type { Panel } from './model.ts'

/** 격자의 각 행에 들어갈 페이지들. `Array.range`는 끝을 포함해서 세므로, 빈 책은
 *  `range(0, -1)`을 부르기 전에 돌려보내야 한다. */
export const rowsFor = (pageCount: number): ReadonlyArray<ReadonlyArray<number>> =>
  pageCount <= 0 ? [] : Array.chunksOf(Array.range(0, pageCount - 1), THUMBS_PER_ROW)

/**
 * 지금 격자가 보여 줄 수 있는 페이지들. 리스트 자신의 스크롤 상태에서 읽어 낸다.
 * 창을 그리는 것은 컴포넌트이고, 그 창에 무엇을 뽑아 줄지 정하는 것이 여기다.
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
 * 필요한 페이지 중 아직 뽑지 않은 것. 그래서 스크롤할 때마다 직전에 가져오지
 * 않은 것만 요청한다.
 */
export const missingFrom = (
  loaded: ReadonlyArray<Panel>,
  wanted: ReadonlyArray<number>,
): ReadonlyArray<number> =>
  Array.filter(wanted, (page) => !Array.some(loaded, (panel) => panel.page === page))

/** 페이지의 썸네일. 뽑기 전까지는 없다. */
export const urlFor = (loaded: ReadonlyArray<Panel>, page: number): Option.Option<string> =>
  Option.map(
    Array.findFirst(loaded, (panel) => panel.page === page),
    (panel) => panel.url,
  )

/** 이미 뽑아 둔 모든 페이지. 놓아 주는 쪽이 이것을 기준으로 삼는다. */
export const loadedPages = (loaded: ReadonlyArray<Panel>): ReadonlyArray<number> =>
  Array.map(loaded, (panel) => panel.page)
