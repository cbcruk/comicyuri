/**
 * 설정 두 층이 저장소를 오가는 길. 레지스트리만 쓰고 React는 없다 —
 * `src/atoms/pages.test.ts`와 같다.
 *
 * 새 레지스트리에서 다시 읽는 것이 곧 새로고침이다. atom이 쥐고 있던 것이 아니라
 * 저장소에 남은 것을 재기 때문이다.
 */

import { Option } from 'effect'
import { AtomRegistry } from 'effect/unstable/reactivity'
import { beforeEach, describe, expect, test } from 'vite-plus/test'

import { Reading } from '../../domain/index.ts'
import { defaultSettings } from '../../types.ts'
import type { BookSettings } from '../../types.ts'
import { bookSettingsFor, settingsAtom } from './settings.ts'

const BOOK_ID = 'volume-1::42'

const western: BookSettings = {
  direction: 'ltr',
  view: 'spread',
  fit: 'width',
  coverAlone: false,
  singleThreshold: 0.8,
  enlargeToFit: false,
  splitWide: true,
}

/** 기억하기를 켜 둔 전역 기본값. 책별 덮어쓰기가 쓰이는 것은 이때뿐이다(`R-2B3`). */
const remembering = { ...defaultSettings, rememberBookSettings: true, theme: 'light' as const }

/** `localStorage`가 아예 없는 곳. 시크릿 창이 그렇게 거절한다. */
const withoutStorage = (run: () => void): void => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('storage is not available here')
    },
  })

  try {
    run()
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'localStorage')
    else Object.defineProperty(globalThis, 'localStorage', original)
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('the global defaults', () => {
  test('what was written is what a later session reads', () => {
    const settings = { ...defaultSettings, direction: 'ltr' as const, slideSeconds: 9 }
    AtomRegistry.make().set(settingsAtom, settings)

    expect(AtomRegistry.make().get(settingsAtom)).toStrictEqual(settings)
  })

  test('nothing written yet reads as the defaults', () => {
    expect(AtomRegistry.make().get(settingsAtom)).toStrictEqual(defaultSettings)
  })

  test('the atom shows what was just written without waiting for a re-read', () => {
    const registry = AtomRegistry.make()
    registry.set(settingsAtom, { ...defaultSettings, view: 'spread' })

    expect(registry.get(settingsAtom).view).toBe('spread')
  })
})

describe('what a book remembers', () => {
  test('a book with nothing of its own has no overrides', () => {
    expect(AtomRegistry.make().get(bookSettingsFor(BOOK_ID))).toStrictEqual(Option.none())
  })

  test('what was written is what a later session reads', () => {
    AtomRegistry.make().set(bookSettingsFor(BOOK_ID), Option.some(western))

    expect(AtomRegistry.make().get(bookSettingsFor(BOOK_ID))).toStrictEqual(Option.some(western))
  })

  test('opening the book lays its overrides over the global defaults', () => {
    const registry = AtomRegistry.make()
    registry.set(settingsAtom, remembering)
    registry.set(bookSettingsFor(BOOK_ID), Option.some(western))

    const later = AtomRegistry.make()
    const merged = Reading.forBook(later.get(settingsAtom), later.get(bookSettingsFor(BOOK_ID)))

    // 책의 생김새를 따르는 것은 책이 정한다.
    expect(merged.direction).toBe('ltr')
    expect(merged.view).toBe('spread')
    expect(merged.splitWide).toBe(true)
    // 읽는 사람의 습관은 전역에 남는다.
    expect(merged.theme).toBe('light')
    expect(merged.slideSeconds).toBe(defaultSettings.slideSeconds)
    expect(merged.rememberBookSettings).toBe(true)
  })

  test('with remembering off, what a book remembers is not used', () => {
    const registry = AtomRegistry.make()
    registry.set(settingsAtom, defaultSettings)
    registry.set(bookSettingsFor(BOOK_ID), Option.some(western))

    const later = AtomRegistry.make()
    const global = later.get(settingsAtom)

    expect(Reading.forBook(global, later.get(bookSettingsFor(BOOK_ID)))).toStrictEqual(global)
  })

  test('flipping the direction in one book does not follow the reader to the next', () => {
    const registry = AtomRegistry.make()
    registry.set(settingsAtom, remembering)
    registry.set(bookSettingsFor(BOOK_ID), Option.some(western))

    const later = AtomRegistry.make()

    expect(later.get(settingsAtom).direction).toBe(defaultSettings.direction)
    expect(later.get(bookSettingsFor('volume-2::7'))).toStrictEqual(Option.none())
  })

  test('letting go of the overrides puts the global defaults back', () => {
    const registry = AtomRegistry.make()
    registry.set(bookSettingsFor(BOOK_ID), Option.some(western))
    registry.set(bookSettingsFor(BOOK_ID), Option.none())

    expect(AtomRegistry.make().get(bookSettingsFor(BOOK_ID))).toStrictEqual(Option.none())
  })
})

describe('a browser that refuses to store anything', () => {
  test('reading falls back to the defaults rather than throwing', () => {
    withoutStorage(() => {
      expect(AtomRegistry.make().get(settingsAtom)).toStrictEqual(defaultSettings)
      expect(AtomRegistry.make().get(bookSettingsFor(BOOK_ID))).toStrictEqual(Option.none())
    })
  })

  test('writing does not throw, and the session keeps what it chose', () => {
    withoutStorage(() => {
      const registry = AtomRegistry.make()

      registry.set(settingsAtom, remembering)
      registry.set(bookSettingsFor(BOOK_ID), Option.some(western))

      expect(registry.get(settingsAtom)).toStrictEqual(remembering)
      expect(registry.get(bookSettingsFor(BOOK_ID))).toStrictEqual(Option.some(western))
    })
  })
})
