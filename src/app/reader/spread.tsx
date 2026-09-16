/**
 * 화면에 걸린 스프레드를 쥐는 자리(`R-207`, `R-215`).
 *
 * Foldkit 리더는 `SpreadState`와 `OnScreen`을 Model에 담고 update가 그것을 옮겼다.
 * 스프레드를 부르는 일이 atom으로 넘어갔으므로 이제 그 두 가지를 화면이 쥔다 — 무엇을
 * 보여 줄지는 Model이, 그것이 도착했는지는 atom이 말하고, 둘을 맞붙이는 것이 여기다.
 *
 * 붙잡는 이유는 하나다. 넘긴 순간 Model은 이미 다음 페이지의 `entry`·`half`·배율·이동을
 * 쥐고 있어서, 그것으로 남아 있는 페이지를 그리면 끝에 붙거나 반쪽이 바뀌거나 확대가
 * 풀려 한 번 튄다. 그래서 그릴 수 있었던 순간의 값을 여섯 개 모두 함께 찍어 둔다.
 */

import { Cause, Option } from 'effect'
import { Atom, AsyncResult } from 'effect/unstable/reactivity'
import { useAtomMount, useAtomValue } from '@effect/atom-react'
import { useEffect, useRef } from 'react'

import type { PageAtoms, SpreadPanel } from '../../atoms/pages.ts'
import { describe } from '../../errors.ts'
import type { AppError } from '../../errors.ts'
import type { Point } from '../../page/reader/gesture.ts'
import type { Half } from '../../page/reader/half.ts'
import type { Model, PageEntry } from '../../reader/model.ts'

/**
 * 화면에 걸린 스프레드와, 그것을 그릴 때 쓴 값들.
 *
 * Foldkit `OnScreen`의 여섯 필드를 그대로 지고 있다. 다음 스프레드가 설 때까지 남아 있는
 * 페이지는 이 값들로 그려진다(`R-207`).
 */
export type OnScreen = Readonly<{
  page: number
  /** 그 스프레드의 페이지들. 놓지 않고 쥐어야 할 대상이기도 하다. */
  pages: ReadonlyArray<number>
  panels: ReadonlyArray<SpreadPanel>
  entry: PageEntry
  half: Half
  zoom: number
  pan: Point
}>

/**
 * 아직 걸 스프레드가 없는 동안 대신 구독하는 자리. 책이 열리는 중일 때다.
 *
 * 빈 페이지 목록으로 스프레드 atom을 부르지 않으려고 둔다. atom의 키는 페이지 번호를
 * 쉼표로 이어 붙인 문자열이라, 빈 목록은 0번 페이지를 뜻하는 키와 구별되지 않는다 —
 * 그대로 부르면 읽던 자리로 여는 책이 첫 장까지 헛되이 뽑는다.
 */
const noSpread: Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<SpreadPanel>, AppError>> =
  Atom.make(AsyncResult.initial<ReadonlyArray<SpreadPanel>, AppError>())

/** 스프레드를 부르다 실패한 까닭을 한 줄로. */
const failureText = (cause: Cause.Cause<AppError>): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => 'This page could not be shown',
    onSome: describe,
  })

/** {@linkcode useShownSpread}가 돌려주는 것. */
export type ShownSpread = Readonly<{
  /** 화면에 걸린 스프레드. 아직 아무것도 그릴 수 없으면 없음이다. */
  maybeShown: Option.Option<OnScreen>
  /**
   * 지금 스프레드가 그릴 수 있게 되었는지.
   *
   * 거짓인 동안 화면에 남아 있는 것은 이전 스프레드이므로, 화면에서 잰 거리는 지금
   * 페이지에 대한 사실이 아니다. 굴림에 `NO_ROOM`을 실어 보낼지가 이것으로 갈린다
   * (`R-207`).
   */
  isReady: boolean
  /** 부르다 실패했을 때의 문구. */
  maybeFailure: Option.Option<string>
}>

/**
 * 지금 스프레드를 구독하고, 다음 것이 설 때까지 이전 것을 붙잡는다(`R-207`).
 *
 * @param here 지금 걸어야 할 스프레드의 페이지들. 책이 열리는 중이면 비어 있다.
 */
export const useShownSpread = (
  pages: PageAtoms,
  model: Model,
  here: ReadonlyArray<number>,
): ShownSpread => {
  const current = useAtomValue(here.length === 0 ? noSpread : pages.spread(model.bookId, here))

  const live: OnScreen | null = AsyncResult.isSuccess(current)
    ? {
        page: model.page,
        pages: here,
        panels: current.value,
        entry: model.entry,
        half: model.half,
        zoom: model.zoom,
        pan: model.pan,
      }
    : null

  // 마지막으로 그릴 수 있었던 스프레드. 그리는 동안 배율과 이동이 바뀌면 그것까지
  // 따라 찍히므로, 붙잡는 값은 언제나 화면이 실제로 그리고 있던 값이다.
  const held = useRef<OnScreen | null>(null)
  useEffect(() => {
    if (live !== null) held.current = live
  })

  return {
    maybeShown: Option.fromNullOr(live ?? held.current),
    isReady: live !== null,
    maybeFailure: AsyncResult.isFailure(current)
      ? Option.some(failureText(current.cause))
      : Option.none(),
  }
}

/**
 * 스프레드 하나를 구독만 한다. 그리지는 않고, 그 페이지들의 URL이 놓이지 않게 쥔다.
 *
 * 이웃을 미리 읽어 두는 것(`R-215`)과 남아 있는 페이지를 놓지 않는 것(`R-207`)이 둘 다
 * 이 한 줄이다 — atom을 원하는 곳이 하나라도 있으면 레지스트리가 치우지 않는다.
 */
export const SpreadHold = ({
  pages,
  bookId,
  spread,
}: Readonly<{ pages: PageAtoms; bookId: string; spread: ReadonlyArray<number> }>) => {
  useAtomMount(pages.spread(bookId, spread))
  return null
}
