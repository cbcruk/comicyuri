import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { neighbour, pageCountLabel } from './book.ts'
import type { BookSummary } from './book.ts'

const book = (id: string): BookSummary => ({
  id,
  title: id,
  source: 'zip',
  maybePageCount: Option.some(12),
  maybeCoverUrl: Option.none(),
})

const shelf = [book('volume-1'), book('volume-2'), book('volume-3')]

describe('the book next to this one', () => {
  test('a step forward lands on the next book in shelf order', () => {
    expect(Option.map(neighbour(shelf, 'volume-1', 1), (b) => b.id)).toStrictEqual(
      Option.some('volume-2'),
    )
  })

  test('a step back lands on the one before', () => {
    expect(Option.map(neighbour(shelf, 'volume-3', -1), (b) => b.id)).toStrictEqual(
      Option.some('volume-2'),
    )
  })

  test('the shelf does not wrap around at either end', () => {
    expect(neighbour(shelf, 'volume-3', 1)._tag).toBe('None')
    expect(neighbour(shelf, 'volume-1', -1)._tag).toBe('None')
  })

  test('a book that is not on the shelf has no neighbour', () => {
    expect(neighbour(shelf, 'volume-9', 1)._tag).toBe('None')
  })
})

describe('how a card says its length', () => {
  test('a book nobody has opened yet does not claim a page count', () => {
    expect(pageCountLabel({ ...book('volume-1'), maybePageCount: Option.none() })).toBe(
      'Page count unknown',
    )
  })
})
