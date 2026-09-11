import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../types.ts'
import type { BookSettings, Settings } from '../types.ts'
import { bookPartOf, forBook, opening, split } from './reading.ts'

const remembering: Settings = { ...defaultSettings, rememberBookSettings: true }

const western: BookSettings = {
  ...bookPartOf(defaultSettings),
  direction: 'ltr',
  view: 'spread',
}

describe('opening a book', () => {
  test('a book with nothing of its own opens on the global defaults', () => {
    expect(forBook(remembering, Option.none())).toStrictEqual(remembering)
  })

  test('a book with settings of its own opens on those', () => {
    const settings = forBook(remembering, Option.some(western))

    expect(settings.direction).toBe('ltr')
    expect(settings.view).toBe('spread')
    // 책이 정하지 않는 것은 전역에서 온다.
    expect(settings.theme).toBe(remembering.theme)
    expect(settings.atBookEnd).toBe(remembering.atBookEnd)
  })

  test('with the switch off, what a book remembers is not used', () => {
    expect(forBook(defaultSettings, Option.some(western))).toStrictEqual(defaultSettings)
  })
})

describe('where a book opens', () => {
  const withResume = (resume: Settings['resume']): Settings => ({ ...defaultSettings, resume })

  test('by default the saved position is taken without asking', () => {
    expect(opening(withResume('continue'), 41)).toStrictEqual({
      page: 41,
      maybeOffer: Option.none(),
    })
  })

  test('set to start over, the saved position is ignored rather than forgotten', () => {
    expect(opening(withResume('restart'), 41)).toStrictEqual({
      page: 0,
      maybeOffer: Option.none(),
    })
  })

  test('set to ask, the book opens at the start and offers the saved position', () => {
    expect(opening(withResume('ask'), 41)).toStrictEqual({
      page: 0,
      maybeOffer: Option.some(41),
    })
  })

  test('a book left on its first page has nothing to ask about', () => {
    expect(opening(withResume('ask'), 0)).toStrictEqual({
      page: 0,
      maybeOffer: Option.none(),
    })
  })
})

describe('saving what changed', () => {
  test('with the switch off everything goes to the global settings', () => {
    const changed: Settings = { ...defaultSettings, direction: 'ltr' }
    const { global, maybeBook } = split(defaultSettings, changed)

    expect(global).toStrictEqual(changed)
    expect(maybeBook._tag).toBe('None')
  })

  test('what follows the shape of a book goes to the book', () => {
    const changed: Settings = { ...remembering, direction: 'ltr', view: 'spread' }
    const { maybeBook } = split(remembering, changed)

    expect(Option.getOrNull(maybeBook)).toStrictEqual(western)
  })

  test('flipping the direction in one book does not follow the reader to the next', () => {
    const changed: Settings = { ...remembering, direction: 'ltr' }
    const { global } = split(remembering, changed)

    expect(global.direction).toBe(remembering.direction)
  })

  test('a reading habit still goes to the global settings while remembering', () => {
    const changed: Settings = { ...remembering, atBookEnd: 'stop', theme: 'light' }
    const { global } = split(remembering, changed)

    expect(global.atBookEnd).toBe('stop')
    expect(global.theme).toBe('light')
  })

  test('turning remembering on writes the settings in hand to the book', () => {
    const turnedOn: Settings = { ...defaultSettings, direction: 'ltr', rememberBookSettings: true }
    const { maybeBook } = split(defaultSettings, turnedOn)

    expect(Option.map(maybeBook, (book) => book.direction)).toStrictEqual(Option.some('ltr'))
  })

  test('what a book saved is what it opens with again', () => {
    const changed: Settings = { ...remembering, fit: 'width' }
    const { global, maybeBook } = split(remembering, changed)

    expect(forBook(global, maybeBook)).toStrictEqual(changed)
  })
})
