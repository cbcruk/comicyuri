/** 북마크 사이를 오가는 계산. 목록은 언제나 페이지 순서로 정렬되어 있다. */

import { Array, Option } from 'effect'

/**
 * 지금 자리에서 한 걸음 떨어진 북마크. 앞으로 가려면 `1`, 뒤로 가려면 `-1`이다.
 *
 * 읽는 방향과는 무관하다. 여기서 "다음"은 책의 뒤쪽이고, 북마크 목록의 순서도
 * 그렇다.
 *
 * @returns 그 북마크의 페이지. 그쪽에 더 남은 북마크가 없으면 없음이다.
 */
export const bookmarkFrom = (
  bookmarks: ReadonlyArray<number>,
  page: number,
  step: number,
): Option.Option<number> =>
  step > 0
    ? Array.findFirst(bookmarks, (bookmark) => bookmark > page)
    : Array.findLast(bookmarks, (bookmark) => bookmark < page)
