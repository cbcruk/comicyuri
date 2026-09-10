/**
 * 휠 굴림이 페이지 안에서 무엇을 할 수 있는지 정하는 계산.
 *
 * 페이지가 어느 쪽으로 얼마나 더 갈 수 있는지는 CSS가 정한다 — 맞춤 모드와 두 장
 * 배치와 배율이 모두 걸린다. 그래서 그 거리는 여기서 셈하지 않고 휠 이벤트가 그때
 * 재어 온다. 여기 있는 것은 재어 온 숫자로 무엇을 할지 정하는 규칙뿐이다.
 */

import { Option, Schema } from 'effect'

import type { Point } from './gesture.ts'

/**
 * 페이지가 각 방향으로 더 갈 수 있는 거리(px). 화면 밖으로 나가 있는 몫이기도
 * 하다 — `up`이 30이면 페이지 위쪽 30px이 화면 위로 잘려 있다는 뜻이다.
 */
export const Room = Schema.Struct({
  up: Schema.Number,
  down: Schema.Number,
  left: Schema.Number,
  right: Schema.Number,
})

/** {@linkcode Room} 스키마의 디코딩된 값. */
export type Room = typeof Room.Type

/** 아무 데도 갈 곳이 없는 페이지. 화면에 통째로 들어가 있다. */
export const NO_ROOM: Room = { up: 0, down: 0, left: 0, right: 0 }

/**
 * 이만큼 남은 것은 끝에 닿은 것으로 친다. 소수점 픽셀에서 1px이 남아 끝에 닿지
 * 못하는 일이 흔하다.
 */
export const EDGE_SLACK = 2

/**
 * 한 번의 굴림이 끝났다고 보는 간격(밀리초).
 *
 * 트랙패드는 손가락을 뗀 뒤에도 관성으로 이벤트를 계속 흘린다. 그것을 새 굴림으로
 * 세면 끝에 닿는 순간 남은 관성이 페이지를 몇 장씩 넘긴다. 그래서 끝에서 넘어가는
 * 것은 언제나 새 굴림의 첫 이벤트뿐이다 — 한 번 멈췄다가 다시 굴려야 넘어간다.
 */
export const SCROLL_QUIET_MILLIS = 200

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value))

/**
 * 굴린 만큼 옮긴 자리. 남은 거리보다 더 가지는 않는다.
 *
 * 아래로 굴리면 페이지가 위로 올라가므로, 그 방향으로 남은 거리는 {@linkcode Room}의
 * `down`이다.
 */
export const pannedBy = (pan: Point, delta: Point, room: Room): Point => ({
  x: pan.x + clamp(-delta.x, -room.right, room.left),
  y: pan.y + clamp(-delta.y, -room.down, room.up),
})

/**
 * 이 굴림이 페이지를 넘기는지. 세로 방향으로 끝에 닿아 있을 때만이다.
 *
 * 가로로 굴리는 것은 넘기지 않는다. 옆으로 스와이프하는 것은 이미 넘김이고
 * (`R-243`), 마우스 휠에 가로 축은 없다.
 *
 * @returns 넘길 방향 — 뒤쪽이 `1`, 앞쪽이 `-1`. 넘길 자리가 아니면 없음이다.
 */
export const turnFromEdge = (delta: Point, room: Room): Option.Option<number> => {
  if (Math.abs(delta.y) <= Math.abs(delta.x)) return Option.none()
  if (delta.y > 0) return room.down <= EDGE_SLACK ? Option.some(1) : Option.none()
  if (delta.y < 0) return room.up <= EDGE_SLACK ? Option.some(-1) : Option.none()
  return Option.none()
}

/** 이 이벤트가 새 굴림의 첫 이벤트인지. 앞선 굴림의 관성이면 아니다. */
export const isNewFlick = (timeStamp: number, lastScrollAt: number): boolean =>
  timeStamp - lastScrollAt > SCROLL_QUIET_MILLIS
