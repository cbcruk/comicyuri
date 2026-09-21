/**
 * 지금 언어의 문구를 컴포넌트에 건네는 자리(`S-151`).
 *
 * 언어는 설정에 적힌 것과 브라우저가 말하는 것으로 정해진다(`resolveLocale`). 컴포넌트는
 * 그 셈을 모르고 문구만 받는다.
 */

import { useAtomValue } from '@effect/atom-react'

import { localeAtom } from './atoms.ts'
import { en } from './en.ts'
import type { Catalog } from './en.ts'
import { ko } from './ko.ts'
import type { Locale } from './locale.ts'

/** 그 언어의 카탈로그. */
export const catalogFor = (locale: Locale): Catalog => (locale === 'ko' ? ko : en)

/**
 * 지금 언어의 문구.
 *
 * @example 메뉴 항목 하나
 * ```tsx
 * import { useMessages } from '../i18n/messages.ts'
 *
 * const ZoomIn = () => <button>{useMessages().item.zoomIn}</button>
 * ```
 */
export const useMessages = (): Catalog => catalogFor(useAtomValue(localeAtom))
