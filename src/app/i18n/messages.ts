/**
 * 지금 언어로 문구를 찍는 함수를 컴포넌트에 건네는 자리(`S-151`).
 *
 * 언어는 설정에 적힌 것과 브라우저가 말하는 것으로 정해진다(`resolveLocale`). 컴포넌트는
 * 그 셈을 모르고 키만 말한다.
 */

import { useAtomValue } from '@effect/atom-react'

import { localeAtom } from './atoms.ts'
import { translatorFor } from './format.ts'
import type { Translate } from './format.ts'

/**
 * 지금 언어로 문구를 찍는 함수.
 *
 * @example 메뉴 항목 하나
 * ```tsx
 * import { useMessages } from '../i18n/messages.ts'
 *
 * const ZoomIn = () => {
 *   const t = useMessages()
 *   return <button>{t('item.zoomIn')}</button>
 * }
 * ```
 */
export const useMessages = (): Translate => translatorFor(useAtomValue(localeAtom))
