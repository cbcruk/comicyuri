/**
 * 페이지 격자를 update로 읽는 자리. 여닫기, 스크롤, 폭 재기, 썸네일 채우기, 격자에서
 * 고르기와 북마크 목록이 여기 있다.
 *
 * 무엇을 몇 칸에 늘어놓을지 같은 순수한 계산은 `../thumbs.ts`에 있고, 여기는 그것을
 * Model과 Command에 거는 쪽이다.
 */

import { Array, Option } from 'effect'
import { Update } from 'foldkit'
import { evo } from 'foldkit/struct'

import { VirtualList } from '@foldkit/ui'

import { LoadThumbs, MeasureThumbsWidth } from '../command.ts'
import { Message, OutMessage } from '../message.ts'
import { OpenState } from '../model.ts'
import type { Model, Panel } from '../model.ts'
import { missingFrom, pagesInView, perRowFor, rowHeightFor, shownPages } from '../thumbs.ts'
import { goToPage } from './navigation.ts'
import type { UpdateReturn } from './navigation.ts'

/** 격자가 보여 줄 수 있으면서 아직 뽑지 않은 것을 요청한다. */
const fillThumbs = (model: Model): UpdateReturn => {
  const pageCount = OpenState.match(model.openState, {
    Opening: () => 0,
    Failed: () => 0,
    Ready: ({ pageCount }) => pageCount,
  })

  const pages = shownPages(pageCount, model.bookmarks, model.showsBookmarksOnly)
  const missing = missingFrom(
    model.thumbPanels,
    pagesInView(model.thumbs, pages, perRowFor(model.thumbsWidth)),
  )

  return Array.match(missing, {
    onEmpty: () => ({ model }),
    onNonEmpty: (pages) => ({ model, commands: [LoadThumbs({ pages })] }),
  })
}

const foldThumbs = Update.foldChild({
  update: VirtualList.update,
  read: (model: Model) => Option.some(model.thumbs),
  write: (model, nextThumbs) => evo(model, { thumbs: () => nextThumbs }),
  toParentMessage: (message) => Message.GotThumbsMessage({ message }),
})

/** 격자를 여닫는다. */
export const clickedToggleThumbs = (model: Model): UpdateReturn =>
  model.isThumbsOpen
    ? {
        model: evo(model, {
          isThumbsOpen: () => false,
          // 이제 아무도 그것들을 보여 주지 않으므로, 그 출처인 페이지들은
          // 다음 넘김에 놓아 주어도 된다.
          thumbPanels: () => [],
        }),
      }
    : {
        // 폭을 묻기만 하고 뽑지는 않는다. 몇 칸이 서는지가 무엇을 뽑을지도
        // 정하므로, 여기서 뽑으면 기본값으로 한 번 뽑았다가 잰 값으로 다시
        // 뽑게 된다. 채우는 일은 잰 답이 돌아올 때 한 번에 한다.
        model: evo(model, { isThumbsOpen: () => true }),
        commands: [MeasureThumbsWidth()],
      }

/** 격자의 가상 리스트가 움직였다. 새로 창에 들어온 페이지를 채운다. */
export const gotThumbsMessage = (model: Model, message: VirtualList.Message): UpdateReturn => {
  const scrolled = foldThumbs(model, message)
  const filled = fillThumbs(scrolled.model)

  return {
    model: filled.model,
    commands: Array.appendAll(scrolled.commands ?? [], filled.commands ?? []),
  }
}

/** 뽑아 달라던 썸네일이 도착했다. */
export const completedLoadThumbs = (model: Model, panels: ReadonlyArray<Panel>): UpdateReturn => ({
  model: evo(model, {
    thumbPanels: (existing) => Array.appendAll(existing, panels),
  }),
})

/**
 * 격자의 폭을 쟀다.
 *
 * 폭이 바뀌면 칸의 수도, 칸의 너비도, 행의 높이도 바뀐다. 가상 리스트는 행을
 * 자기가 쥔 높이로 셈하므로 그쪽에도 새 값을 먹인다 — 그러지 않으면 그려진
 * 행과 리스트가 잡은 자리가 어긋난다.
 *
 * 새로 드러난 자리를 채워야 하므로 다시 뽑는다.
 */
export const measuredThumbsWidth = (model: Model, width: number): UpdateReturn =>
  fillThumbs(
    evo(model, {
      thumbsWidth: () => width,
      thumbs: (thumbs) => evo(thumbs, { rowHeightPx: () => rowHeightFor(width) }),
    }),
  )

/** 북마크를 목록으로 보는 것과 책 전체를 보는 것 사이를 오간다. */
export const clickedToggleBookmarksOnly = (model: Model): UpdateReturn =>
  fillThumbs(evo(model, { showsBookmarksOnly: (only) => !only }))

/**
 * 목록에서 북마크 하나를 지운다. 툴바의 ★와 달리 지금 보고 있는 페이지가 아니라
 * 목록이 가리키는 페이지의 것이고, 썸네일을 누를 때와 달리 어디로도 가지 않는다.
 *
 * 지운 자리만큼 목록이 줄어드니 격자를 다시 채운다 — 남은 것들이 앞으로
 * 당겨져서, 창에 새로 들어온 페이지가 생긴다.
 */
export const clickedRemoveBookmark = (model: Model, page: number): UpdateReturn => {
  const bookmarks = Array.filter(model.bookmarks, (bookmark) => bookmark !== page)
  const filled = fillThumbs(evo(model, { bookmarks: () => bookmarks }))

  return {
    ...filled,
    outMessage: OutMessage.UpdatedProgress({
      bookId: model.bookId,
      page: model.page,
      bookmarks,
      marks: model.marks,
      rotation: model.rotation,
    }),
  }
}

/** 격자에서 페이지를 골랐다. 격자를 닫고 그 페이지로 간다. */
export const selectedThumb = (model: Model, page: number): UpdateReturn => {
  const jumped = goToPage(evo(model, { isThumbsOpen: () => false }), page)
  return {
    ...jumped,
    model: evo(jumped.model, { thumbPanels: () => [] }),
  }
}
