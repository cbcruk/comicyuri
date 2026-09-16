import { describe, expect, test } from 'vite-plus/test'

import { THUMBS_DEFAULT_WIDTH } from './constant.ts'
import { cellWidthFor, perRowFor, rowHeightFor, rowsFor, shownPages } from './thumbs.ts'

const THUMBS_PER_ROW_DEFAULT = perRowFor(THUMBS_DEFAULT_WIDTH)

const allOf = (pageCount: number) => shownPages(pageCount, [], false)

describe('what the grid lays out', () => {
  test('every page of the book, in order', () => {
    expect(shownPages(3, [], false)).toStrictEqual([0, 1, 2])
  })

  test('filtered to bookmarks, only those pages', () => {
    expect(shownPages(6, [1, 4], true)).toStrictEqual([1, 4])
  })

  test('a book with nothing bookmarked lays out nothing', () => {
    expect(shownPages(6, [], true)).toStrictEqual([])
  })

  test('a book with no pages lays out nothing', () => {
    expect(shownPages(0, [], false)).toStrictEqual([])
  })
})

describe('rows', () => {
  test('pages are chunked into rows, and the last row may be short', () => {
    const rows = rowsFor(allOf(THUMBS_PER_ROW_DEFAULT + 1), THUMBS_PER_ROW_DEFAULT)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(THUMBS_PER_ROW_DEFAULT)
    expect(rows[1]).toStrictEqual([THUMBS_PER_ROW_DEFAULT])
  })

  test('a book with no pages has no rows', () => {
    expect(rowsFor(allOf(0), THUMBS_PER_ROW_DEFAULT)).toStrictEqual([])
  })
})

describe('how many stand in a row', () => {
  test('a wider window stands more of them', () => {
    expect(perRowFor(1680)).toBeGreaterThan(perRowFor(834))
    expect(perRowFor(834)).toBeGreaterThan(perRowFor(390))
  })

  test('however narrow, the grid never falls to a single column', () => {
    expect(perRowFor(120)).toBe(2)
    expect(perRowFor(0)).toBe(2)
  })

  // 칸이 남는 자리를 나눠 가져서 행이 폭을 남김없이 쓴다.
  test('the columns fill the row they stand in', () => {
    const width = 1680
    const perRow = perRowFor(width)
    const used = perRow * cellWidthFor(width) + (perRow - 1) * 12 + 8

    expect(width - used).toBeLessThan(perRow)
  })

  test('a column never gets narrower than the width that decided the count', () => {
    for (const width of [320, 390, 834, 1280, 1680, 2560]) {
      expect(cellWidthFor(width)).toBeGreaterThanOrEqual(104)
    }
  })

  test('a wider window makes the thumbnails bigger, not just more of them', () => {
    // 한 칸이 더 들어가기 직전까지는 칸이 넓어진다.
    expect(cellWidthFor(900)).toBeGreaterThan(cellWidthFor(840))
  })

  test('a row is as tall as its columns are wide, with room for the number', () => {
    for (const width of [390, 834, 1680]) {
      expect(rowHeightFor(width)).toBe(Math.round(cellWidthFor(width) * 1.5) + 24)
    }
  })

  /**
   * 폭이 넓어지면 칸은 한 칸이 더 들어갈 때까지 넓어지다가, 들어가는 순간 다시
   * 좁아진다. 그래서 넓은 창이 늘 큰 썸네일을 주지는 않는다 — 좁은 창은 열이
   * 적어서 오히려 칸이 크다. 어느 폭에서든 지켜지는 것은 이 범위다.
   */
  test('a column stays between one column wide and two', () => {
    for (const width of [320, 390, 480, 834, 900, 1280, 1680, 2560]) {
      expect(cellWidthFor(width)).toBeGreaterThanOrEqual(104)
      // 이보다 넓으면 한 칸이 더 들어갔어야 한다.
      expect(cellWidthFor(width)).toBeLessThan(104 * 2 + 12)
    }
  })
})
