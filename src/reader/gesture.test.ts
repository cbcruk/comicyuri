import { describe, expect, test } from 'vite-plus/test'

import {
  ORIGIN,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  panForZoom,
  swipeFrom,
  zoneAt,
  zoomAround,
} from './gesture.ts'

describe('zoom', () => {
  test('zoom is held between one and the maximum', () => {
    expect(clampZoom(0.2)).toBe(ZOOM_MIN)
    expect(clampZoom(99)).toBe(ZOOM_MAX)
    expect(clampZoom(2.5)).toBe(2.5)
  })

  test('what sits under the anchor stays under it', () => {
    const anchor = { x: 100, y: 40 }
    const pan = zoomAround(ORIGIN, 1, 2, anchor)

    // 기준점의 페이지 좌표는 확대해도 그대로다. 전에는 (anchor - 0) / 1,
    // 후에는 (anchor - pan) / 2.
    expect((anchor.x - pan.x) / 2).toBeCloseTo(anchor.x - ORIGIN.x)
    expect((anchor.y - pan.y) / 2).toBeCloseTo(anchor.y - ORIGIN.y)
  })

  test('an unzoomed page has nothing to pan', () => {
    expect(panForZoom({ x: 30, y: 10 }, ZOOM_MIN)).toStrictEqual(ORIGIN)
    expect(panForZoom({ x: 30, y: 10 }, 2)).toStrictEqual({ x: 30, y: 10 })
  })
})

describe('tap zones', () => {
  // 좌표는 한가운데에서 재므로 1/3 경계는 ±width/6에 있다.
  test('the outer thirds turn pages and the middle shows the chrome', () => {
    expect(zoneAt(-200, 600)).toBe('Left')
    expect(zoneAt(200, 600)).toBe('Right')
    expect(zoneAt(0, 600)).toBe('Middle')
    expect(zoneAt(-99, 600)).toBe('Middle')
  })
})

describe('swipes', () => {
  test('a short drag is not a swipe', () => {
    expect(swipeFrom({ x: 0, y: 0 }, { x: 20, y: 0 })).toBe('Middle')
  })

  test('dragging leftwards asks for the page on the right', () => {
    expect(swipeFrom({ x: 0, y: 0 }, { x: -80, y: 0 })).toBe('Right')
    expect(swipeFrom({ x: 0, y: 0 }, { x: 80, y: 0 })).toBe('Left')
  })
})
