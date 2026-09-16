import { Array } from 'effect'

import {
  THUMBS_PER_ROW_MIN,
  THUMB_GAP,
  THUMB_INSET,
  THUMB_LABEL_HEIGHT,
  THUMB_RATIO,
  THUMB_WIDTH,
} from './constant.ts'

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

/**
 * 그 폭에 몇 칸이 서는지.
 *
 * 마지막 칸 뒤에는 사이 여백이 붙지 않으므로, 여백 하나를 더해 두고 나눈다.
 * 아무리 좁아도 {@linkcode THUMBS_PER_ROW_MIN}칸은 세운다 — 한 칸씩 늘어서면
 * 격자가 아니라 목록이다.
 *
 * @param width 격자가 놓인 곳의 너비(픽셀).
 */
export const perRowFor = (width: number): number =>
  Math.max(
    THUMBS_PER_ROW_MIN,
    Math.floor((width - THUMB_INSET + THUMB_GAP) / (THUMB_WIDTH + THUMB_GAP)),
  )

/**
 * 그 폭에서 칸 하나가 차지할 너비(픽셀).
 *
 * 몇 칸이 설지를 먼저 정하고, 남는 자리를 그 칸들이 고르게 나눠 갖는다. 그래서
 * 칸은 {@linkcode THUMB_WIDTH}보다 좁아지지 않고, 한 칸이 더 들어갈 만큼
 * 넓어지지도 않는다. 행은 폭을 남김없이 쓴다.
 */
export const cellWidthFor = (width: number): number => {
  const perRow = perRowFor(width)
  const room = Math.max(THUMB_WIDTH * perRow, width - THUMB_INSET - (perRow - 1) * THUMB_GAP)
  return Math.floor(room / perRow)
}

/**
 * 그 폭에서 행 하나가 차지할 높이(픽셀).
 *
 * 칸의 너비를 따라간다. 고정해 두면 넓어진 칸 안에서 썸네일만 그대로 작게 선다.
 * 가상 리스트가 이 값으로 행의 자리를 셈하므로, 폭이 바뀌면 리스트에도 새 값을
 * 먹여야 한다.
 */
export const rowHeightFor = (width: number): number =>
  Math.round(cellWidthFor(width) * THUMB_RATIO) + THUMB_LABEL_HEIGHT

/** 격자의 각 행에 들어갈 페이지들. */
export const rowsFor = (
  pages: ReadonlyArray<number>,
  perRow: number,
): ReadonlyArray<ReadonlyArray<number>> => Array.chunksOf(pages, perRow)
