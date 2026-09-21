/** S-151 · 브라우저가 말하는 언어에서 화면 언어를 고르는 자리. */

import { describe, expect, test } from 'vite-plus/test'

import { resolveLocale } from './locale.ts'

describe('resolveLocale', () => {
  test('a chosen language wins over what the browser says', () => {
    expect(resolveLocale('en', ['ko-KR', 'ko'])).toBe('en')
    expect(resolveLocale('ko', ['en-US'])).toBe('ko')
  })

  test('automatic takes the first language it has words for', () => {
    expect(resolveLocale('auto', ['fr-FR', 'ko-KR', 'en-US'])).toBe('ko')
    expect(resolveLocale('auto', ['en-GB'])).toBe('en')
  })

  test('a regional tag is the language in front of it', () => {
    expect(resolveLocale('auto', ['KO-kr'])).toBe('ko')
  })

  test('a browser that speaks nothing it knows gets English', () => {
    expect(resolveLocale('auto', ['fr-FR', 'de'])).toBe('en')
    expect(resolveLocale('auto', [])).toBe('en')
  })
})
