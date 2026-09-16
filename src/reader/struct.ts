/**
 * 구조체 하나를 필드별 갱신 함수로 고쳐 낸다. Foldkit의 `foldkit/struct`가 주던
 * `evo`를 대신하는 자리다.
 *
 * 의미는 그대로다. 적어 둔 필드만 그 함수가 돌려준 값으로 바뀌고, 나머지는 그대로
 * 실려 온다. 구조체에 없는 필드를 적으면 타입이 막는다 — 전개 연산자로 고칠 때
 * 오타가 조용히 새 필드를 만드는 일이 이 검사로 사라진다.
 */

import { Struct } from 'effect'

/** 필드마다 그 필드의 값을 받아 같은 타입을 돌려주는 함수. 적지 않은 필드는 그대로다. */
type EvolveTransform<O> = Partial<{
  [K in keyof O]: (a: O[K]) => O[K]
}>

/**
 * 구조체에 없는 키를 적었을 때 그 키의 이름을 담은 오류를 내는 타입.
 *
 * `Partial`만으로는 남는 키를 잡지 못한다. 없는 키는 그냥 무시되므로, 이 검사가
 * 없으면 `zom: () => 2`가 아무 일도 하지 않은 채 통과한다.
 */
type StrictKeys<O, T> =
  T extends Record<string, unknown>
    ? Exclude<keyof T, keyof O> extends never
      ? T
      : T & { [K in `Invalid key: ${Exclude<keyof T, keyof O> & string}`]: never }
    : never

/** 갱신 함수를 적용한 뒤의 구조체. */
type Evolved<O, T> = {
  [K in keyof O]: K extends keyof T ? (T[K] extends (a: never) => infer R ? R : O[K]) : O[K]
}

/**
 * 적어 둔 필드만 갱신 함수로 바꾼 새 구조체를 만든다.
 *
 * @example 한 필드만 고치기
 * ```ts
 * import { evo } from './struct.ts'
 *
 * const next = evo({ page: 0, zoom: 1 }, { page: (page) => page + 1 })
 * ```
 */
export const evo: <O, const T extends EvolveTransform<O>>(
  obj: O,
  t: StrictKeys<O, T>,
) => Evolved<O, T> = Struct.evolve
