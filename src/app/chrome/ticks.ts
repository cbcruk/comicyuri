/** 슬라이더 트랙 위에 찍는 페이지 눈금(`R-267`). */

/** 눈금이 이보다 많아지면 간격을 넓힌다. 트랙이 선으로 뒤덮이지 않을 만큼이다. */
const MAX_TICKS = 20

/** 눈금 간격의 후보. 사람이 세기 쉬운 수만 쓴다. */
const NICE_STEPS = [1, 2, 5] as const

/**
 * 눈금 사이가 몇 페이지인지. 1·2·5·10·20·50… 가운데 눈금이 {@linkcode MAX_TICKS}를
 * 넘지 않는 가장 작은 값이다.
 */
export const tickStep = (pageCount: number): number => {
  for (let scale = 1; ; scale *= 10) {
    for (const nice of NICE_STEPS) {
      const step = nice * scale
      if (Math.ceil(pageCount / step) <= MAX_TICKS) return step
    }
  }
}

/**
 * 눈금을 찍을 슬라이더 값들. `0`부터 센 페이지다.
 *
 * 첫 페이지와, 1부터 센 번호가 간격의 배수인 페이지에 찍는다 — 간격이 10이면 1·10·20·30쪽이다.
 * 간격이 1이면 모든 페이지다.
 */
export const pageTicks = (pageCount: number): ReadonlyArray<number> => {
  if (pageCount <= 0) return []
  const step = tickStep(pageCount)
  const ticks = [0]
  for (let number = step; number <= pageCount; number += step) {
    if (number > 1) ticks.push(number - 1)
  }
  return ticks
}
