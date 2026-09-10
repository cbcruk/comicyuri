import { Array, Option } from 'effect'

import { VirtualList } from '@foldkit/ui'

import { THUMBS_PER_ROW, THUMB_OVERSCAN } from './constant.ts'
import type { Panel } from './model.ts'

/**
 * 격자가 늘어놓을 페이지들. 북마크만 보는 중이면 그 페이지들뿐이다.
 *
 * `Array.range`는 끝을 포함해서 세므로, 빈 책은 `range(0, -1)`을 부르기 전에
 * 돌려보내야 한다.
 */
export const shownPages = (
  pageCount: number,
  bookmarks: ReadonlyArray<number>,
  bookmarksOnly: boolean,
): ReadonlyArray<number> => {
  if (pageCount <= 0) return []
  const pages = Array.range(0, pageCount - 1)
  return bookmarksOnly ? Array.filter(pages, (page) => Array.contains(bookmarks, page)) : pages
}

/** 격자의 각 행에 들어갈 페이지들. */
export const rowsFor = (pages: ReadonlyArray<number>): ReadonlyArray<ReadonlyArray<number>> =>
  Array.chunksOf(pages, THUMBS_PER_ROW)

/**
 * 지금 격자가 보여 줄 수 있는 페이지들. 리스트 자신의 스크롤 상태에서 읽어 낸다.
 * 창을 그리는 것은 컴포넌트이고, 그 창에 무엇을 뽑아 줄지 정하는 것이 여기다.
 *
 * 창은 행 번호로 잡으므로, 답은 늘어놓기로 한 목록에서 그 자리를 잘라 낸 것이다.
 * 북마크만 보는 중이라면 그 목록이 곧 북마크들이다.
 */
export const pagesInView = (
  list: VirtualList.Model,
  pages: ReadonlyArray<number>,
): ReadonlyArray<number> => {
  const containerHeight =
    list.measurement._tag === 'Measured' ? list.measurement.containerHeight : 0

  const firstRow = Math.floor(list.scrollTop / list.rowHeightPx)
  const rowsOnScreen = Math.ceil(containerHeight / list.rowHeightPx) + 1

  const from = Math.max(0, firstRow - THUMB_OVERSCAN)
  const to = firstRow + rowsOnScreen + THUMB_OVERSCAN

  return Array.take(Array.drop(pages, from * THUMBS_PER_ROW), (to - from) * THUMBS_PER_ROW)
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
