import { describe, expect, test } from 'vite-plus/test'

import { buildSpreads, spreadOfPage } from './spreads.ts'

describe('grouping pages', () => {
  test('one-page mode gives every page a unit of its own', () => {
    expect(buildSpreads(3, 'single', true)).toStrictEqual([[0], [1], [2]])
  })

  test('two-page mode leaves the cover alone so the pairs after it line up', () => {
    expect(buildSpreads(5, 'spread', true)).toStrictEqual([[0], [1, 2], [3, 4]])
  })

  test('without the cover rule the pairing starts at the first page', () => {
    expect(buildSpreads(5, 'spread', false)).toStrictEqual([[0, 1], [2, 3], [4]])
  })

  test('a book with no pages has no units', () => {
    expect(buildSpreads(0, 'spread', true)).toStrictEqual([])
  })
})

describe('pages that will not share a spread', () => {
  const wide =
    (...pages: number[]) =>
    (page: number) =>
      pages.includes(page)

  test('a wide page in the middle is shown on its own', () => {
    expect(buildSpreads(6, 'spread', false, wide(2))).toStrictEqual([[0, 1], [2], [3, 4], [5]])
  })

  test('the page before a wide one is left alone rather than paired across it', () => {
    // 3이 넓으므로 2는 옆에 세울 짝이 없다. 그래야 4-5가 다시 맞물린다.
    expect(buildSpreads(6, 'spread', false, wide(3))).toStrictEqual([[0, 1], [2], [3], [4, 5]])
  })

  test('one wide page does not push every pair after it off by one', () => {
    const spreads = buildSpreads(7, 'spread', true, wide(3))
    expect(spreads).toStrictEqual([[0], [1, 2], [3], [4, 5], [6]])
  })

  test('a book of wide pages reads one page at a time', () => {
    expect(buildSpreads(3, 'spread', false, () => true)).toStrictEqual([[0], [1], [2]])
  })

  test('one-page mode ignores the rule, having nothing to pair', () => {
    expect(buildSpreads(3, 'single', false, () => true)).toStrictEqual([[0], [1], [2]])
  })
})

describe('finding a page', () => {
  test('a page reports the spread it is drawn in', () => {
    const spreads = buildSpreads(5, 'spread', true)
    expect(spreadOfPage(spreads, 0)).toBe(0)
    expect(spreadOfPage(spreads, 2)).toBe(1)
    expect(spreadOfPage(spreads, 4)).toBe(2)
  })

  test('a page outside the book answers with the first spread', () => {
    expect(spreadOfPage(buildSpreads(5, 'spread', true), 99)).toBe(0)
  })
})
