import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { coversOf, droppedCoverUrls, neighbour, pageCountLabel } from './book.ts'
import type { BookSummary } from './book.ts'

const book = (id: string): BookSummary => ({
  id,
  title: id,
  source: 'zip',
  maybePageCount: Option.some(12),
  maybeCoverUrl: Option.none(),
})

const shelf = [book('volume-1'), book('volume-2'), book('volume-3')]

/** 표지를 쥐고 있는 책. */
const withCover = (id: string, url: string): BookSummary => ({
  ...book(id),
  maybeCoverUrl: Option.some(url),
})

describe('the covers a shelf is holding', () => {
  test('each cover is paired with the book it belongs to', () => {
    expect(coversOf([withCover('a', 'blob:a'), book('b'), withCover('c', 'blob:c')])).toStrictEqual(
      [
        { id: 'a', url: 'blob:a' },
        { id: 'c', url: 'blob:c' },
      ],
    )
  })

  // 다시 읽어도 그대로 남은 책의 표지는 같은 URL을 쥐고 있다. 놓아 주면 아직
  // 화면에 걸린 `img`의 바닥을 빼는 셈이다.
  test('a cover that both shelves hold is not dropped', () => {
    const before = [withCover('a', 'blob:a'), withCover('b', 'blob:b')]
    const after = [withCover('a', 'blob:a'), withCover('b', 'blob:b')]

    expect(droppedCoverUrls(before, after)).toStrictEqual([])
  })

  test('only the cover of a book that left is dropped', () => {
    const before = [withCover('a', 'blob:a'), withCover('gone', 'blob:gone')]
    const after = [withCover('a', 'blob:a'), withCover('new', 'blob:new')]

    expect(droppedCoverUrls(before, after)).toStrictEqual(['blob:gone'])
  })

  test('a book whose cover was made afresh drops the one it replaced', () => {
    const before = [withCover('a', 'blob:old')]
    const after = [withCover('a', 'blob:new')]

    expect(droppedCoverUrls(before, after)).toStrictEqual(['blob:old'])
  })
})

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
