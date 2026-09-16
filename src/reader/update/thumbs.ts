/**
 * 페이지 격자를 update로 읽는 자리. 여닫기, 스크롤, 폭 재기, 썸네일 받기, 격자에서
 * 고르기와 북마크 목록이 여기 있다.
 *
 * 무엇을 몇 칸에 늘어놓을지 같은 순수한 계산은 `src/page/reader/thumbs.ts`에 있다.
 * 보여 줄 수 있는 썸네일을 뽑는 일(`LoadThumbs`)은 이제 atom의 몫이라, 여기 남은
 * 것은 Model에 거는 쪽뿐이다.
 */

import { Array } from 'effect'

import { VirtualList } from '@foldkit/ui'

import { rowHeightFor } from '../../page/reader/thumbs.ts'
import { MeasureThumbsWidth } from '../command.ts'
import { OutMessage } from '../message.ts'
import type { Model, Panel } from '../model.ts'
import { evo } from '../struct.ts'
import { goToPage } from './navigation.ts'
import type { UpdateReturn } from './navigation.ts'

/** 격자를 여닫는다. */
export const clickedToggleThumbs = (model: Model): UpdateReturn =>
  model.isThumbsOpen
    ? {
        model: evo(model, {
          isThumbsOpen: () => false,
          // 이제 아무도 그것들을 보여 주지 않으므로, 그 출처인 페이지들은
          // 놓아 주어도 된다.
          thumbPanels: () => [],
        }),
      }
    : {
        // 폭을 묻기만 한다. 몇 칸이 서는지가 무엇을 뽑을지도 정하므로, 뽑는 일은
        // 잰 답이 돌아온 뒤에 격자가 한다.
        model: evo(model, { isThumbsOpen: () => true }),
        commands: [MeasureThumbsWidth()],
      }

/**
 * 격자의 가상 리스트가 움직였다.
 *
 * 리스트가 스스로 내는 Command는 지고 오지 않는다. 그것은 처음 잴 때 남아 있던
 * 스크롤 자리를 되돌리는 하나뿐인데, 격자는 언제나 맨 위에서 열린다.
 */
export const gotThumbsMessage = (model: Model, message: VirtualList.Message): UpdateReturn => ({
  model: evo(model, { thumbs: () => VirtualList.update(model.thumbs, message).model }),
})

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
 */
export const measuredThumbsWidth = (model: Model, width: number): UpdateReturn => ({
  model: evo(model, {
    thumbsWidth: () => width,
    thumbs: (thumbs) => evo(thumbs, { rowHeightPx: () => rowHeightFor(width) }),
  }),
})

/** 북마크를 목록으로 보는 것과 책 전체를 보는 것 사이를 오간다. */
export const clickedToggleBookmarksOnly = (model: Model): UpdateReturn => ({
  model: evo(model, { showsBookmarksOnly: (only) => !only }),
})

/**
 * 목록에서 북마크 하나를 지운다. 툴바의 ★와 달리 지금 보고 있는 페이지가 아니라
 * 목록이 가리키는 페이지의 것이고, 썸네일을 누를 때와 달리 어디로도 가지 않는다.
 */
export const clickedRemoveBookmark = (model: Model, page: number): UpdateReturn => {
  const bookmarks = Array.filter(model.bookmarks, (bookmark) => bookmark !== page)

  return {
    model: evo(model, { bookmarks: () => bookmarks }),
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
