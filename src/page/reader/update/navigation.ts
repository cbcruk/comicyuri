/**
 * 리더가 페이지를 옮기는 핵심. 제스처와 격자, 그리고 나머지 update가 모두 이 길로
 * 페이지를 바꾼다.
 *
 * `update.ts`와 그것이 나눠 둔 모듈들이 함께 기대는 자리라서 따로 둔다. 여기 두지
 * 않으면 나눠 둔 모듈이 `update.ts`를 되돌아 불러 순환이 생긴다.
 */

import { Array, Match, Number, Option } from 'effect'
import type { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import { LoadSpread, PreloadNeighbours } from '../command.ts'
import { ORIGIN, ZOOM_MIN } from '../gesture.ts'
import { halfAfterStep, staysOnPage } from '../half.ts'
import type { Message } from '../message.ts'
import { OutMessage } from '../message.ts'
import { OpenState, SpreadState } from '../model.ts'
import type { Model, PageEntry } from '../model.ts'
import type { OpenBookService } from '../resource.ts'
import {
  indexOfPage,
  neighbourPages,
  pageAfterStep,
  pageAtEdge,
  pagesAt,
  pagesToKeep,
  splitRatio,
  spreadsFor,
} from '../spread.ts'
import { loadedPages } from '../thumbs.ts'

/** 리더의 update가 돌려주는 것. 위로 올려 보낼 OutMessage가 함께 올 수 있다. */
export type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, OpenBookService>

/**
 * 위치나 배치가 바뀐 뒤에 리더가 해야 하는 모든 일. 화면에 걸릴 이미지를 요청하고,
 * 이웃을 데우고, 격자가 쥐지 않은 나머지를 놓아 주고, 진행 상태를 위로 알린다.
 */
export const showPage = (model: Model, page: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model: evo(model, { page: () => page }) }),
    Failed: () => ({ model: evo(model, { page: () => page }) }),
    Ready: ({ pageCount, ratios }) => {
      const spreads = spreadsFor({ pageCount, ratios, marks: model.marks }, model.settings)
      const index = indexOfPage(spreads, page)
      const pages = pagesAt(spreads, index)

      return {
        model: evo(model, {
          page: () => page,
          spread: () => SpreadState.Loading(),
        }),
        commands: [
          LoadSpread({ page, pages }),
          PreloadNeighbours({
            warm: neighbourPages(spreads, index),
            // 화면의 썸네일이 바로 이 페이지들의 URL을 쥐고 있으므로, 놓아
            // 주면 격자가 빈다.
            keep: Array.appendAll(pagesToKeep(spreads, index), loadedPages(model.thumbPanels)),
          }),
        ],
        outMessage: OutMessage.UpdatedProgress({
          bookId: model.bookId,
          page,
          bookmarks: model.bookmarks,
          marks: model.marks,
          rotation: model.rotation,
        }),
      }
    },
  })

/**
 * 다른 페이지로 옮기면 처음부터 시작한다. pan 오프셋은 떠나는 페이지를 기준으로
 * 잰 값이라 그대로 가져가면 다음 페이지의 엉뚱한 곳에 앉는다 — 이것이 이 뷰어가
 * 대신한 예전 뷰어가 넘길 때와 건너뛸 때마다 초기화한 이유다. 설정을 바꾼 뒤 같은
 * 페이지를 다시 보여 줄 때는 배율을 지킨다.
 *
 * 뒤로 넘겨 온 페이지는 끝에서 시작한다. 슬라이더나 격자로 건너뛴 것은 넘긴 것이
 * 아니므로 언제나 처음이다.
 */
export const goToPage = (model: Model, page: number, entry: PageEntry = 'start'): UpdateReturn =>
  showPage(
    evo(model, {
      zoom: () => ZOOM_MIN,
      pan: () => ORIGIN,
      entry: () => entry,
      // 나뉜 페이지에서 "끝"은 뒤쪽 반이다.
      half: () => (entry === 'end' ? 'second' : 'first'),
    }),
    page,
  )

/** 이 걸음이 페이지의 어느 쪽으로 들어서는지. 뒤로 가는 걸음만 끝에서 시작한다. */
const entryFor = (by: number): PageEntry => (by < 0 ? 'end' : 'start')

/**
 * 책의 끝을 넘어서 넘기려 할 때. 원본 뷰어에서 다음 권을 여는 동작이 바로 이
 * 자리였다 — 끝을 넘기는 것이 곧 다음 권을 여는 것이라, 따로 만들면 두 기능이
 * 겹친다.
 *
 * 이웃한 책은 리더가 열 수 없다. 책장 순서를 아는 것은 애플리케이션이므로
 * 올려 보내고, 이웃이 없으면 그쪽에서 아무 일도 일어나지 않는다.
 */
const beyondBookEnd = (
  model: Model,
  spreads: ReadonlyArray<ReadonlyArray<number>>,
  by: number,
): UpdateReturn =>
  Match.value(model.settings.atBookEnd).pipe(
    Match.when('stop', (): UpdateReturn => ({ model })),
    Match.when('wrap', (): UpdateReturn =>
      Option.match(pageAtEdge(spreads, by), {
        onNone: () => ({ model }),
        onSome: (page) => goToPage(model, page, entryFor(by)),
      }),
    ),
    Match.when('next', (): UpdateReturn => ({
      model,
      outMessage: OutMessage.RequestedNeighbourBook({ bookId: model.bookId, step: by }),
    })),
    Match.exhaustive,
  )

/**
 * 정해 둔 장수만큼 건너뛴다. 책의 양 끝에서 멈춘다(`R-2A5`) — 책을 벗어나는 것은
 * 넘김의 일이지(`R-212`) 건너뛰기의 일이 아니다.
 */
export const skip = (model: Model, pages: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model }),
    Failed: () => ({ model }),
    Ready: ({ pageCount }) => {
      const page = Number.clamp(model.page + pages, { minimum: 0, maximum: pageCount - 1 })
      return page === model.page ? { model } : goToPage(model, page)
    },
  })

/**
 * 읽는 순서로 한 걸음 옮긴다. 앞으로면 `1`, 뒤로면 `-1`이다.
 *
 * 반씩 읽는 페이지에 반쪽이 남아 있으면 그쪽이 먼저고, 책 끝을 넘으면
 * `atBookEnd`가 정한다.
 */
export const step = (model: Model, by: number): UpdateReturn =>
  OpenState.match(model.openState, {
    Opening: () => ({ model }),
    Failed: () => ({ model }),
    Ready: ({ pageCount, ratios }) => {
      const layout = { pageCount, ratios, marks: model.marks }
      const spreads = spreadsFor(layout, model.settings)
      const here = pagesAt(spreads, indexOfPage(spreads, model.page))

      // 나뉜 페이지에 아직 반쪽이 남아 있으면, 페이지를 넘기기 전에 그쪽부터 본다.
      // 같은 이미지라서 새로 불러올 것이 없다.
      if (Option.isSome(splitRatio(layout, model.settings, here)) && staysOnPage(model.half, by)) {
        return {
          model: evo(model, {
            half: () => halfAfterStep(by),
            zoom: () => ZOOM_MIN,
            pan: () => ORIGIN,
          }),
        }
      }

      return Option.match(pageAfterStep(spreads, model.page, by), {
        onNone: () => beyondBookEnd(model, spreads, by),
        onSome: (page) => goToPage(model, page, entryFor(by)),
      })
    },
  })
