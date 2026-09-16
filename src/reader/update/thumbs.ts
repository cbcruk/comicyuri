/**
 * 페이지 격자를 update로 읽는 자리. 여닫기, 격자에서 고르기, 그리고 북마크 목록이
 * 여기 있다.
 *
 * 무엇을 몇 칸에 늘어놓을지 같은 순수한 계산은 `src/reader/thumbs.ts`에 있다.
 * 보여 줄 수 있는 썸네일을 뽑는 일도, 격자가 놓인 곳의 너비를 재는 일도 이제는
 * `src/app/thumbs/thumbs.tsx`와 page atom의 몫이라, 여기 남은 것은 격자가 열려
 * 있는지와 그 안에서 고른 것뿐이다.
 */

import { Array } from 'effect'

import { OutMessage } from '../message.ts'
import type { Model } from '../model.ts'
import { evo } from '../struct.ts'
import { goToPage } from './navigation.ts'
import type { UpdateReturn } from './navigation.ts'

/** 격자를 여닫는다. */
export const clickedToggleThumbs = (model: Model): UpdateReturn => ({
  model: evo(model, { isThumbsOpen: (open) => !open }),
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
export const selectedThumb = (model: Model, page: number): UpdateReturn =>
  goToPage(evo(model, { isThumbsOpen: () => false }), page)
