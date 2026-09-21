/** 화면 언어를 쥐는 atom들(`S-151`). */

import { Atom } from 'effect/unstable/reactivity'
import { Effect } from 'effect'

import type { LocaleSetting } from '../../types.ts'
import { loadSettings, saveSettings } from '../../io/storage.ts'
import { LANGUAGE_TAG, resolveLocale } from './locale.ts'
import type { Locale } from './locale.ts'

/**
 * 설정에 적힌 언어. `auto`가 기본값이다.
 *
 * 첫 값을 그 자리에서 읽는 것은 `localStorage`가 동기이기 때문이다. 테마(`themeAtom`)와
 * 같은 이유로, 첫 글자를 그리기 전에 무슨 언어인지 알아야 한다.
 */
export const localeSettingAtom: Atom.Writable<LocaleSetting> = Atom.make(
  Effect.runSync(loadSettings).locale,
)

/** 지금 화면에 걸린 언어. 설정이 `auto`이면 브라우저가 말하는 언어를 따른다. */
export const localeAtom = Atom.make((get): Locale =>
  resolveLocale(get(localeSettingAtom), navigator.languages),
)

/** 고른 언어를 저장하고 문서 루트의 `lang`에 건다. */
export const applyAndSaveLocale = (setting: LocaleSetting): Effect.Effect<void> =>
  Effect.gen(function* () {
    const settings = yield* loadSettings
    yield* saveSettings({ ...settings, locale: setting })

    applyLanguage(resolveLocale(setting, navigator.languages))
  })

/**
 * 문서 루트에 언어를 적는다.
 *
 * `lang`은 어떤 컴포넌트의 것도 아닌 문서의 속성이다. 글꼴 고르기와 줄바꿈 규칙, 화면
 * 낭독기의 발음이 모두 그것을 본다.
 */
export const applyLanguage = (locale: Locale): void => {
  document.documentElement.lang = LANGUAGE_TAG[locale]
}
