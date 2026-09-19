/** R-267 · 슬라이더에 찍는 페이지 눈금이 책의 길이에 맞춰 성기어지는지. */

import { describe, expect, test } from 'vite-plus/test'

import { pageTicks, tickStep } from './ticks.ts'

describe('tickStep', () => {
  test('a short book marks every page', () => {
    expect(tickStep(6)).toBe(1)
    expect(tickStep(20)).toBe(1)
  })

  test('a longer book spaces its marks by an easy number', () => {
    expect(tickStep(21)).toBe(2)
    expect(tickStep(120)).toBe(10)
    expect(tickStep(500)).toBe(50)
  })
})

describe('pageTicks', () => {
  test('every page of a short book gets a mark', () => {
    expect(pageTicks(6)).toEqual([0, 1, 2, 3, 4, 5])
  })

  test('a long book marks the first page and every tenth', () => {
    expect(pageTicks(45)).toEqual([0, 4, 9, 14, 19, 24, 29, 34, 39, 44])
    expect(pageTicks(120)).toEqual([0, 9, 19, 29, 39, 49, 59, 69, 79, 89, 99, 109, 119])
  })

  test('an empty book has no marks', () => {
    expect(pageTicks(0)).toEqual([])
  })
})
