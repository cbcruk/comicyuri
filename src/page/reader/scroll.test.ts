import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { ORIGIN } from './gesture.ts'
import { NO_ROOM, SCROLL_QUIET_MILLIS, isNewFlick, pannedBy, turnFromEdge } from './scroll.ts'

const roomAllRound = { up: 100, down: 100, left: 100, right: 100 }

describe('scrolling inside a page', () => {
  test('scrolling down moves the page up', () => {
    expect(pannedBy(ORIGIN, { x: 0, y: 40 }, roomAllRound)).toStrictEqual({ x: 0, y: -40 })
  })

  test('scrolling stops where the page ends', () => {
    expect(pannedBy(ORIGIN, { x: 0, y: 400 }, roomAllRound)).toStrictEqual({ x: 0, y: -100 })
    expect(pannedBy(ORIGIN, { x: 0, y: -400 }, roomAllRound)).toStrictEqual({ x: 0, y: 100 })
  })

  test('each axis is held by its own edge', () => {
    expect(pannedBy(ORIGIN, { x: 400, y: 10 }, roomAllRound)).toStrictEqual({ x: -100, y: -10 })
  })

  test('a page that fits has nowhere to go', () => {
    expect(pannedBy(ORIGIN, { x: 30, y: 30 }, NO_ROOM)).toStrictEqual(ORIGIN)
  })
})

describe('turning from the edge', () => {
  test('scrolling down at the bottom asks for the next page', () => {
    expect(turnFromEdge({ x: 0, y: 40 }, { ...roomAllRound, down: 0 })).toStrictEqual(
      Option.some(1),
    )
  })

  test('scrolling up at the top asks for the previous page', () => {
    expect(turnFromEdge({ x: 0, y: -40 }, { ...roomAllRound, up: 0 })).toStrictEqual(
      Option.some(-1),
    )
  })

  test('a page with somewhere left to go turns nothing', () => {
    expect(turnFromEdge({ x: 0, y: 40 }, roomAllRound)._tag).toBe('None')
  })

  test('a page that fits is already at both of its edges', () => {
    expect(turnFromEdge({ x: 0, y: 40 }, NO_ROOM)).toStrictEqual(Option.some(1))
    expect(turnFromEdge({ x: 0, y: -40 }, NO_ROOM)).toStrictEqual(Option.some(-1))
  })

  test('a sideways scroll turns nothing', () => {
    expect(turnFromEdge({ x: 40, y: 0 }, NO_ROOM)._tag).toBe('None')
    expect(turnFromEdge({ x: 40, y: 5 }, NO_ROOM)._tag).toBe('None')
  })

  test('a stray pixel still counts as the edge', () => {
    expect(turnFromEdge({ x: 0, y: 40 }, { ...NO_ROOM, down: 1 })).toStrictEqual(Option.some(1))
  })
})

describe('telling one flick from the next', () => {
  test('the events of one flick belong together', () => {
    expect(isNewFlick(1016, 1000)).toBe(false)
  })

  test('a flick after a pause is a new one', () => {
    expect(isNewFlick(1000 + SCROLL_QUIET_MILLIS + 1, 1000)).toBe(true)
  })

  test('the first scroll of all is a new flick', () => {
    expect(isNewFlick(1000, 0)).toBe(true)
  })
})
