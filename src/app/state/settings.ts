/**
 * 저장되는 설정 두 층. 전역 기본값(`P-303`)과 책 하나에만 걸린 덮어쓰기(`R-2B3`)다.
 *
 * 값을 그 자리에서 읽는 것은 `localStorage`가 동기이기 때문이다 — `shelfAtoms.ts`의
 * `themeAtom`과 같은 이유로, 화면이 기다리며 보여 줄 중간 상태가 없다.
 *
 * 두 층을 합치는 일은 여기 없다. 열 때 어떻게 겹치는지는 `Reading.forBook`이, 저장할
 * 때 어떻게 가르는지는 `Reading.split`이 이미 정한다.
 */

import { Effect, Option } from 'effect'
import { Atom } from 'effect/unstable/reactivity'

import { loadProgress, loadSettings, saveBookSettings, saveSettings } from '../../io/storage.ts'
import type { BookSettings, Settings } from '../../types.ts'

/**
 * 전역 기본값. 처음 읽을 때 `localStorage`에서 오고, 쓰면 그 자리에서 저장된다(`P-303`).
 *
 * 저장할 수 없는 곳(시크릿 창)에서도 쓰기가 던지지 않는다. 쓴 값은 이 세션 동안
 * atom에 그대로 남고, 다음 세션에 없을 뿐이다(`P-306`).
 */
export const settingsAtom: Atom.Writable<Settings> = Atom.writable(
  () => Effect.runSync(loadSettings),
  (ctx, settings: Settings) => {
    Effect.runSync(saveSettings(settings))
    ctx.setSelf(settings)
  },
)

/**
 * 책 하나에만 걸린 설정. 없으면 `None`이고, 그때 리더는 전역 기본값만 받는다(`R-2B3`).
 *
 * 쓰기는 읽던 자리와 북마크를 건드리지 않는다. `None`을 쓰는 것은 이 책이 정해 둔
 * 것을 놓는다는 뜻이며, 기억하기 스위치를 끌 때가 그때다.
 *
 * 여기서 나온 값은 `Reading.forBook`에 그대로 넘긴다. 기억하기가 꺼져 있으면
 * 그쪽이 이 값을 쓰지 않으므로, 꺼진 동안 남아 있는 것을 여기서 가릴 필요가 없다.
 */
export const bookSettingsFor: (bookId: string) => Atom.Writable<Option.Option<BookSettings>> =
  Atom.family((bookId: string) =>
    Atom.writable<Option.Option<BookSettings>, Option.Option<BookSettings>>(
      () => Option.fromNullishOr(Effect.runSync(loadProgress(bookId)).settings),
      (ctx, maybeSettings) => {
        Effect.runSync(saveBookSettings(bookId, Option.getOrNull(maybeSettings)))
        ctx.setSelf(maybeSettings)
      },
    ),
  )
