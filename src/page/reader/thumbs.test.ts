import { describe, expect, test } from 'vite-plus/test'

import { VirtualList } from '@foldkit/ui'

import { THUMBS_ID, THUMBS_PER_ROW, THUMB_ROW_HEIGHT } from './constant.ts'
import { missingFrom, pagesInView, rowsFor, urlFor } from './thumbs.ts'

const listAt = (scrollTop: number, containerHeight: number) => ({
  ...VirtualList.init({ id: THUMBS_ID, rowHeightPx: THUMB_ROW_HEIGHT }),
  scrollTop,
  measurement: { _tag: 'Measured' as const, containerHeight },
})

describe('rows', () => {
  test('pages are chunked into rows, and the last row may be short', () => {
    const rows = rowsFor(THUMBS_PER_ROW + 1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(THUMBS_PER_ROW)
    expect(rows[1]).toStrictEqual([THUMBS_PER_ROW])
  })

  test('a book with no pages has no rows', () => {
    expect(rowsFor(0)).toStrictEqual([])
  })
})

describe('windowing', () => {
  test('an unmeasured list still asks for the overscan around the top', () => {
    const pages = pagesInView(
      VirtualList.init({ id: THUMBS_ID, rowHeightPx: THUMB_ROW_HEIGHT }),
      100,
    )
    expect(pages[0]).toBe(0)
    // 화면에 무엇이 있는지 아직 모르므로 미리 읽는 몫만 나온다.
    expect(pages.length).toBeLessThan(100)
  })

  test('scrolling asks for the rows around the new position, not the whole book', () => {
    const pages = pagesInView(listAt(THUMB_ROW_HEIGHT * 10, THUMB_ROW_HEIGHT * 3), 500)

    // 10번 행, 화면에 세 행, 양옆으로 두 행씩 미리 읽기.
    expect(pages[0]).toBe(8 * THUMBS_PER_ROW)
    expect(pages.length).toBeLessThan(500)
    expect(pages).not.toContain(0)
  })

  test('the window never runs past the end of the book', () => {
    const pages = pagesInView(listAt(THUMB_ROW_HEIGHT * 100, THUMB_ROW_HEIGHT * 3), 12)
    expect(pages.every((page) => page < 12)).toBe(true)
  })
})

describe('what is already loaded', () => {
  const loaded = [
    { page: 1, url: 'blob:1' },
    { page: 3, url: 'blob:3' },
  ]

  test('only the pages without a thumbnail are asked for again', () => {
    expect(missingFrom(loaded, [1, 2, 3, 4])).toStrictEqual([2, 4])
  })

  test('a loaded page hands back its url', () => {
    expect(urlFor(loaded, 3)._tag).toBe('Some')
    expect(urlFor(loaded, 2)._tag).toBe('None')
  })
})
