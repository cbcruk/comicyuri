import { Effect } from 'effect'
import { beforeEach, describe, expect, test } from 'vite-plus/test'

import {
  loadProgress,
  loadSettings,
  saveBookSettings,
  saveProgress,
  saveSettings,
} from './storage.ts'
import { defaultSettings } from './types.ts'
import type { BookProgress, BookSettings } from './types.ts'

const run = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect)

const western: BookSettings = {
  direction: 'ltr',
  view: 'spread',
  fit: 'width',
  coverAlone: false,
  singleThreshold: 0.8,
}

const progress: BookProgress = {
  page: 12,
  bookmarks: [3, 7],
  marks: [{ page: 4, binding: 'alone' }],
  settings: null,
  updatedAt: 0,
}

beforeEach(() => {
  localStorage.clear()
})

describe('settings', () => {
  test('what was saved is what comes back', () => {
    const settings = { ...defaultSettings, direction: 'ltr' as const, singleThreshold: 0.8 }
    run(saveSettings(settings))

    expect(run(loadSettings)).toStrictEqual(settings)
  })

  test('nothing saved yet reads as the defaults', () => {
    expect(run(loadSettings)).toStrictEqual(defaultSettings)
  })

  test('a settings blob that no longer decodes falls back rather than reaching the app', () => {
    localStorage.setItem('comicyuri:settings', '{"direction":"sideways"}')

    expect(run(loadSettings)).toStrictEqual(defaultSettings)
  })

  test('a blob written by an older build gains the fields it never had', () => {
    localStorage.setItem('comicyuri:settings', '{"direction":"ltr"}')

    expect(run(loadSettings)).toStrictEqual({ ...defaultSettings, direction: 'ltr' })
  })
})

describe('what a book remembers', () => {
  test('position, bookmarks and bindings survive the round trip', () => {
    run(saveProgress('volume-1::42', progress))
    const read = run(loadProgress('volume-1::42'))

    expect(read.page).toBe(progress.page)
    expect(read.bookmarks).toStrictEqual(progress.bookmarks)
    expect(read.marks).toStrictEqual(progress.marks)
  })

  test('a book nobody has opened reads as page zero with nothing of its own', () => {
    const read = run(loadProgress('volume-9::1'))

    expect(read.page).toBe(0)
    expect(read.bookmarks).toStrictEqual([])
    expect(read.marks).toStrictEqual([])
    expect(read.settings).toBeNull()
  })

  test('settings of its own survive the round trip', () => {
    run(saveBookSettings('volume-1::42', western))

    expect(run(loadProgress('volume-1::42')).settings).toStrictEqual(western)
  })

  test('saving settings keeps the position and bookmarks already stored', () => {
    run(saveProgress('volume-1::42', progress))
    run(saveBookSettings('volume-1::42', western))
    const read = run(loadProgress('volume-1::42'))

    expect(read.page).toBe(progress.page)
    expect(read.bookmarks).toStrictEqual(progress.bookmarks)
    expect(read.settings).toStrictEqual(western)
  })

  test('a record written before books could remember anything still reads', () => {
    localStorage.setItem(
      'comicyuri:progress:volume-1::42',
      '{"page":5,"bookmarks":[1],"updatedAt":0}',
    )
    const read = run(loadProgress('volume-1::42'))

    // 예전 기록이 통째로 기본값으로 떨어지면 읽던 자리까지 잃는다.
    expect(read.page).toBe(5)
    expect(read.bookmarks).toStrictEqual([1])
    expect(read.marks).toStrictEqual([])
    expect(read.settings).toBeNull()
  })

  test('saving stamps the time it was written', () => {
    run(saveProgress('volume-1::42', progress))

    expect(run(loadProgress('volume-1::42')).updatedAt).toBeGreaterThan(0)
  })
})
