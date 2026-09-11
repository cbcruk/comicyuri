import { Effect, Option, Stream } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../../types.ts'
import { handlesKeysItself, isReaderKey } from './keys.ts'
import { init } from './model.ts'
import { subscriptions } from './subscription.ts'

const NO_MODIFIERS = { ctrl: false, meta: false, alt: false }

describe('the chrome wait', () => {
  test('waits before it says the reader has gone idle', async () => {
    // `Stream.tick`은 곧바로 한 번 흘리므로, 그 위에 세운 대기는 툴바가 나타나는
    // 순간 숨겨 버린다. 대기의 첫 조각 동안에는 아무것도 오지 않아야 한다.
    const dependencies = { isWaiting: true, activityToken: 3 }
    const idle = subscriptions.chromeIdle.dependenciesToStream(dependencies, () => dependencies)

    const early = await Effect.runPromise(
      Stream.runHead(idle).pipe(Effect.timeoutOption('300 millis')),
    )

    expect(Option.isNone(early)).toBe(true)
  })

  test('says nothing while there is nothing to hide', async () => {
    // 툴바가 이미 내려가 있거나, 썸네일 격자가 열려 있어서 격자가 닫힐 때까지
    // 그대로 있어야 하는 경우다.
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
      'r',
      'p',
      '[',
      ']',
      '+',
      '-',
    ]) {
      expect(isReaderKey(key, NO_MODIFIERS)).toBe(true)
    }
  })

  test('a key held with a modifier belongs to the browser', () => {
    // Ctrl+R은 새로고침, Cmd+F는 찾기다. 맨 키를 가져간다고 이것까지 가져가서는 안 된다.
    expect(isReaderKey('f', { ...NO_MODIFIERS, ctrl: true })).toBe(false)
    expect(isReaderKey('f', { ...NO_MODIFIERS, meta: true })).toBe(false)
    expect(isReaderKey('ArrowLeft', { ...NO_MODIFIERS, alt: true })).toBe(false)
  })

  test('everything else falls through to the browser', () => {
    for (const key of ['F5', 'Tab', 'a', 'Enter', '/']) {
      expect(isReaderKey(key, NO_MODIFIERS)).toBe(false)
    }
  })
})

describe('who answers a key first', () => {
  const element = (html: string): Element => {
    const host = document.createElement('div')
    host.innerHTML = html
    const found = host.firstElementChild
    if (found === null) throw new Error('nothing to test')
    return found
  }

  test('the page slider keeps the keys it handles', () => {
    // 화살표에 슬라이더가 스스로 움직이므로, 리더의 document 리스너는 물러나야
    // 한다. 그러지 않으면 한 번 누른 키가 두 번 세어진다.
    expect(handlesKeysItself(element('<div role="slider"></div>'))).toBe(true)
  })

  test('and so does anything inside it', () => {
    expect(
      handlesKeysItself(element('<div role="slider"><span>thumb</span></div>').firstElementChild),
    ).toBe(true)
  })

  test('everything else leaves the key to the reader', () => {
    expect(handlesKeysItself(element('<button>Next</button>'))).toBe(false)
    expect(handlesKeysItself(null)).toBe(false)
    expect(handlesKeysItself(document)).toBe(false)
  })
})

describe('what the chrome wait is gated on', () => {
  const reading = init({
    bookId: 'volume-1::42',
    page: 0,
    bookmarks: [],
    marks: [],
    rotation: 0,
    maybeBookSettings: Option.none(),
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
    marks: [],
    rotation: 0,
    maybeBookSettings: Option.none(),
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
