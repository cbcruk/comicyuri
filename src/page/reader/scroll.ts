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
 * 굴림이 어디서 왔는지. 끝에서 페이지를 넘기는 것은 마우스 휠만 한다.
 *
 * 트랙패드는 손가락을 뗀 뒤에도 관성으로 이벤트를 계속 흘린다. 그 흐름 속에서
 * "한 번 더 굴렸다"를 가려내려면 굴림이 멎기를 기다려야 하고, 그러면 넘기려고 몇
 * 번씩 밀어야 한다. 마우스 휠은 한 칸이 한 이벤트라 그런 판정이 필요 없다.
 */
export const ScrollDevice = Schema.Literals(['wheel', 'trackpad'])

/** {@linkcode ScrollDevice} 스키마의 디코딩된 값. */
export type ScrollDevice = typeof ScrollDevice.Type

/** 어느 장치에서 온 굴림인지 가리는 데 쓰는, 휠 이벤트가 지고 오는 값들. */
export type WheelReading = Readonly<{
  deltaX: number
  deltaY: number
  /** 0이면 픽셀 단위. 줄이나 페이지 단위로 굴림을 보내는 것은 마우스뿐이다. */
  deltaMode: number
  /**
   * 표준이 아닌 옛 값. 크로미움과 사파리는 마우스 휠에 120의 배수를 싣고,
   * 트랙패드에는 손가락이 움직인 만큼을 싣는다. 파이어폭스는 아예 주지 않는다.
   */
  wheelDeltaY: number | undefined
}>

/**
 * 이 굴림이 마우스 휠에서 온 것인지 트랙패드에서 온 것인지.
 *
 * 브라우저는 둘을 같은 이벤트로 보내고 어느 쪽인지 말해 주지 않는다. 그래서 이것은
 * 판정이 아니라 짐작이다 — 트랙패드를 아주 정확히 40px씩 밀면 휠로 셀 수 있다.
 * 틀렸을 때 일어나는 일이 페이지 한 장 넘어가는 것뿐이라 이 정도로 둔다.
 */
export const deviceFor = (wheel: WheelReading): ScrollDevice => {
  if (wheel.deltaMode !== 0) return 'wheel'
  if (wheel.deltaX !== 0) return 'trackpad'
  if (wheel.wheelDeltaY === undefined || wheel.wheelDeltaY === 0) return 'trackpad'
  return Math.abs(wheel.wheelDeltaY) % 120 === 0 ? 'wheel' : 'trackpad'
}

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
 * 이것을 부를지 말지는 {@linkcode ScrollDevice}가 정한다 — 트랙패드는 끝에 닿으면
 * 거기서 멈춘다.
 *
 * @returns 넘길 방향 — 뒤쪽이 `1`, 앞쪽이 `-1`. 넘길 자리가 아니면 없음이다.
 */
export const turnFromEdge = (delta: Point, room: Room): Option.Option<number> => {
  if (Math.abs(delta.y) <= Math.abs(delta.x)) return Option.none()
  if (delta.y > 0) return room.down <= EDGE_SLACK ? Option.some(1) : Option.none()
  if (delta.y < 0) return room.up <= EDGE_SLACK ? Option.some(-1) : Option.none()
  return Option.none()
}
