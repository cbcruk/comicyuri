/**
 * 책마다 남는 것 — 읽던 자리, 북마크, 손으로 고친 묶기, 세운 각도(`P-302`).
 *
 * 빠르게 넘기면 저장이 잇달아 들어온다. Foldkit은 그때 `SaveProgress` Command를 한
 * 번씩 냈고, 그 Command는 레코드를 읽어 네 가지만 갈아 끼운 뒤 다시 썼다 — 묶거나
 * 미루지 않았고, 그래서 이 책의 설정을 쓰는 다른 Command와 서로를 지우지 않았다.
 *
 * 여기서 지키는 것도 같고, 한 가지가 더 있다. 읽고-고쳐-쓰기가 동기 한 덩어리라
 * 두 저장이 서로의 중간 상태를 볼 수 없다. 그래서 들어온 저장은 모두 그대로 실리고,
 * 마지막에 들어온 것이 저장소에 남으며, 마지막 한 번이 사라지는 일이 없다. 미루는
 * 대신 매번 쓰는 값을 치르는 것인데, `localStorage` 쓰기 하나는 페이지 한 장을 푸는
 * 일에 비하면 없는 것이나 마찬가지다.
 */

import { Effect, Option } from 'effect'
import { Atom } from 'effect/unstable/reactivity'

import { loadProgress, saveProgress as writeProgress } from '../../io/storage.ts'
import type { BookProgress, PageMark, Rotation } from '../../types.ts'

/**
 * 리더가 스스로 옮긴 자리. 리더의 `UpdatedProgress`가 싣고 오는 것과 같은 네 가지다.
 *
 * 이 책의 설정과 저장 시각이 여기 없는 것은 그것을 쓰는 때가 다르기 때문이다.
 * 페이지를 넘기는 것이 설정을 지우지 않는다(`P-302`).
 */
export type SavedProgress = Readonly<{
  page: number
  bookmarks: ReadonlyArray<number>
  marks: ReadonlyArray<PageMark>
  rotation: Rotation
}>

/**
 * 아무것도 되돌릴 것이 없는 레코드인지. 한 번도 연 적 없는 책과, 첫 장에 아무 표시
 * 없이 멈춰 있는 책이 여기서 같아진다 — 둘 다 열었을 때 할 일이 없다.
 */
const isBlank = (progress: BookProgress): boolean =>
  progress.page === 0 &&
  progress.bookmarks.length === 0 &&
  progress.marks.length === 0 &&
  progress.rotation === 0 &&
  progress.settings === null

/** 저장소가 지금 이 책에 대해 말하는 것. 되돌릴 것이 없으면 없음이다. */
const read = (bookId: string): Option.Option<BookProgress> => {
  const stored = Effect.runSync(loadProgress(bookId))
  return isBlank(stored) ? Option.none() : Option.some(stored)
}

/**
 * 네 가지를 갈아 끼워 저장하고, 저장된 뒤의 레코드를 돌려준다.
 *
 * 먼저 읽는 것은 이 책의 설정을 지고 가기 위해서다. 저장할 수 없는 곳이면 방금 만든
 * 값이 그대로 돌아온다 — 이번 세션에서 읽는 사람이 잃는 것은 없다(`P-306`).
 */
const persist = (bookId: string, progress: SavedProgress): BookProgress => {
  const stored = Effect.runSync(loadProgress(bookId))
  const next: BookProgress = { ...stored, ...progress }

  Effect.runSync(writeProgress(bookId, next))

  const written = Effect.runSync(loadProgress(bookId))
  return isBlank(written) ? next : written
}

/**
 * 이 책이 기억하는 자리. 한 번도 연 적 없거나 저장된 것이 더 이상 디코딩되지 않으면
 * 없음이다(`P-304`).
 *
 * 쓰면 그 자리에서 저장된다. 화면이 이 atom을 쥔 채로 쓸 때는 이쪽으로 써야 atom이
 * 뒤처지지 않는다. {@linkcode saveProgress}는 같은 저장을 atom 바깥에서 하는 길이다.
 */
export const progressFor: (
  bookId: string,
) => Atom.Writable<Option.Option<BookProgress>, SavedProgress> = Atom.family((bookId: string) =>
  Atom.writable<Option.Option<BookProgress>, SavedProgress>(
    () => read(bookId),
    (ctx, progress) => {
      ctx.setSelf(Option.some(persist(bookId, progress)))
    },
  ),
)

/**
 * 읽던 자리를 저장한다. 레지스트리가 없는 자리 — 이벤트 핸들러나 구독 — 에서 부른다.
 *
 * 실패하지 않는다. 저장소가 없거나 꽉 차도 삼키므로, 읽는 사람이 멈춰 서지
 * 않는다(`P-306`).
 */
export const saveProgress = (bookId: string, progress: SavedProgress): Effect.Effect<void> =>
  Effect.sync(() => {
    persist(bookId, progress)
  })
