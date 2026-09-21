/** 화면 문구의 언어를 정하는 자리(`S-151`). */

import type { LocaleSetting } from '../../types.ts'

/** 문구를 가지고 있는 언어들. 설정의 `auto`는 이 가운데 하나로 풀린다. */
export const LOCALES = ['en', 'ko'] as const

/** {@linkcode LOCALES}의 한 칸. 카탈로그가 있는 언어다. */
export type Locale = (typeof LOCALES)[number]

/** 그 언어를 BCP 47 태그로. `<html lang>`과 Astryx에 넘기는 값이다. */
export const LANGUAGE_TAG: Readonly<Record<Locale, string>> = {
  en: 'en',
  ko: 'ko-KR',
}

/**
 * 설정과 브라우저가 말하는 언어로 화면 언어를 정한다.
 *
 * `auto`는 브라우저가 미리 순서를 매겨 둔 언어 목록(`navigator.languages`)을 앞에서부터
 * 훑어, 카탈로그가 있는 첫 언어를 고른다. 지역 태그는 앞자리만 본다 — `ko-KR`도 `ko`도
 * 한국어다. 아는 언어가 하나도 없으면 영어다.
 *
 * @param setting 설정에 적힌 것. `auto`가 기본값이다.
 * @param languages 브라우저가 말하는 언어들, 좋아하는 순서대로.
 */
export const resolveLocale = (setting: LocaleSetting, languages: ReadonlyArray<string>): Locale => {
  if (setting !== 'auto') return setting

  for (const language of languages) {
    const found = LOCALES.find((locale) => language.toLowerCase().split('-')[0] === locale)
    if (found !== undefined) return found
  }

  return 'en'
}
