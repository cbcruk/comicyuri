import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { ORIGIN } from './gesture.ts'
import { NO_ROOM, deviceFor, pannedBy, turnFromEdge } from './scroll.ts'

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

describe('telling a wheel from a trackpad', () => {
  /** 크로미움이 마우스 휠 한 칸에 싣는 값. */
  const notch = { deltaX: 0, deltaY: 100, deltaMode: 0, wheelDeltaY: -120 }

  test('a mouse wheel carries a multiple of 120', () => {
    expect(deviceFor(notch)).toBe('wheel')
    expect(deviceFor({ ...notch, deltaY: 300, wheelDeltaY: -360 })).toBe('wheel')
  })

  test('a wheel counted in lines is a wheel too', () => {
    // 파이어폭스의 마우스 휠. `wheelDeltaY`가 없는 대신 줄 단위로 온다.
    expect(deviceFor({ deltaX: 0, deltaY: 3, deltaMode: 1, wheelDeltaY: undefined })).toBe('wheel')
  })

  test('a trackpad carries how far the fingers went', () => {
    expect(deviceFor({ deltaX: 0, deltaY: 7, deltaMode: 0, wheelDeltaY: -21 })).toBe('trackpad')
    expect(deviceFor({ deltaX: 0, deltaY: 1.5, deltaMode: 0, wheelDeltaY: -4 })).toBe('trackpad')
  })

  test('anything sideways is a trackpad', () => {
    expect(deviceFor({ ...notch, deltaX: 4 })).toBe('trackpad')
  })

  test('a browser that says nothing at all is taken for a trackpad', () => {
    expect(deviceFor({ deltaX: 0, deltaY: 7, deltaMode: 0, wheelDeltaY: undefined })).toBe(
      'trackpad',
    )
  })
})
