/**
 * 리더가 브라우저에서 듣는 것 가운데, 값으로 답할 수 있는 것들.
 *
 * 리스너를 걸고 떼는 일은 화면 쪽 훅이 맡으므로, 여기서 재는 것은 그 훅이 무엇을 키로
 * 삼아야 하는지와 도착한 이벤트 하나가 무엇으로 풀리는지다. 슬라이드쇼의 기다림이
 * 앞의 것이고, 리더가 어떤 키에서 물러나는지(`R-265`)가 뒤의 것이다.
 */

import { Option } from 'effect'
import { describe, expect, test } from 'vite-plus/test'

import { defaultSettings } from '../types.ts'
import { Message } from './message.ts'
import { init } from './model.ts'
import type { Model } from './model.ts'
import { messageForKeydown, slideshowWait } from './subscription.ts'

/** 넓은 페이지를 반씩 읽으며 도는 중인 리더. 4페이지에 서 있다. */
const playing: Model = {
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

describe('what the slideshow wait is tied to', () => {
  test('moving to the other half of a page starts the wait again', () => {
    expect(slideshowWait({ ...playing, half: 'second' })).not.toStrictEqual(slideshowWait(playing))
  })

  test('turning to another page starts the wait again', () => {
    expect(slideshowWait({ ...playing, page: 4 })).not.toStrictEqual(slideshowWait(playing))
  })

  test('a reader that is not playing is not waiting for anything', () => {
    expect(slideshowWait({ ...playing, isPlaying: false })).toStrictEqual(Option.none())
  })
})

describe('the keys the reader takes from the browser', () => {
  /**
   * 그 요소 위에서 누른 키 하나. 아직 아무도 가져가지 않았다.
   *
   * @param code 물리 키 자리(`KeyB`). 입력기가 `key`를 바꿔 놓는 경우를 흉내 낼 때 준다.
   */
  const keydownOn = (target: Element, key: string, code = ''): KeyboardEvent => {
    document.body.append(target)
    const event = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event
  }

  test('a key pressed on the page itself turns it', () => {
    const event = keydownOn(document.createElement('main'), 'ArrowLeft')

    expect(messageForKeydown(event)).toStrictEqual(
      Option.some(Message.PressedKey({ key: 'ArrowLeft', withShift: false })),
    )
  })

  // 메뉴바 위의 화살표는 옆 메뉴로 걸어가는 키다. 양보하지 않으면 한 번 누른 키에
  // 메뉴도 옮겨 가고 페이지도 넘어간다(`R-265`).
  test('a key pressed on a menu trigger is not the reader’s', () => {
    const trigger = document.createElement('button')
    trigger.setAttribute('role', 'menuitem')

    expect(messageForKeydown(keydownOn(trigger, 'ArrowLeft'))).toStrictEqual(Option.none())
  })

  // 한글 입력 상태에서 `b` 자리를 누르면 `key`는 `ㅠ`다. 자리(`code`)는 그대로 `KeyB`이므로
  // 그 자리의 글자로 읽는다.
  test('a letter key typed in Hangul still means its letter', () => {
    const event = keydownOn(document.createElement('main'), 'ㅠ', 'KeyB')

    expect(messageForKeydown(event)).toStrictEqual(
      Option.some(Message.PressedKey({ key: 'b', withShift: false })),
    )
    expect(event.defaultPrevented).toBe(true)
  })

  test('and so does one the input method is still composing', () => {
    const event = keydownOn(document.createElement('main'), 'Process', 'KeyD')

    expect(messageForKeydown(event)).toStrictEqual(
      Option.some(Message.PressedKey({ key: 'd', withShift: false })),
    )
  })

  // 드보락 자판에서 `d`가 찍힌 키의 자리는 `KeyH`다. 라틴 글자가 들어오면 찍힌 글자를 따른다
  // — 자리를 따르면 방향을 뒤집으려다 메뉴바를 숨긴다.
  test('a Latin letter from another layout keeps the letter printed on the key', () => {
    const event = keydownOn(document.createElement('main'), 'd', 'KeyH')

    expect(messageForKeydown(event)).toStrictEqual(
      Option.some(Message.PressedKey({ key: 'd', withShift: false })),
    )
  })

  test('a key someone has already taken is not the reader’s', () => {
    const event = keydownOn(document.createElement('main'), 'ArrowLeft')
    event.preventDefault()

    expect(messageForKeydown(event)).toStrictEqual(Option.none())
  })
})
