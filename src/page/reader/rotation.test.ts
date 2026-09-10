import { describe, expect, test } from 'vite-plus/test'

import { rotatedRight, swapsSides } from './rotation.ts'

describe('turning the page upright', () => {
  test('four turns come back around', () => {
    expect(rotatedRight(0)).toBe(90)
    expect(rotatedRight(90)).toBe(180)
    expect(rotatedRight(180)).toBe(270)
    expect(rotatedRight(270)).toBe(0)
  })

  test('a quarter turn swaps the sides of the box, a half turn does not', () => {
    expect(swapsSides(90)).toBe(true)
    expect(swapsSides(270)).toBe(true)
    expect(swapsSides(0)).toBe(false)
    expect(swapsSides(180)).toBe(false)
  })
})
