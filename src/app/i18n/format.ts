/**
 * 문구 하나를 화면의 언어로 찍어 내는 자리(`S-151`).
 *
 * 형식은 ICU MessageFormat이고, 찍는 것은 `intl-messageformat`이다. Astryx가 제 문구에 쓰는
 * 것과 같은 엔진이라 i18n 런타임이 둘 서지 않는다. 복수형·성별·숫자·날짜의 규칙은 언어마다
 * 다르고, 그것을 손으로 적는 대신 검증된 구현에 맡긴다.
 *
 * Astryx의 `useTranslator`를 쓰지 않는 이유는 그것이 React 훅이기 때문이다. 이 앱은 화면
 * 밖(atom과 실패 문구)에서도 문구가 필요하다.
 */

import IntlMessageFormat from 'intl-messageformat'

import { en } from './en.ts'
import { ko } from './ko.ts'
import { LANGUAGE_TAG } from './locale.ts'
import type { Locale } from './locale.ts'

/** 카탈로그가 아는 키. 영어 카탈로그가 그 목록의 원천이다. */
export type MessageKey = keyof typeof en

/** 문구에 끼워 넣을 값들. ICU가 이름으로 찾는다. */
export type MessageValues = Readonly<Record<string, string | number>>

/** 키 하나를 지금 언어의 문장으로 바꾸는 함수. */
export type Translate = (key: MessageKey, values?: MessageValues) => string

const CATALOGS: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en, ko }

/**
 * 파싱해 둔 포맷터. ICU 문자열을 파싱하는 값이 싸지 않아, 키와 언어로 한 번만 짓는다.
 *
 * 키는 유한하고 언어도 둘이라 크기가 저절로 묶인다.
 */
const formatters = new Map<string, IntlMessageFormat>()

const formatterFor = (locale: Locale, key: MessageKey): IntlMessageFormat => {
  const cacheKey = `${locale}::${key}`
  const cached = formatters.get(cacheKey)
  if (cached !== undefined) return cached

  const made = new IntlMessageFormat(CATALOGS[locale][key], LANGUAGE_TAG[locale])
  formatters.set(cacheKey, made)
  return made
}

/**
 * 그 언어로 문구를 찍는 함수.
 *
 * @example 복수형이 걸린 문구
 * ```ts
 * import { translatorFor } from './format.ts'
 *
 * const t = translatorFor('en')
 * t('shelf.pages', { count: 1 }) // '1 page'
 * t('shelf.pages', { count: 6 }) // '6 pages'
 * ```
 */
export const translatorFor =
  (locale: Locale): Translate =>
  (key, values) =>
    String(formatterFor(locale, key).format(values))
