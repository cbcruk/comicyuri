import { describe, expect, test } from 'vite-plus/test'

import { buildSpreads, spreadOfPage } from './spreads.ts'
import type { Binding } from './spreads.ts'

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
  /** 그 번호만 넓다고 답하는 판정. 나머지는 옆 장 사정에 맡긴다. */
  const wide =
    (...pages: number[]) =>
    (page: number): Binding =>
      pages.includes(page) ? 'alone' : 'auto'

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
    expect(buildSpreads(3, 'spread', false, () => 'alone')).toStrictEqual([[0], [1], [2]])
  })

  test('one-page mode ignores the rule, having nothing to pair', () => {
    expect(buildSpreads(3, 'single', false, () => 'alone')).toStrictEqual([[0], [1], [2]])
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

describe('bindings set by hand', () => {
  /** 손으로 걸어 둔 표시만 답하고 나머지는 자동에 맡기는 판정. */
  const marked =
    (entries: Readonly<Record<number, Binding>>) =>
    (page: number): Binding =>
      entries[page] ?? 'auto'

  test('a page told to stand alone does, however narrow it is', () => {
    expect(buildSpreads(5, 'spread', false, marked({ 1: 'alone' }))).toStrictEqual([
      [0],
      [1],
      [2, 3],
      [4],
    ])
  })

  test('a page told to pair does, however wide it is', () => {
    const bindings = marked({ 2: 'pair', 3: 'alone' })
    // 3은 넓다고 나왔지만 2가 그것과 묶이라는 표시를 이긴다.
    expect(buildSpreads(4, 'spread', false, bindings)).toStrictEqual([
      [0, 1],
      [2, 3],
    ])
  })

  test('a page bound to the next one wins over the cover rule', () => {
    // 첫 장부터 양면인 책이 있고, 그런 책에서 표지 규칙은 틀린 답이다.
    expect(buildSpreads(4, 'spread', true, marked({ 0: 'pair' }))).toStrictEqual([
      [0, 1],
      [2, 3],
    ])
  })

  test('the page before one bound to its own next page is left alone', () => {
    expect(buildSpreads(5, 'spread', false, marked({ 1: 'pair' }))).toStrictEqual([
      [0],
      [1, 2],
      [3, 4],
    ])
  })
})
