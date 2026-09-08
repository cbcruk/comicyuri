import { Schema } from 'effect'

/**
 * 리더 자신의 좌표계에서의 위치.
 *
 * 포인터 위치는 뷰포트 한가운데를 기준으로 재어 들어온다. `pan`이 쓰는 원점과
 * 같으므로, 무엇이 페이지의 어디에 놓였는지 몰라도 기준점과 오프셋을 그냥 더할
 * 수 있다.
 */
export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
/** {@linkcode Point} 스키마의 디코딩된 값. */
export type Point = typeof Point.Type

/** 오프셋이 전혀 없는 자리. 줌이 돌아올 때 pan도 여기로 돌아온다. */
export const ORIGIN: Point = { x: 0, y: 0 }

/** 페이지가 맞춰진 크기. 이 배율에서는 옮길 것이 없다. */
export const ZOOM_MIN = 1
/** 핀치와 휠과 툴바가 들어갈 수 있는 끝. */
export const ZOOM_MAX = 6

/** 여기까지의 움직임은 드래그가 아니라 탭으로 친다. */
export const TAP_SLOP = 10

/** 드래그가 페이지 넘김이 되기까지 옆으로 가야 하는 거리. */
export const SWIPE_MIN = 45

/**
 * 이보다 가까운 두 포인터는 핀치가 아니다. 핀치는 둘 사이 간격이 늘어난 비율만큼
 * 확대하므로, 0에 가까운 간격에서 시작하면 그 비율에 끝이 없어진다 — 그리고
 * 놓음을 받지 못해 남아 있던 포인터가 정확히 거기에 앉는다.
 */
export const MIN_PINCH_SPAN = 24

/** 이보다 짧은 간격의 두 탭은 더블 탭이다. */
export const DOUBLE_TAP_MILLIS = 300

/** 더블 탭이 확대하는 배율, 그리고 한 번 더 탭하면 벗어나는 배율. */
export const DOUBLE_TAP_ZOOM = 2.5

/** 배율을 {@linkcode ZOOM_MIN}과 {@linkcode ZOOM_MAX} 사이에 붙잡아 둔다. */
export const clampZoom = (zoom: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))

/** 두 점 사이의 거리. 두 포인터라면 핀치가 배율로 삼는 간격이다. */
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** 두 점의 한가운데. 핀치는 이 점을 중심으로 확대한다. */
export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

/** 포인터가 움직인 만큼 pan을 옮긴다. */
export const translate = (pan: Point, from: Point, to: Point): Point => ({
  x: pan.x + (to.x - from.x),
  y: pan.y + (to.y - from.y),
})

/**
 * `anchor` 아래 있던 것이 계속 그 아래 있도록 확대한다. 이것이 없으면 페이지가
 * 커지면서 손가락에서 미끄러진다.
 */
export const zoomAround = (pan: Point, zoom: number, nextZoom: number, anchor: Point): Point => {
  const scale = nextZoom / zoom
  return {
    x: anchor.x - (anchor.x - pan.x) * scale,
    y: anchor.y - (anchor.y - pan.y) * scale,
  }
}

/** 배율이 1이면 옮길 것이 없으므로 오프셋은 원점으로 돌아간다. */
export const panForZoom = (pan: Point, zoom: number): Point => (zoom === ZOOM_MIN ? ORIGIN : pan)

/** 제스처가 화면의 어느 부분에 속하는지. */
export const Side = Schema.Literals(['Left', 'Middle', 'Right'])
/** {@linkcode Side} 스키마의 디코딩된 값. */
export type Side = typeof Side.Type

/** 탭 존. 바깥쪽 1/3은 페이지를 넘기고, 가운데는 툴바를 보인다. */
export const zoneAt = (x: number, width: number): Side => {
  if (x < -width / 6) return 'Left'
  if (x > width / 6) return 'Right'
  return 'Middle'
}

/**
 * 왼쪽으로 끄는 것은 오른쪽에 있는 것을 끌어오는 것이므로, 요청된 페이지는 그
 * 쪽 페이지다.
 */
export const swipeFrom = (origin: Point, release: Point): Side => {
  const travel = release.x - origin.x
  if (Math.abs(travel) < SWIPE_MIN) return 'Middle'
  return travel > 0 ? 'Left' : 'Right'
}
