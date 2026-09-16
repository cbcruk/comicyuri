/**
 * update가 남기는 요청. Foldkit의 `Command.define`이 효과까지 품고 있던 것을,
 * 무엇을 해 달라는 말만 남은 값으로 옮긴 자리다.
 *
 * update는 순수한 함수라 아무것도 실행하지 않는다. 이 값들을 받아 브라우저에 대고
 * 실제로 부르는 것은 화면 쪽이고, 그 답은 다시 Message로 돌아온다.
 *
 * 페이지와 썸네일을 부르던 `LoadSpread`·`PreloadNeighbours`·`LoadThumbs`는 여기
 * 없다. 그 일은 `src/atoms/pages.ts`의 atom이 맡는다.
 */

import { Data } from 'effect'

/** 리더가 바깥에 부탁하는 일. */
export type Command = Data.TaggedEnum<{
  MeasureThumbsWidth: {}
  ToggleFullscreen: { readonly wantFullscreen: boolean }
}>

const command = Data.taggedEnum<Command>()

/**
 * 격자가 놓인 곳의 너비를 재 달라는 부탁.
 *
 * 격자는 `inset-0`이라 그 너비가 곧 창의 너비다. 가상 리스트는 높이만 재어 주므로
 * 너비는 이쪽에서 묻는다. 답은 `MeasuredThumbsWidth`로 돌아온다.
 */
export const MeasureThumbsWidth = command.MeasureThumbsWidth

/**
 * 전체화면에 들어가거나 나가 달라는 부탁.
 *
 * Fullscreen API는 브라우저가 거절하면 reject 되는 promise다. 상태가 바뀌면
 * document가 `fullscreenchange`로 알리고, 거절되면 아무것도 바뀌지 않는다. 그래서
 * 이 Command는 묻기만 하면 된다.
 */
export const ToggleFullscreen = command.ToggleFullscreen
