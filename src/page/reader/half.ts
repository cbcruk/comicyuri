/** 넓은 페이지를 반씩 읽을 때의 계산. */

import { Schema } from 'effect'

import type { Settings } from '../../types.ts'

/**
 * 나뉜 페이지에서 지금 보고 있는 반쪽. 읽는 순서대로 붙인 이름이라, 어느 쪽이
 * 화면의 왼쪽인지는 읽는 방향이 정한다.
 */
export const Half = Schema.Literals(['first', 'second'])

/** {@linkcode Half} 스키마의 디코딩된 값. */
export type Half = typeof Half.Type

/**
 * 이 걸음이 페이지를 넘기지 않고 반쪽만 옮기는지. 앞으로 가는 걸음은 앞쪽 반에서,
 * 뒤로 가는 걸음은 뒤쪽 반에서 아직 갈 곳이 남아 있다.
 */
export const staysOnPage = (half: Half, by: number): boolean =>
  by > 0 ? half === 'first' : half === 'second'

/** 그 걸음 뒤에 볼 반쪽. */
export const halfAfterStep = (by: number): Half => (by > 0 ? 'second' : 'first')

/**
 * 이 반쪽이 화면의 어느 쪽인지. 오른쪽에서 왼쪽으로 읽으면 오른쪽 반을 먼저
 * 본다 — 만화를 그렇게 읽는다.
 */
export const sideOf = (half: Half, direction: Settings['direction']): 'left' | 'right' =>
  (direction === 'rtl') === (half === 'first') ? 'right' : 'left'
