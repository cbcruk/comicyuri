import { describe, expect, test } from 'vite-plus/test'

import { halfAfterStep, sideOf, staysOnPage } from './half.ts'

describe('reading a wide page in halves', () => {
  test('a step forward from the first half stays on the page', () => {
    expect(staysOnPage('first', 1)).toBe(true)
    expect(staysOnPage('second', 1)).toBe(false)
  })

  test('a step back from the second half stays on the page', () => {
    expect(staysOnPage('second', -1)).toBe(true)
    expect(staysOnPage('first', -1)).toBe(false)
  })

  test('the step lands on the half it was heading for', () => {
    expect(halfAfterStep(1)).toBe('second')
    expect(halfAfterStep(-1)).toBe('first')
  })

  test('right to left reads the right half first', () => {
    expect(sideOf('first', 'rtl')).toBe('right')
    expect(sideOf('second', 'rtl')).toBe('left')
  })

  test('left to right reads the left half first', () => {
    expect(sideOf('first', 'ltr')).toBe('left')
    expect(sideOf('second', 'ltr')).toBe('right')
  })
})
