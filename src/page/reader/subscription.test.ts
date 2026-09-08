import { Effect, Option, Stream } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../../types.ts'
import { isReaderKey } from './keys.ts'
import { init } from './model.ts'
import { subscriptions } from './subscription.ts'

const NO_MODIFIERS = { ctrl: false, meta: false, alt: false }

describe('the chrome wait', () => {
  test('waits before it says the reader has gone idle', async () => {
    // `Stream.tick` emits at once, so a wait built on it would hide the chrome
    // the instant it appeared. Nothing may arrive in the first fraction of it.
    const dependencies = { isWaiting: true, activityToken: 3 }
    const idle = subscriptions.chromeIdle.dependenciesToStream(dependencies, () => dependencies)

    const early = await Effect.runPromise(
      Stream.runHead(idle).pipe(Effect.timeoutOption('300 millis')),
    )

    expect(Option.isNone(early)).toBe(true)
  })

  test('says nothing while there is nothing to hide', async () => {
    // Either the chrome is already down, or the thumbnail grid is up and it
    // must stay put until the grid closes.
    const dependencies = { isWaiting: false, activityToken: 3 }
    const idle = subscriptions.chromeIdle.dependenciesToStream(dependencies, () => dependencies)

    expect(await Effect.runPromise(Stream.runHead(idle))).toStrictEqual(Option.none())
  })
})

describe('which keys belong to the reader', () => {
  test('the keys the reader acts on', () => {
    for (const key of [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      ' ',
      'Home',
      'End',
      'Escape',
      'd',
      'v',
      'f',
      't',
      'b',
      '+',
      '-',
    ]) {
      expect(isReaderKey(key, NO_MODIFIERS)).toBe(true)
    }
  })

  test('a key held with a modifier belongs to the browser', () => {
    // Ctrl+R reloads, Cmd+F searches. Taking the bare key must not take these.
    expect(isReaderKey('f', { ...NO_MODIFIERS, ctrl: true })).toBe(false)
    expect(isReaderKey('f', { ...NO_MODIFIERS, meta: true })).toBe(false)
    expect(isReaderKey('ArrowLeft', { ...NO_MODIFIERS, alt: true })).toBe(false)
  })

  test('everything else falls through to the browser', () => {
    for (const key of ['r', 'F5', 'Tab', 'a', 'Enter', '/']) {
      expect(isReaderKey(key, NO_MODIFIERS)).toBe(false)
    }
  })
})

describe('what the chrome wait is gated on', () => {
  const reading = init({
    bookId: 'volume-1::42',
    page: 0,
    bookmarks: [],
    settings: defaultSettings,
  })

  test('it waits while the chrome is up and the grid is closed', () => {
    expect(subscriptions.chromeIdle.modelToDependencies(reading)).toStrictEqual({
      isWaiting: true,
      activityToken: 0,
    })
  })

  test('it does not run out from under an open grid', () => {
    expect(
      subscriptions.chromeIdle.modelToDependencies({
        ...reading,
        isThumbsOpen: true,
      }).isWaiting,
    ).toBe(false)
  })

  test('it has nothing to do once the chrome is down', () => {
    expect(
      subscriptions.chromeIdle.modelToDependencies({
        ...reading,
        isChromeVisible: false,
      }).isWaiting,
    ).toBe(false)
  })
})

describe('a pointer resting on the chrome', () => {
  const reading = init({
    bookId: 'volume-1::42',
    page: 0,
    bookmarks: [],
    settings: defaultSettings,
  })

  test('holds the wait for as long as it is there', () => {
    expect(
      subscriptions.chromeIdle.modelToDependencies({
        ...reading,
        isPointerOverChrome: true,
      }).isWaiting,
    ).toBe(false)
  })

  test('and the wait resumes once it leaves', () => {
    expect(
      subscriptions.chromeIdle.modelToDependencies({
        ...reading,
        isPointerOverChrome: false,
      }).isWaiting,
    ).toBe(true)
  })
})
