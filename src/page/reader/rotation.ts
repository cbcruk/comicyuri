/** 페이지를 세우는 각도에 대한 계산. */

import type { Rotation } from '../../types.ts'

/** 시계 방향으로 한 번 더 돈 각도. 한 바퀴를 채우면 처음으로 돌아온다. */
export const rotatedRight = (rotation: Rotation): Rotation =>
  rotation === 0 ? 90 : rotation === 90 ? 180 : rotation === 180 ? 270 : 0

/**
 * 이 각도가 가로와 세로를 맞바꾸는지.
 *
 * 세워 둔 페이지가 화면에 맞으려면 그것을 담는 상자도 함께 누워야 한다. 90도나
 * 270도로 돌린 상자는 화면의 높이만큼 넓고 화면의 너비만큼 높다.
 */
export const swapsSides = (rotation: Rotation): boolean => rotation === 90 || rotation === 270
