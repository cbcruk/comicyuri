/** S-151 · 문구가 언어마다 제 규칙으로 찍히는지. 규칙을 아는 것은 ICU다. */

import { describe, expect, test } from 'vite-plus/test'

import { translatorFor } from './format.ts'

describe('translatorFor', () => {
  test('a message with nothing to fill in is the message', () => {
    expect(translatorFor('en')('item.zoomIn')).toBe('Zoom in')
    expect(translatorFor('ko')('item.zoomIn')).toBe('확대')
  })

  test('values go where the message says, in the order that language wants', () => {
    expect(translatorFor('en')('reader.resume', { page: 4 })).toBe('You left this book on page 4')
    expect(translatorFor('ko')('reader.resume', { page: 4 })).toBe('4페이지까지 읽었습니다')
  })

  test('English counts in singular and plural, Korean in neither', () => {
    const en = translatorFor('en')
    expect(en('shelf.pages', { count: 1 })).toBe('1 page')
    expect(en('shelf.pages', { count: 6 })).toBe('6 pages')

    // 한국어에는 복수형이 없다. 규칙을 손으로 적지 않아도 각 언어가 제 것을 따른다.
    expect(translatorFor('ko')('shelf.pages', { count: 1 })).toBe('1쪽')
    expect(translatorFor('ko')('shelf.pages', { count: 6 })).toBe('6쪽')
  })
})
