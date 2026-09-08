import { Effect, Option, Stream } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { isReaderKey } from './keys.ts'
import { subscriptions } from './subscription.ts'

const NO_MODIFIERS = { ctrl: false, meta: false, alt: false }

describe('the chrome wait', () => {
  test('waits before it says the reader has gone idle', async () => {
    // `Stream.tick` emits at once, so a wait built on it would hide the chrome
    // the instant it appeared. Nothing may arrive in the first fraction of it.
    const dependencies = { isChromeVisible: true, activityToken: 3 }
    const idle = subscriptions.chromeIdle.dependenciesToStream(dependencies, () => dependencies)

    const early = await Effect.runPromise(
      Stream.runHead(idle).pipe(Effect.timeoutOption('300 millis')),
    )

    expect(Option.isNone(early)).toBe(true)
  })

  test('says nothing at all while the chrome is already hidden', async () => {
    const dependencies = { isChromeVisible: false, activityToken: 3 }
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
