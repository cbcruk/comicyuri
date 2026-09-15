import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../../types.ts'
import { handlesKeysItself, isReaderKey } from './keys.ts'
import { init } from './model.ts'
import { subscriptions } from './subscription.ts'

const NO_MODIFIERS = { ctrl: false, meta: false, alt: false }

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

describe('what the slideshow wait is tied to', () => {
  const playing = {
    ...init({
      bookId: 'volume-1::42',
      page: 3,
      maybeResumePage: Option.none(),
      bookmarks: [],
      marks: [],
      rotation: 0,
      maybeBookSettings: Option.none(),
      settings: { ...defaultSettings, splitWide: true },
    }),
    isPlaying: true,
  }

  test('moving to the other half of a page starts the wait again', () => {
    expect(
      subscriptions.slideshow.modelToDependencies({ ...playing, half: 'second' }),
    ).not.toStrictEqual(subscriptions.slideshow.modelToDependencies(playing))
  })
})
