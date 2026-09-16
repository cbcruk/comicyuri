/**
 * 책마다 남는 것이 저장소를 오가는 길과, 빠르게 넘길 때 무엇이 보장되는지.
 *
 * 가짜 `localStorage`를 세우는 것은 쓰기를 세기 위해서다. 저장이 묶이거나 미뤄지면
 * 그 수가 줄어드는데, 그것이 이 층이 하지 않기로 한 일이다.
 */

import { Effect, Option } from 'effect'
import { AtomRegistry } from 'effect/unstable/reactivity'
import { beforeEach, describe, expect, test } from 'vite-plus/test'

import { loadProgress, saveBookSettings } from '../../io/storage.ts'
import type { BookSettings } from '../../types.ts'
import { bookSettingsFor } from './settings.ts'
import { progressFor, saveProgress } from './progress.ts'
import type { SavedProgress } from './progress.ts'

const BOOK_ID = 'volume-1::42'

const atPage = (page: number): SavedProgress => ({
  page,
  bookmarks: [],
  marks: [],
  rotation: 0,
})

const western: BookSettings = {
  direction: 'ltr',
  view: 'spread',
  fit: 'width',
  coverAlone: false,
  singleThreshold: 0.8,
  enlargeToFit: false,
  splitWide: true,
}

/** 진짜 `localStorage`를 대신하되, 쓰기를 세는 사본. */
const countingStorage = (): { writes: ReadonlyArray<string>; restore: () => void } => {
  const rows = new Map<string, string>()
  const writes: Array<string> = []
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(value)
        rows.set(key, value)
      },
      removeItem: (key: string) => rows.delete(key),
      clear: () => rows.clear(),
    },
  })

  return {
    writes,
    restore: () => {
      if (original === undefined) Reflect.deleteProperty(globalThis, 'localStorage')
      else Object.defineProperty(globalThis, 'localStorage', original)
    },
  }
}

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

describe('what a book remembers', () => {
  test('a book nobody has opened remembers nothing', () => {
    expect(AtomRegistry.make().get(progressFor(BOOK_ID))).toStrictEqual(Option.none())
  })

  test('position, bookmarks, bindings and rotation survive the round trip', () => {
    AtomRegistry.make().set(progressFor(BOOK_ID), {
      page: 12,
      bookmarks: [3, 7],
      marks: [{ page: 4, binding: 'alone' }],
      rotation: 90,
    })

    const read = AtomRegistry.make().get(progressFor(BOOK_ID))

    expect(Option.map(read, (progress) => progress.page)).toStrictEqual(Option.some(12))
    expect(Option.map(read, (progress) => progress.bookmarks)).toStrictEqual(Option.some([3, 7]))
    expect(Option.map(read, (progress) => progress.marks)).toStrictEqual(
      Option.some([{ page: 4, binding: 'alone' }]),
    )
    expect(Option.map(read, (progress) => progress.rotation)).toStrictEqual(Option.some(90))
  })

  test('saveProgress writes the same record the atom does', () => {
    Effect.runSync(saveProgress(BOOK_ID, atPage(5)))

    expect(Option.map(AtomRegistry.make().get(progressFor(BOOK_ID)), (p) => p.page)).toStrictEqual(
      Option.some(5),
    )
  })

  test('the atom shows what was just written without waiting for a re-read', () => {
    const registry = AtomRegistry.make()
    registry.set(progressFor(BOOK_ID), atPage(8))

    expect(Option.map(registry.get(progressFor(BOOK_ID)), (p) => p.page)).toStrictEqual(
      Option.some(8),
    )
  })
})

describe('turning pages fast', () => {
  test('every turn is written, and the last one is what is stored', () => {
    const storage = countingStorage()

    try {
      const registry = AtomRegistry.make()
      for (const page of [1, 2, 3, 4, 5]) registry.set(progressFor(BOOK_ID), atPage(page))

      expect(storage.writes).toHaveLength(5)
      expect(Effect.runSync(loadProgress(BOOK_ID)).page).toBe(5)
    } finally {
      storage.restore()
    }
  })

  test('turning a page does not erase the settings the book remembers', () => {
    Effect.runSync(saveBookSettings(BOOK_ID, western))
    Effect.runSync(saveProgress(BOOK_ID, atPage(3)))

    expect(AtomRegistry.make().get(bookSettingsFor(BOOK_ID))).toStrictEqual(Option.some(western))
  })

  test('changing the settings does not erase the position already stored', () => {
    const registry = AtomRegistry.make()
    registry.set(progressFor(BOOK_ID), atPage(11))
    registry.set(bookSettingsFor(BOOK_ID), Option.some(western))

    expect(Option.map(AtomRegistry.make().get(progressFor(BOOK_ID)), (p) => p.page)).toStrictEqual(
      Option.some(11),
    )
  })
})

describe('a browser that refuses to store anything', () => {
  test('saving does not throw into the reader', () => {
    withoutStorage(() => {
      expect(() => Effect.runSync(saveProgress(BOOK_ID, atPage(4)))).not.toThrow()
      expect(AtomRegistry.make().get(progressFor(BOOK_ID))).toStrictEqual(Option.none())
    })
  })

  test('the session keeps the position it wrote through the atom', () => {
    withoutStorage(() => {
      const registry = AtomRegistry.make()
      registry.set(progressFor(BOOK_ID), atPage(6))

      expect(Option.map(registry.get(progressFor(BOOK_ID)), (p) => p.page)).toStrictEqual(
        Option.some(6),
      )
    })
  })
})
