import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { bookmarkFrom } from './bookmark.ts'

const bookmarks = [2, 5, 9]

describe('stepping between bookmarks', () => {
  test('a step forward lands on the first bookmark after this page', () => {
    expect(bookmarkFrom(bookmarks, 3, 1)).toStrictEqual(Option.some(5))
  })

  test('a step back lands on the last bookmark before this page', () => {
    expect(bookmarkFrom(bookmarks, 6, -1)).toStrictEqual(Option.some(5))
  })

  test('standing on a bookmark steps past it rather than staying', () => {
    expect(bookmarkFrom(bookmarks, 5, 1)).toStrictEqual(Option.some(9))
    expect(bookmarkFrom(bookmarks, 5, -1)).toStrictEqual(Option.some(2))
  })

  test('past the last bookmark there is nowhere forward to go', () => {
    expect(bookmarkFrom(bookmarks, 9, 1)._tag).toBe('None')
  })

  test('before the first bookmark there is nowhere back to go', () => {
    expect(bookmarkFrom(bookmarks, 2, -1)._tag).toBe('None')
  })

  test('a book with nothing bookmarked goes nowhere', () => {
    expect(bookmarkFrom([], 3, 1)._tag).toBe('None')
    expect(bookmarkFrom([], 3, -1)._tag).toBe('None')
  })
})
