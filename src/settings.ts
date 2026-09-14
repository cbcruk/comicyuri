/**
 * 숫자로 된 설정의 범위와, 그 안에서 한 걸음 옮기는 계산.
 *
 * 값을 그리는 쪽(패널)과 옮기는 쪽(update)이 같은 범위를 보아야 한다. 어긋나면
 * 막힌 것으로 그려진 버튼이 눌리거나, 눌리는 버튼이 막힌 것으로 그려진다.
 */

import { Number } from 'effect'

/** 넓은 페이지 판정 문턱을 한 번에 옮기는 폭. */
export const THRESHOLD_STEP = 0.02
/**
 * 문턱의 아래쪽 끝. 인쇄된 한 쪽(0.7 언저리)보다 한참 아래라, 여기까지 내리면
 * 거의 모든 페이지가 혼자 선다.
 */
export const THRESHOLD_MIN = 0.5
/** 정사각형. 여기까지 올리면 가로가 세로 이상인 페이지만 넓다. */
export const THRESHOLD_MAX = 1

/** 슬라이드쇼 간격을 한 번에 옮기는 폭(초). */
export const SLIDE_STEP = 1
/** 이보다 짧으면 페이지가 도착하기 전에 넘어간다. */
export const SLIDE_MIN = 2
/** 이보다 길면 슬라이드쇼라기보다 멈춰 있는 것에 가깝다. */
export const SLIDE_MAX = 30

/**
 * 문턱을 한 걸음 옮긴다. 범위 밖으로는 나가지 않는다.
 *
 * 0.02씩 더한 값이 `0.7400000001`이 되지 않도록 소수 둘째 자리에서 끊는다.
 */
export const nudgedThreshold = (threshold: number, by: number): number =>
  Math.round(
    Number.clamp(threshold + by, { minimum: THRESHOLD_MIN, maximum: THRESHOLD_MAX }) * 100,
  ) / 100

/** 슬라이드쇼 간격을 한 걸음 옮긴다. 범위 밖으로는 나가지 않는다. */
export const nudgedSlideSeconds = (seconds: number, by: number): number =>
  Number.clamp(Math.round(seconds + by), { minimum: SLIDE_MIN, maximum: SLIDE_MAX })
